import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import net from 'net';
import dns from 'dns';
import mc from 'minecraft-protocol';
import * as storage from './storage.js';
import { BotManager } from './botManager.js';
import { BotPool } from './botPool.js';
import { analyzeEconomy, generateAiPrompt, generateMarkdownReport } from './economyAnalyzer.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: '*' }
});

const PORT = parseInt(process.env.SERVER_PORT || process.env.PORT || process.env.DASHBOARD_PORT || '3000', 10);

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Initialize Multi-Bot Pool
const botPool = new BotPool(storage);

// Helper to resolve target bot from route params, query, body, headers, or active fallback
function getTargetBot(req) {
  const id = req.params?.id || req.query?.botId || req.body?.botId || req.headers?.['x-bot-id'];
  const bot = botPool.getBot(id);
  if (!bot) {
    throw new Error(`Bot "${id || 'active'}" not found`);
  }
  return bot;
}

// Process-level guards against unexpected library-level network drops
process.on('uncaughtException', (err) => {
  const msg = err?.message || String(err);
  if (msg.includes("Unsupported protocol version '-1'") || msg.includes("version '-1'")) {
    console.warn('[Server Guard] Server returned offline protocol version -1 (offline or sleeping).');
    botPool.emit('bot:log', { 
      type: 'warn', 
      text: '⚠️ Target server returned offline protocol version -1 (server is currently offline or sleeping). Preparing recovery...' 
    });
    return;
  }
  console.warn('[Server Guard] Caught exception:', msg);
  botPool.emit('bot:log', { type: 'error', text: `Connection/Network error: ${msg}. Initiating automatic recovery...` });
});

process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || String(reason);
  if (msg.includes("Unsupported protocol version '-1'") || msg.includes("version '-1'")) {
    console.warn('[Server Guard] Server returned offline protocol version -1 (offline or sleeping).');
    botPool.emit('bot:log', { 
      type: 'warn', 
      text: '⚠️ Target server returned offline protocol version -1 (server is currently offline or sleeping). Preparing recovery...' 
    });
    return;
  }
  console.warn('[Server Guard] Unhandled rejection:', msg);
  botPool.emit('bot:log', { type: 'error', text: `Connection rejection: ${msg}. Initiating automatic recovery...` });
});

// Wire Multi-Bot Events to WebSockets
botPool.on('bot:status', (status) => io.emit('bot:status', status));
botPool.on('bot:chat', (msg) => io.emit('bot:chat', msg));
botPool.on('bot:log', (log) => io.emit('bot:log', log));
botPool.on('bot:settings', (settings) => io.emit('bot:settings', settings));
botPool.on('bot:inventory', (inv) => io.emit('bot:inventory', inv));
botPool.on('bot:stateChange', (sc) => io.emit('bot:stateChange', sc));
botPool.on('bots:updated', (bots) => io.emit('bots:updated', bots));
botPool.on('bots:activeChanged', (d) => io.emit('bots:activeChanged', d));
botPool.on('shop:progress', (data) => io.emit('shop:progress', data));
botPool.on('shop:complete', (catalog) => io.emit('shop:complete', catalog));
botPool.on('shop:stopped', (data) => io.emit('shop:stopped', data));
botPool.on('shop:error', (data) => io.emit('shop:error', data));

// Multi-Bot Management API
app.get('/api/bots', (req, res) => {
  res.json(botPool.getBotSummaries());
});

