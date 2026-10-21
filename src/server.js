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

// Initialize Bot Manager
const botManager = new BotManager(storage);

// Process-level guards against unexpected library-level network drops
process.on('uncaughtException', (err) => {
  const msg = err?.message || String(err);
  if (msg.includes("Unsupported protocol version '-1'") || msg.includes("version '-1'")) {
    console.warn('[Server Guard] Server returned offline protocol version -1 (offline or sleeping).');
    botManager.emit('log', { 
      type: 'warn', 
      text: '⚠️ Target server returned offline protocol version -1 (server is currently offline or sleeping). Preparing recovery...' 
    });
    botManager.cleanup();
    botManager.scheduleReconnect();
    return;
  }
  console.warn('[Server Guard] Caught exception:', msg);
  botManager.emit('log', { type: 'error', text: `Connection/Network error: ${msg}` });
  botManager.cleanup();
});

process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || String(reason);
  if (msg.includes("Unsupported protocol version '-1'") || msg.includes("version '-1'")) {
    console.warn('[Server Guard] Server returned offline protocol version -1 (offline or sleeping).');
    botManager.emit('log', { 
      type: 'warn', 
      text: '⚠️ Target server returned offline protocol version -1 (server is currently offline or sleeping). Preparing recovery...' 
    });
    botManager.cleanup();
    botManager.scheduleReconnect();
    return;
  }
  console.warn('[Server Guard] Unhandled rejection:', msg);
  botManager.emit('log', { type: 'error', text: `Connection rejection: ${msg}` });
  botManager.cleanup();
});

// Wire Bot Events to WebSockets
botManager.on('status', (status) => io.emit('bot:status', status));
botManager.on('chat', (msg) => io.emit('bot:chat', msg));
botManager.on('log', (log) => io.emit('bot:log', log));
botManager.on('settings', (settings) => io.emit('bot:settings', settings));
botManager.on('inventory', (inv) => io.emit('bot:inventory', inv));
botManager.on('shop:progress', (data) => io.emit('shop:progress', data));
botManager.on('shop:complete', (catalog) => io.emit('shop:complete', catalog));
botManager.on('shop:stopped', () => io.emit('shop:stopped'));
botManager.on('shop:error', (data) => io.emit('shop:error', data));

// API Routes
app.get('/api/status', (req, res) => {
  res.json(botManager.getStatus());
});

app.get('/api/logs', (req, res) => {
  res.json(botManager.getLogs());
});

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