app.post('/api/bots', (req, res) => {
  try {
    const bot = botPool.addBot(req.body);
    res.json({ success: true, bot: bot.getStatus(), bots: botPool.getBotSummaries() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/bots/:id', (req, res) => {
  try {
    const ok = botPool.removeBot(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Bot not found' });
    res.json({ success: true, bots: botPool.getBotSummaries() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/bots/:id/active', (req, res) => {
  const ok = botPool.setActiveBot(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Bot not found' });
  res.json({ success: true, activeBotId: botPool.activeBotId });
});

app.post('/api/bots/:id', (req, res) => {
  try {
    const bot = getTargetBot(req);
    const updates = req.body || {};
    if (updates.name) bot.botName = updates.name;
    if (updates.username) bot.botConfig.username = updates.username;
    if (updates.loginPassword !== undefined) bot.botConfig.loginPassword = updates.loginPassword;
    if (updates.afterLoginCommand !== undefined) {
      bot.afterLoginCommand = String(updates.afterLoginCommand || '').trim();
      bot.botConfig.afterLoginCommand = bot.afterLoginCommand;
    }
    if (updates.autoLogin !== undefined) bot.botConfig.autoLogin = !!updates.autoLogin;
    if (updates.host) bot.botConfig.host = updates.host;
    if (updates.port) bot.botConfig.port = Number(updates.port);
    if (updates.version) bot.botConfig.version = updates.version;

    botPool.storage.saveBot({
      ...bot.botConfig,
      id: bot.botId,
      name: bot.botName,
      afterLoginCommand: bot.afterLoginCommand
    });

    botPool.emit('bots:updated', botPool.getBotSummaries());
    res.json({ success: true, bot: bot.getStatus(), bots: botPool.getBotSummaries() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/bots/connect-all', async (req, res) => {
  try {
    const results = await botPool.connectAll(req.body);
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bots/disconnect-all', (req, res) => {
  botPool.disconnectAll();
  res.json({ success: true, message: 'All bots disconnected' });
});

// Bot-Specific & Backward-Compatible API Routes
app.get(['/api/bots/:id/status', '/api/status'], (req, res) => {
  try {
    const bot = getTargetBot(req);
    res.json(bot.getStatus());
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.get(['/api/bots/:id/logs', '/api/logs'], (req, res) => {
  try {
    const bot = getTargetBot(req);
    res.json(bot.getLogs());
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.get(['/api/bots/:id/inventory', '/api/inventory'], (req, res) => {
  try {
    const bot = getTargetBot(req);
    res.json(bot.getInventory());
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.post(['/api/bots/:id/connect', '/api/bot/connect'], (req, res) => {
  try {
    const bot = getTargetBot(req);
    const body = req.body || {};
    const host = body.host || bot.botConfig?.host;
    const port = body.port || bot.botConfig?.port;
    const username = body.username || bot.botConfig?.username;
    const version = body.version || bot.botConfig?.version;
    const loginPassword = body.loginPassword !== undefined ? body.loginPassword : bot.botConfig?.loginPassword;
    const autoLogin = body.autoLogin !== undefined ? body.autoLogin : bot.botConfig?.autoLogin;
    if (body.afterLoginCommand !== undefined) {
      bot.afterLoginCommand = String(body.afterLoginCommand || '').trim();
      bot.botConfig.afterLoginCommand = bot.afterLoginCommand;
      botPool.storage.saveBot({
        ...bot.botConfig,
        id: bot.botId,
        name: bot.botName,
        afterLoginCommand: bot.afterLoginCommand
      });
    }
    if (!host) {
      return res.status(400).json({ error: 'Server host is required' });
    }
    bot.connect({ host, port, username, version, loginPassword, autoLogin });
    res.json({ success: true, message: `Connection initiated for ${bot.botName}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/bots/:id/disconnect', '/api/bot/disconnect'], (req, res) => {
  try {
    const bot = getTargetBot(req);
    bot.disconnect();
    res.json({ success: true, message: `Disconnected ${bot.botName}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/bots/:id/action', '/api/bot/action'], (req, res) => {
  try {
    const bot = getTargetBot(req);
    const { action } = req.body;
    bot.manualAction(action);
    res.json({ success: true, action });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post(['/api/bots/:id/hand-action', '/api/bot/hand-action'], async (req, res) => {
  try {
    const bot = getTargetBot(req);
    const { action, slot, offHand, intervalMs, all } = req.body;
    let result = { success: true };
    switch (action) {
      case 'set_hotbar':
      case 'set_slot':
        result = bot.setQuickBarSlot(slot);
        break;
      case 'right_click':
        result = bot.rightClick(offHand);
        break;
      case 'start_right_click_hold':
        result = bot.startRightClickHold(offHand);
        break;
      case 'stop_right_click_hold':
        result = bot.stopRightClickHold();
        break;
      case 'left_click':
        result = bot.leftClick();
        break;
      case 'start_left_click_hold':
        result = bot.startLeftClickHold(intervalMs);
        break;
      case 'stop_left_click_hold':
        result = bot.stopLeftClickHold();
        break;
      case 'drop_held':
        result = await bot.dropHeldItem(all !== false);
        break;
      case 'consume':
        result = await bot.consumeHeldItem();
        break;
      default:
        return res.status(400).json({ error: `Unknown hand action: ${action}` });
    }
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post(['/api/bots/:id/inventory-action', '/api/bot/inventory-action'], async (req, res) => {
  try {
    const bot = getTargetBot(req);
    const { action, sourceSlot, destSlot, slot, destination, count, mouseButton, mode } = req.body;
    let result = { success: true };
    switch (action) {
      case 'swap':
      case 'move':
        result = await bot.swapSlots(sourceSlot, destSlot);
        break;
      case 'drop':
        result = await bot.dropSlot(slot, count);
        break;
      case 'equip':
        result = await bot.equipSlot(slot, destination || 'hand');
        break;
      case 'click_window':
        result = await bot.clickWindowSlot(slot, mouseButton || 0, mode || 0);
        break;
      default:
        return res.status(400).json({ error: `Unknown inventory action: ${action}` });
    }
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post(['/api/bots/:id/chat', '/api/bot/chat'], (req, res) => {
  try {
    const bot = getTargetBot(req);
    const { message } = req.body;
    bot.sendChat(message);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Shop Scraper & AI Wealth Analyzer Endpoints
app.post(['/api/bots/:id/shop/crawl', '/api/shop/crawl'], async (req, res) => {
  try {
    const bot = getTargetBot(req);
    const { command, delay } = req.body;
    if (!bot.shopCrawler) {
      return res.status(400).json({ error: 'Shop crawler is not initialized' });
    }
    if (delay) bot.shopCrawler.baseDelay = Math.max(500, parseInt(delay, 10));
    bot.shopCrawler.startCrawl(command).catch(err => {
      console.warn('[ShopCrawler Error]', err.message);
    });
    res.json({ success: true, message: `Shop crawl started for ${bot.botName}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post(['/api/bots/:id/shop/stop', '/api/shop/stop'], async (req, res) => {
  try {
    const bot = getTargetBot(req);
    if (bot.shopCrawler) {
      await bot.shopCrawler.stop();
    }
    res.json({ success: true, message: `Shop crawl stopped for ${bot.botName}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get(['/api/bots/:id/shop/catalog', '/api/shop/catalog'], (req, res) => {
  try {
    const bot = getTargetBot(req);
    const host = req.query.host || bot.currentServer?.host;
    const catalog = storage.getShopCatalog(host);
    if (!catalog) {
      return res.status(404).json({ error: 'No catalog found. Run a shop crawl first.' });
    }
    const analysis = analyzeEconomy(catalog);
    res.json({ catalog, analysis });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post(['/api/bots/:id/shop/analyze', '/api/shop/analyze'], async (req, res) => {
  try {
    const bot = getTargetBot(req);
    const host = req.body.host || bot.currentServer?.host;
    const catalog = storage.getShopCatalog(host);
    if (!catalog) {
      return res.status(404).json({ error: 'No shop catalog found. Run a shop crawl first!' });
    }

    const analysis = analyzeEconomy(catalog);
    let aiStrategy = null;

    if (bot.aiChat && bot.aiChat.apiKey) {
      const prompt = generateAiPrompt(catalog, analysis);
      try {
        const reply = await bot.aiChat.getReply(
          'Owner',
          prompt,
          `Server: ${catalog.server}`,
          '',
          (log) => bot.emit('log', log)
        );
        aiStrategy = reply;
      } catch (aiErr) {
        console.warn('AI analysis call failed:', aiErr.message);
      }
    }

    const markdownReport = generateMarkdownReport(analysis, aiStrategy?.text || aiStrategy);
    const aiPrompt = generateAiPrompt(catalog, analysis);

    res.json({
      success: true,
      analysis,
      aiStrategy,
      aiPrompt,
      markdownReport
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/bots/:id/shop/export', '/api/shop/export'], (req, res) => {
  try {
    const bot = getTargetBot(req);
    const host = req.query.host || bot.currentServer?.host;
    const catalog = storage.getShopCatalog(host);
    if (!catalog) {
      return res.status(404).send('No shop catalog found.');
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="shop_${host || 'catalog'}.json"`);
    res.send(JSON.stringify(catalog, null, 2));
  } catch (err) {
    res.status(400).send(err.message);
  }
});

// Diagnostic & Server list routes
app.get('/api/debug', async (req, res) => {
  const results = { timestamp: new Date().toISOString() };
  const host = req.query.host || 'hyrixsmp3.aternos.me';
  const port = Number(req.query.port) || 26743;
  const ip = req.query.ip || '185.107.192.56';

  // 1. Test DNS
  try {
    const resolver = new dns.promises.Resolver();
    resolver.setServers(['8.8.8.8', '1.1.1.1']);
    results.dns_srv = await resolver.resolveSrv(`_minecraft._tcp.${host}`).catch(e => e.message);
    results.dns_a = await resolver.resolve4(host).catch(e => e.message);
  } catch (e) {
    results.dns_error = e.message;
  }

  // 2. Test TCP to IP:port
  try {
    const start = Date.now();
    await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: ip, port, timeout: 5000 }, () => {
        results.tcp_ip = { status: 'connected', latencyMs: Date.now() - start };
        socket.end();
        resolve();
      });
      socket.on('error', (err) => {
        results.tcp_ip = { status: 'error', error: err.message };
        resolve();
      });
      socket.on('timeout', () => {
        results.tcp_ip = { status: 'timeout' };
        socket.destroy();
        resolve();
      });
    });
  } catch (e) {
    results.tcp_ip_catch = e.message;
  }

  // 3. Test MC ping
  try {
    const pingRes = await new Promise((resolve, reject) => {
      mc.ping({ host: ip, port, fakeHost: host, closeTimeout: 6000 }, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
    results.mc_ping = { status: 'success', version: pingRes.version, latency: pingRes.latency };
  } catch (e) {
    results.mc_ping = { status: 'error', error: e.message };
  }

  res.json(results);
});

app.get('/api/servers', (req, res) => {
  res.json(storage.getSavedServers());
});

app.post('/api/servers', (req, res) => {
  try {
    const saved = storage.saveServer(req.body);
    io.emit('servers:updated', storage.getSavedServers());
    res.json({ success: true, server: saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/servers/:id', (req, res) => {
  try {
    const remaining = storage.deleteServer(req.params.id);
    io.emit('servers:updated', remaining);
    res.json({ success: true, servers: remaining });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/settings', (req, res) => {
  res.json(storage.getSettings());
});

app.post(['/api/bots/:id/settings', '/api/settings'], (req, res) => {
  try {
    const updated = storage.saveSettings(req.body);
    for (const b of botPool.bots.values()) {
      b.updateSettings(req.body);
      if (b.botConfig) {
        if (req.body.antiAfkMode !== undefined) b.botConfig.antiAfkMode = req.body.antiAfkMode;
        if (req.body.antiAfkEnabled !== undefined) b.botConfig.antiAfkEnabled = req.body.antiAfkEnabled;
        if (req.body.viewDistance !== undefined) b.botConfig.viewDistance = Number(req.body.viewDistance);
        botPool.storage.saveBot(b.botConfig);
      }
    }
    io.emit('bot:settings', storage.getSettings());
    res.json({ success: true, settings: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/quick-commands', (req, res) => {
  try {
    const commands = req.body?.commands || req.body;
    const updated = storage.saveSettings({ quickCommands: commands });
    io.emit('bot:settings', storage.getSettings());
    res.json({ success: true, quickCommands: updated.quickCommands });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/bots/:id/permitted-users', '/api/permitted-users'], (req, res) => {
  try {
    const bot = getTargetBot(req);
    const updated = bot.addPermittedUsers(req.body.users);
    io.emit('bot:settings', storage.getSettings());
    res.json({ success: true, permittedUsers: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete(['/api/bots/:id/permitted-users/:username', '/api/permitted-users/:username'], (req, res) => {
  try {
    const bot = getTargetBot(req);
    const updated = bot.removePermittedUser(req.params.username);
    io.emit('bot:settings', storage.getSettings());
    res.json({ success: true, permittedUsers: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Socket.io Connection & Multi-Bot Event Router
io.on('connection', (socket) => {
  // Initial state delivery
  socket.emit('bots:updated', botPool.getBotSummaries());
  socket.emit('servers:updated', storage.getSavedServers());
  socket.emit('bot:settings', storage.getSettings());

  const activeBot = botPool.getBot();
  if (activeBot) {
    socket.emit('bot:status', activeBot.getStatus());
    socket.emit('bot:inventory', activeBot.getInventory());
    const latestCat = storage.getShopCatalog(activeBot.currentServer?.host);
    if (latestCat) {
      socket.emit('shop:catalog', latestCat);
    }
  }

  // Multi-bot pool controls
  socket.on('bots:set_active', (id) => {
    botPool.setActiveBot(id);
    const bot = botPool.getBot(id);
    if (bot) {
      socket.emit('bot:status', bot.getStatus());
      socket.emit('bot:inventory', bot.getInventory());
    }
  });

  socket.on('bots:connect_all', (data) => {
    botPool.connectAll(data).catch((e) => {
      socket.emit('bot:log', { type: 'error', text: `Connect All failed: ${e.message}` });
    });
  });

  socket.on('bots:disconnect_all', () => {
    botPool.disconnectAll();
  });

  socket.on('bots:add', (botConfig) => {
    try {
      botPool.addBot(botConfig);
    } catch (e) {
      socket.emit('bot:log', { type: 'error', text: `Add Bot failed: ${e.message}` });
    }
  });

  socket.on('bots:remove', (id) => {
    try {
      botPool.removeBot(id);
    } catch (e) {
      socket.emit('bot:log', { type: 'error', text: `Remove Bot failed: ${e.message}` });
    }
  });

  const resolveBot = (data) => {
    const id = data?.botId || (typeof data === 'object' && data?.id) || botPool.activeBotId;
    return botPool.getBot(id);
  };

  socket.on('bot:connect', (data) => {
    const bot = resolveBot(data);
    if (bot) {
      if (data?.afterLoginCommand !== undefined) {
        bot.afterLoginCommand = String(data.afterLoginCommand || '').trim();
        bot.botConfig.afterLoginCommand = bot.afterLoginCommand;
        botPool.storage.saveBot({
          ...bot.botConfig,
          id: bot.botId,
          name: bot.botName,
          afterLoginCommand: bot.afterLoginCommand
        });
      }
      bot.connect(data);
    }
  });

  socket.on('bot:update_config', (data) => {
    try {
      const bot = resolveBot(data);
      if (!bot) return;
      if (data.afterLoginCommand !== undefined) {
        bot.afterLoginCommand = String(data.afterLoginCommand || '').trim();
        bot.botConfig.afterLoginCommand = bot.afterLoginCommand;
      }
      if (data.loginPassword !== undefined) bot.botConfig.loginPassword = data.loginPassword;
      if (data.autoLogin !== undefined) bot.botConfig.autoLogin = !!data.autoLogin;
      botPool.storage.saveBot({
        ...bot.botConfig,
        id: bot.botId,
        name: bot.botName,
        afterLoginCommand: bot.afterLoginCommand
      });
      io.emit('bots:updated', botPool.getBotSummaries());
      socket.emit('bot:status', bot.getStatus());
      socket.emit('bot:log', { type: 'system', text: `Saved settings for ${bot.botName}.` });
    } catch (e) {
      socket.emit('bot:log', { type: 'error', text: `Save config failed: ${e.message}` });
    }
  });

  socket.on('bot:disconnect', (data) => {
    const bot = resolveBot(data);
    if (bot) bot.disconnect();
  });

  socket.on('bot:action', (data) => {
    try {
      const bot = resolveBot(data);
      const action = typeof data === 'string' ? data : data?.action;
      if (bot) bot.manualAction(action);
    } catch (e) {
      socket.emit('bot:log', { type: 'error', text: e.message });
    }
  });

  socket.on('bot:hand_action', async (data) => {
    try {
      const bot = resolveBot(data);
      if (!bot) return;
      const act = typeof data === 'string' ? data : data?.action;
      const offHand = data?.offHand;
      const slot = data?.slot;
      const intervalMs = data?.intervalMs;
      const all = data?.all;
      switch (act) {
        case 'set_hotbar':
        case 'set_slot':
          bot.setQuickBarSlot(slot);
          break;
        case 'right_click':
          bot.rightClick(offHand);
          break;
        case 'start_right_click_hold':
          bot.startRightClickHold(offHand);
          break;
        case 'stop_right_click_hold':
          bot.stopRightClickHold();
          break;
        case 'left_click':
          bot.leftClick();
          break;
        case 'start_left_click_hold':
          bot.startLeftClickHold(intervalMs);
          break;
        case 'stop_left_click_hold':
          bot.stopLeftClickHold();
          break;
        case 'drop_held':
          await bot.dropHeldItem(all !== false);
          break;
        case 'consume':
          await bot.consumeHeldItem();
          break;
        default:
          bot.manualAction(act);
      }
    } catch (e) {
      socket.emit('bot:log', { type: 'error', text: e.message });
    }
  });

  socket.on('bot:inventory_action', async (data) => {
    try {
      const bot = resolveBot(data);
      if (!bot) return;
      const { action, sourceSlot, destSlot, slot, destination, count, mouseButton, mode } = data || {};
      switch (action) {
        case 'swap':
        case 'move':
          await bot.swapSlots(sourceSlot, destSlot);
          break;
        case 'drop':
          await bot.dropSlot(slot, count);
          break;
        case 'equip':
          await bot.equipSlot(slot, destination || 'hand');
          break;
        case 'click_window':
          await bot.clickWindowSlot(slot, mouseButton || 0, mode || 0);
          break;
        default:
          throw new Error(`Unknown inventory action: ${action}`);
      }
    } catch (e) {
      socket.emit('bot:log', { type: 'error', text: e.message });
    }
  });

  socket.on('bot:set_hotbar', (data) => {
    try {
      const bot = resolveBot(data);
      const slot = typeof data === 'number' ? data : data?.slot;
      if (bot) bot.setQuickBarSlot(slot);
    } catch (e) {
      socket.emit('bot:log', { type: 'error', text: e.message });
    }
  });

  socket.on('bot:chat', (data) => {
    try {
      const bot = resolveBot(data);
      const msg = typeof data === 'string' ? data : data?.message;
      if (bot && msg) bot.sendChat(msg);
    } catch (e) {
      socket.emit('bot:log', { type: 'error', text: e.message });
    }
  });

  socket.on('shop:crawl', (data) => {
    const bot = resolveBot(data);
    if (bot?.shopCrawler) {
      bot.shopCrawler.startCrawl(data?.command).catch((e) => {
        socket.emit('shop:error', { botId: bot.botId, message: e.message });
      });
    }
  });

  socket.on('shop:stop', (data) => {
    const bot = resolveBot(data);
    if (bot?.shopCrawler) {
      bot.shopCrawler.stop();
    }
  });

  socket.on('settings:update', (data) => {
    storage.saveSettings(data);
    for (const b of botPool.bots.values()) {
      b.updateSettings(data);
      if (b.botConfig) {
        if (data.antiAfkMode !== undefined) b.botConfig.antiAfkMode = data.antiAfkMode;
        if (data.antiAfkEnabled !== undefined) b.botConfig.antiAfkEnabled = data.antiAfkEnabled;
        botPool.storage.saveBot(b.botConfig);
      }
    }
    io.emit('bot:settings', storage.getSettings());
  });

  socket.on('quick_commands:update', (commands) => {
    try {
      storage.saveSettings({ quickCommands: commands });
      io.emit('bot:settings', storage.getSettings());
      socket.emit('bot:log', { type: 'system', text: 'Saved quick commands.' });
    } catch (e) {
      socket.emit('bot:log', { type: 'error', text: `Failed to save quick commands: ${e.message}` });
    }
  });

  socket.on('seed:update', (seed) => {
    storage.saveSettings({ worldSeed: seed });
    for (const b of botPool.bots.values()) {
      b.updateSettings({ worldSeed: seed });
    }
    io.emit('bot:settings', storage.getSettings());
  });

  socket.on('permitted:add', (users) => {
    try {
      const bot = botPool.getBot();
      const updated = bot?.addPermittedUsers(users);
      io.emit('bot:settings', storage.getSettings());
      const label = Array.isArray(users) ? users.join(', ') : users;
      io.emit('bot:log', { type: 'system', text: `[Permissions] Added allowed user(s): ${label}` });
    } catch (e) {
      socket.emit('bot:log', { type: 'error', text: e.message });
    }
  });

  socket.on('permitted:remove', (user) => {
    try {
      const bot = botPool.getBot();
      const updated = bot?.removePermittedUser(user);
      io.emit('bot:settings', storage.getSettings());
      io.emit('bot:log', { type: 'system', text: `[Permissions] Removed user: ${user}` });
    } catch (e) {
      socket.emit('bot:log', { type: 'error', text: e.message });
    }
  });
});

const startServer = (port) => {
  const listener = server.listen(port, '0.0.0.0', () => {
    console.log(`===============================================`);
    console.log(` Minecraft AFK Bot Dashboard running!`);
    console.log(` Web UI: http://localhost:${port}`);
    console.log(` Active Bots in Pool: ${botPool.bots.size}`);
    console.log(`===============================================`);

    // Auto-connect on startup only if MC_HOST is explicitly defined in environment or a saved server exists
    const envHost = (process.env.MC_HOST || '').trim();
    const savedServers = storage.getSavedServers();
    const shouldAutoConnect = process.env.AUTO_CONNECT === 'true' && (envHost || savedServers.length > 0);

    if (shouldAutoConnect) {
      const saved = savedServers[0] || {};
      const targetHost = envHost || saved.host;
      if (targetHost) {
        let finalHost = targetHost;
        let finalPort = parseInt(process.env.MC_PORT || saved.port || '25565', 10);
        if (finalHost.includes(':')) {
          const [h, p] = finalHost.split(':');
          finalHost = h.trim();
          const parsed = parseInt(p, 10);
          if (!isNaN(parsed) && parsed > 0) finalPort = parsed;
        }
        const target = {
          host: finalHost,
          port: finalPort,
          username: process.env.MC_USERNAME || saved.username || 'Aaswaam',
          loginPassword: process.env.MC_PASSWORD || saved.loginPassword || '209801',
          version: process.env.MC_VERSION || saved.version || '1.21.4',
          autoLogin: process.env.MC_AUTOLOGIN !== 'false'
        };
        console.log(`[AutoConnect] Initiating auto-connect to ${target.host}:${target.port} as ${target.username}...`);
        setTimeout(() => {
          botPool.getBot()?.connect(target);
        }, 2500);
      }
    }
  });

  listener.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Server] Port ${port} is in use, trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('[Server Error]', err);
    }
  });
};

startServer(PORT);