app.post('/api/settings', (req, res) => {
  try {
    botManager.updateSettings(req.body);
    res.json({ success: true, settings: botManager.settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bot/connect', (req, res) => {
  try {
    const { host, port, username, version, loginPassword, autoLogin } = req.body;
    if (!host) {
      return res.status(400).json({ error: 'Server host is required' });
    }
    botManager.connect({ host, port, username, version, loginPassword, autoLogin });
    res.json({ success: true, message: 'Connection initiated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bot/disconnect', (req, res) => {
  try {
    botManager.disconnect();
    res.json({ success: true, message: 'Disconnected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/inventory', (req, res) => {
  res.json(botManager.getInventory());
});

app.post('/api/bot/action', (req, res) => {
  try {
    const { action } = req.body;
    botManager.manualAction(action);
    res.json({ success: true, action });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/bot/hand-action', async (req, res) => {
  try {
    const { action, slot, offHand, intervalMs, all } = req.body;
    let result = { success: true };
    switch (action) {
      case 'set_hotbar':
      case 'set_slot':
        result = botManager.setQuickBarSlot(slot);
        break;
      case 'right_click':
        result = botManager.rightClick(offHand);
        break;
      case 'start_right_click_hold':
        result = botManager.startRightClickHold(offHand);
        break;
      case 'stop_right_click_hold':
        result = botManager.stopRightClickHold();
        break;
      case 'left_click':
        result = botManager.leftClick();
        break;
      case 'start_left_click_hold':
        result = botManager.startLeftClickHold(intervalMs);
        break;
      case 'stop_left_click_hold':
        result = botManager.stopLeftClickHold();
        break;
      case 'drop_held':
        result = await botManager.dropHeldItem(all !== false);
        break;
      case 'consume':
        result = await botManager.consumeHeldItem();
        break;
      default:
        return res.status(400).json({ error: `Unknown hand action: ${action}` });
    }
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/bot/inventory-action', async (req, res) => {
  try {
    const { action, sourceSlot, destSlot, slot, destination, count, mouseButton, mode } = req.body;
    let result = { success: true };
    switch (action) {
      case 'swap':
      case 'move':
        result = await botManager.swapSlots(sourceSlot, destSlot);
        break;
      case 'drop':
        result = await botManager.dropSlot(slot, count);
        break;
      case 'equip':
        result = await botManager.equipSlot(slot, destination || 'hand');
        break;
      case 'click_window':
        result = await botManager.clickWindowSlot(slot, mouseButton || 0, mode || 0);
        break;
      default:
        return res.status(400).json({ error: `Unknown inventory action: ${action}` });
    }
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/bot/chat', (req, res) => {
  try {
    const { message } = req.body;
    botManager.sendChat(message);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Shop Scraper & AI Wealth Analyzer Endpoints
app.post('/api/shop/crawl', async (req, res) => {
  try {
    const { command, delay } = req.body;
    if (!botManager.shopCrawler) {
      return res.status(400).json({ error: 'Shop crawler is not initialized' });
    }
    if (delay) botManager.shopCrawler.baseDelay = Math.max(500, parseInt(delay, 10));
    botManager.shopCrawler.startCrawl(command).catch(err => {
      console.warn('[ShopCrawler Error]', err.message);
    });
    res.json({ success: true, message: 'Shop crawl started' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/shop/stop', async (req, res) => {
  try {
    if (botManager.shopCrawler) {
      await botManager.shopCrawler.stop();
    }
    res.json({ success: true, message: 'Shop crawl stopped' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/shop/catalog', (req, res) => {
  const host = req.query.host || botManager.currentServer?.host;
  const catalog = storage.getShopCatalog(host);
  if (!catalog) {
    return res.status(404).json({ error: 'No catalog found. Run a shop crawl first.' });
  }
  const analysis = analyzeEconomy(catalog);
  res.json({ catalog, analysis });
});

app.post('/api/shop/analyze', async (req, res) => {
  try {
    const host = req.body.host || botManager.currentServer?.host;
    const catalog = storage.getShopCatalog(host);
    if (!catalog) {
      return res.status(404).json({ error: 'No shop catalog found. Run a shop crawl first!' });
    }

    const analysis = analyzeEconomy(catalog);
    let aiStrategy = null;

    if (botManager.aiChat && botManager.aiChat.apiKey) {
      const prompt = generateAiPrompt(catalog, analysis);
      try {
        const reply = await botManager.aiChat.getReply(
          'Owner',
          prompt,
          `Server: ${catalog.server}`,
          '',
          (log) => botManager.emit('log', log)
        );
        aiStrategy = reply;
      } catch (aiErr) {
        console.warn('AI analysis call failed:', aiErr.message);
      }
    }

    const markdownReport = generateMarkdownReport(analysis, aiStrategy);
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

app.get('/api/shop/export', (req, res) => {
  const host = req.query.host || botManager.currentServer?.host;
  const catalog = storage.getShopCatalog(host);
  if (!catalog) {
    return res.status(404).send('No shop catalog found.');
  }
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="shop_${host || 'catalog'}.json"`);
  res.send(JSON.stringify(catalog, null, 2));
});

// Socket.io Connection
io.on('connection', (socket) => {
  // Send initial state on connection
  socket.emit('bot:status', botManager.getStatus());
  socket.emit('bot:inventory', botManager.getInventory());
  socket.emit('servers:updated', storage.getSavedServers());
  socket.emit('bot:settings', storage.getSettings());

  const latestCat = storage.getShopCatalog(botManager.currentServer?.host);
  if (latestCat) {
    socket.emit('shop:catalog', latestCat);
  }

  socket.on('shop:crawl', (data) => {
    if (botManager.shopCrawler) {
      botManager.shopCrawler.startCrawl(data?.command).catch(e => {
        socket.emit('shop:error', { message: e.message });
      });
    }
  });

  socket.on('shop:stop', () => {
    if (botManager.shopCrawler) {
      botManager.shopCrawler.stop();
    }
  });

  socket.on('bot:connect', (data) => botManager.connect(data));
  socket.on('bot:disconnect', () => botManager.disconnect());
  socket.on('bot:action', (action) => {
    try {
      botManager.manualAction(action);
    } catch (e) {
      socket.emit('bot:log', { type: 'error', text: e.message });
    }
  });
  socket.on('bot:hand_action', async (data) => {
    try {
      const act = typeof data === 'string' ? data : data?.action;
      const offHand = data?.offHand;
      const slot = data?.slot;
      const intervalMs = data?.intervalMs;
      const all = data?.all;
      switch (act) {
        case 'set_hotbar':
        case 'set_slot':
          botManager.setQuickBarSlot(slot);
          break;
        case 'right_click':
          botManager.rightClick(offHand);
          break;
        case 'start_right_click_hold':
          botManager.startRightClickHold(offHand);
          break;
        case 'stop_right_click_hold':
          botManager.stopRightClickHold();
          break;
        case 'left_click':
          botManager.leftClick();
          break;
        case 'start_left_click_hold':
          botManager.startLeftClickHold(intervalMs);
          break;
        case 'stop_left_click_hold':
          botManager.stopLeftClickHold();
          break;
        case 'drop_held':
          await botManager.dropHeldItem(all !== false);
          break;
        case 'consume':
          await botManager.consumeHeldItem();
          break;
        default:
          botManager.manualAction(act);
      }
    } catch (e) {
      socket.emit('bot:log', { type: 'error', text: e.message });
    }
  });

  socket.on('bot:inventory_action', async (data) => {
    try {
      const { action, sourceSlot, destSlot, slot, destination, count, mouseButton, mode } = data || {};
      switch (action) {
        case 'swap':
        case 'move':
          await botManager.swapSlots(sourceSlot, destSlot);
          break;
        case 'drop':
          await botManager.dropSlot(slot, count);
          break;
        case 'equip':
          await botManager.equipSlot(slot, destination || 'hand');
          break;
        case 'click_window':
          await botManager.clickWindowSlot(slot, mouseButton || 0, mode || 0);
          break;
        default:
          throw new Error(`Unknown inventory action: ${action}`);
      }
    } catch (e) {
      socket.emit('bot:log', { type: 'error', text: e.message });
    }
  });

  socket.on('bot:set_hotbar', (slot) => {
    try {
      botManager.setQuickBarSlot(slot);
    } catch (e) {
      socket.emit('bot:log', { type: 'error', text: e.message });
    }
  });
  socket.on('bot:chat', (msg) => {
    try {
      botManager.sendChat(msg);
    } catch (e) {
      socket.emit('bot:log', { type: 'error', text: e.message });
    }
  });
  socket.on('settings:update', (data) => botManager.updateSettings(data));
  socket.on('seed:update', (seed) => {
    botManager.updateSettings({ worldSeed: seed });
    io.emit('bot:settings', storage.getSettings());
    io.emit('bot:status', botManager.getStatus());
  });
  socket.on('permitted:add', (users) => {
    try {
      const updated = botManager.addPermittedUsers(users);
      io.emit('bot:settings', storage.getSettings());
      const label = Array.isArray(users) ? users.join(', ') : users;
      io.emit('bot:log', { type: 'system', text: `[Permissions] Added allowed user(s): ${label}` });
    } catch (e) {
      socket.emit('bot:log', { type: 'error', text: e.message });
    }
  });
  socket.on('permitted:remove', (user) => {
    try {
      botManager.removePermittedUser(user);
      io.emit('bot:settings', storage.getSettings());
      io.emit('bot:log', { type: 'system', text: `[Permissions] Removed user: ${user}` });
    } catch (e) {
      socket.emit('bot:log', { type: 'error', text: e.message });
    }
  });
});

app.post('/api/permitted-users', (req, res) => {
  try {
    const { users } = req.body;
    const updated = botManager.addPermittedUsers(users);
    io.emit('bot:settings', storage.getSettings());
    res.json({ success: true, permittedUsers: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/permitted-users/:username', (req, res) => {
  try {
    const updated = botManager.removePermittedUser(req.params.username);
    io.emit('bot:settings', storage.getSettings());
    res.json({ success: true, permittedUsers: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(` Minecraft AFK Bot Dashboard running!`);
  console.log(` Web UI: http://0.0.0.0:${PORT}`);
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
        botManager.connect(target);
      }, 2500);
    }
  }
});
