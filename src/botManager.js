import mineflayer from 'mineflayer';
import EventEmitter from 'events';
import dns from 'dns';
import net from 'net';
import { AiChatHandler } from './aiChat.js';
import { ActionExecutor } from './commandHandler.js';

export class BotManager extends EventEmitter {
  constructor(storage) {
    super();
    this.storage = storage;
    this.bot = null;
    this.state = 'DISCONNECTED'; // DISCONNECTED, CONNECTING, CONNECTED, SPAWNED, ERROR
    this.currentServer = null;
    this.antiAfkTimer = null;
    this.manualDisconnect = false;
    this.reconnectTimer = null;
    this.spawnTime = null;

    // Rolling buffer of recent server chat for ambient awareness (last 20 messages)
    this.recentChatLog = [];
    this.recentEmittedChats = new Set();

    // AI Companion & Physical Action Executor
    this.aiChat = new AiChatHandler();
    this.actionExecutor = new ActionExecutor(this);

    // Load initial settings
    this.settings = this.storage.getSettings();
  }

  addChatToRecentLog(sender, text) {
    if (!text || !text.trim()) return;
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.recentChatLog.push(`[${time}] ${sender}: ${text.trim()}`);
    if (this.recentChatLog.length > 20) {
      this.recentChatLog.shift();
    }
  }

  emitChat(sender, text, isMe = false) {
    const cleanSender = String(sender).trim().replace(/\s+/g, ' ');
    const cleanText = String(text).trim().replace(/\s+/g, ' ');
    const key = `${cleanSender.toLowerCase()}:${cleanText.toLowerCase()}`;
    
    if (this.recentEmittedChats.has(key)) return false;
    this.recentEmittedChats.add(key);
    setTimeout(() => this.recentEmittedChats.delete(key), 3000);

    this.emit('chat', {
      sender: cleanSender,
      text: cleanText,
      time: new Date().toLocaleTimeString(),
      isMe
    });
    return true;
  }

  updateSettings(newSettings) {
    this.settings = this.storage.saveSettings(newSettings);
    if (this.state === 'SPAWNED') {
      this.resetAntiAfkTimer();
    }
    this.emit('settings', this.settings);
  }

  getBotContext() {
    if (!this.bot || !this.bot.entity) return 'Bot status: Not spawned yet';
    const pos = this.bot.entity.position;
    const x = Math.round(pos.x);
    const y = Math.round(pos.y);
    const z = Math.round(pos.z);
    const dim = this.bot.game?.dimension || 'Overworld';
    const hp = Math.round(this.bot.health ?? 20);
    const food = Math.round(this.bot.food ?? 20);
    const held = this.bot.heldItem ? this.bot.heldItem.name : 'empty hands';

    let nearby = 'None';
    try {
      const players = Object.values(this.bot.players)
        .filter(p => p.entity && p.username && p.username.toLowerCase() !== (this.bot.username || '').toLowerCase())
        .map(p => {
          const dist = Math.round(p.entity.position.distanceTo(pos));
          return `${p.username} (${dist}m away)`;
        });
      if (players.length > 0) nearby = players.slice(0, 4).join(', ');
    } catch (e) {
      // ignore
    }

    return `- Coordinates: X: ${x}, Y: ${y}, Z: ${z}
- Current Dimension: ${dim}
- Health: ${hp}/20
- Food: ${food}/20
- Holding in hand: ${held}
- Nearby Players: ${nearby}
- Master Player: Phyroosh`;
  }

  getStatus() {
    let position = null;
    let health = 20;
    let food = 20;

    if (this.bot && this.bot.entity) {
      position = {
        x: Math.round(this.bot.entity.position.x * 10) / 10,
        y: Math.round(this.bot.entity.position.y * 10) / 10,
        z: Math.round(this.bot.entity.position.z * 10) / 10
      };
      health = Math.round(this.bot.health ?? 20);
      food = Math.round(this.bot.food ?? 20);
    }

    return {
      state: this.state,
      server: this.currentServer,
      username: this.bot?.username || this.currentServer?.username || this.settings.defaultUsername,
      health,
      food,
      position,
      uptime: this.spawnTime ? Math.floor((Date.now() - this.spawnTime) / 1000) : 0,
      antiAfkEnabled: this.settings.antiAfkEnabled,
      aiActive: !!this.aiChat.apiKey,
      settings: this.settings
    };
  }

  async connect(serverConfig) {
    if (this.state === 'CONNECTING' || this.state === 'CONNECTED' || this.state === 'SPAWNED') {
      this.disconnect();
      await new Promise(r => setTimeout(r, 1200));
    }

    this.manualDisconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    let host = (serverConfig.host || '').trim().toLowerCase();
    let port = Number(serverConfig.port) || 25565;
    const username = (serverConfig.username && serverConfig.username.trim()) || this.settings.defaultUsername || 'Dream';
    const loginPassword = serverConfig.loginPassword !== undefined ? serverConfig.loginPassword : this.settings.defaultPassword;
    const autoLogin = serverConfig.autoLogin !== undefined ? serverConfig.autoLogin : this.settings.autoLogin;
    const version = serverConfig.version ? serverConfig.version.trim() : false;

    let targetIp = null;
    const originalDomain = host;

    // Check if port is default 25565 and host is a domain (e.g. hyrixsmp3.aternos.me).
    // Cloud environments (Render, AWS, Docker) often fail to resolve SRV records or have DNS lookup latency.
    // We resolve SRV records and IPv4 explicitly using Google (8.8.8.8) and Cloudflare (1.1.1.1) DNS!
    if (net.isIP(host) === 0 && host !== 'localhost') {
      try {
        const resolver = new dns.promises.Resolver();
        resolver.setServers(['8.8.8.8', '1.1.1.1']);

        // 1. Resolve SRV for dynamic port
        if (port === 25565) {
          try {
            const srvRecords = await resolver.resolveSrv(`_minecraft._tcp.${host}`);
            if (srvRecords && srvRecords.length > 0) {
              port = srvRecords[0].port;
              if (srvRecords[0].name) {
                host = srvRecords[0].name.toLowerCase();
              }
              this.emit('log', { type: 'system', text: `Resolved dynamic port via Public DNS: ${port}` });
            }
          } catch (e) {
            // no SRV record
          }
        }

        // 2. Resolve IPv4 directly so the socket never gets stuck on Render's container DNS
        try {
          const ips = await resolver.resolve4(host);
          if (ips && ips.length > 0) {
            targetIp = ips[0];
            this.emit('log', { type: 'system', text: `Resolved direct server IP: ${targetIp}` });
          }
        } catch (e) {
          // fallback
        }
      } catch (err) {
        // DNS lookup failed
      }
    }

    this.currentServer = {
      ...serverConfig,
      host,
      port,
      username,
      loginPassword,
      autoLogin,
      version: version || 'auto'
    };

    // Save to storage
    this.storage.saveServer(this.currentServer);

    this.state = 'CONNECTING';
    this.emit('status', this.getStatus());
    this.emit('log', { type: 'system', text: `Connecting to ${targetIp || host}:${port} as ${username} (offline/cracked mode)...` });

    const botOptions = {
      host: targetIp || host,
      port,
      fakeHost: originalDomain,
      username,
      auth: 'offline',
      skipValidation: true,
      checkTimeoutInterval: 120000
    };

    if (version && version !== 'auto') {
      botOptions.version = version;
    }

    try {
      this.bot = mineflayer.createBot(botOptions);
      
      // Connection watchdog: if handshake takes longer than 25s, notify and recover
      const watchdog = setTimeout(() => {
        if (this.state === 'CONNECTING' && this.bot) {
          this.emit('log', { type: 'warn', text: 'Server handshake is taking long. Retrying connection...' });
          this.handleBotError(new Error('Connection handshake timed out after 25s'));
        }
      }, 25000);

      this.bot.once('connect', () => clearTimeout(watchdog));
      this.bot.once('error', () => clearTimeout(watchdog));
      this.bot.once('end', () => clearTimeout(watchdog));

      this.setupBotEvents(loginPassword, autoLogin);
    } catch (err) {
      this.handleBotError(err);
    }
  }

  setupBotEvents(loginPassword, autoLogin) {
    const bot = this.bot;
    let autoLogged = false;

    // Helper to recursively extract text from NBT or JSON chat components
    const extractText = (obj) => {
      if (obj === null || obj === undefined) return '';
      if (typeof obj === 'string') {
        try {
          const parsed = JSON.parse(obj);
          return extractText(parsed);
        } catch (e) {
          return obj;
        }
      }
      if (typeof obj !== 'object') return String(obj);
      if (Array.isArray(obj)) return obj.map(extractText).filter(x => x).join('');
      let result = '';
      if (obj.text) result += extractText(obj.text);
      if (obj.value) result += extractText(obj.value);
      if (obj.extra) result += extractText(obj.extra);
      if (obj.translate) {
        if (!obj.translate.startsWith('chat.type.')) {
          result += `[${obj.translate}] `;
        }
      }
      if (obj.with) result += extractText(obj.with);
      return result || '';
    };

    if (bot._client) {
      // Low-level packet interception to fix Paper/offline mode sender usernames
      bot._client.on('packet', (data, meta) => {
        let sender = null;
        let message = null;

        try {
          if (meta.name === 'profileless_chat') {
            sender = extractText(data.name);
            message = extractText(data.message) || data.message;
          } else if (meta.name === 'player_chat') {
            sender = extractText(data.networkName || data.senderName);
            if (!sender && data.senderUuid) {
              const p = Object.values(bot.players).find(pl => pl.uuid === data.senderUuid);
              if (p) sender = p.username;
            }
            message = data.plainMessage || extractText(data.unsignedChatContent || data.formattedMessage);
          } else if (meta.name === 'system_chat') {
            message = extractText(data.content || data.formattedMessage);
            if (message) {
              const sysLabel = data.isActionBar ? 'ACTIONBAR' : 'SERVER';
              const cleanMsg = message.replace(/§./g, '').trim();
              if (cleanMsg) {
                if (this.emitChat(sysLabel, cleanMsg)) {
                  this.addChatToRecentLog(sysLabel, cleanMsg);
                  if (cleanMsg.toLowerCase().includes('has requested to teleport') || cleanMsg.toLowerCase().includes('teleport request')) {
                    this.emit('log', { type: 'system', text: `[Notice] Incoming teleport request detected on server!` });
                  }
                  const lower = cleanMsg.toLowerCase();
                  if (autoLogin && loginPassword && !autoLogged && (lower.includes('/login <password>') || lower.includes('please login') || lower.includes('use /login'))) {
                    autoLogged = true;
                    setTimeout(() => {
                      if (this.state === 'SPAWNED' && this.bot) {
                        this.emit('log', { type: 'system', text: 'Executing auto-login command: /login *******' });
                        this.bot.chat(`/login ${loginPassword}`);
                      }
                    }, 800);
                  }
                }
              }
            }
            return;
          } else if (meta.name === 'chat') {
            // Older versions <= 1.18
            message = extractText(data.message);
            if (message) {
              const cleanMsg = message.replace(/§./g, '').trim();
              const parsed = this.aiChat.parseSenderAndMessage(cleanMsg);
              if (parsed) {
                sender = parsed.sender;
                message = parsed.message;
              } else {
                // System message fallback
                if (this.emitChat('SERVER', cleanMsg)) {
                  this.addChatToRecentLog('SERVER', cleanMsg);
                  if (cleanMsg.toLowerCase().includes('has requested to teleport') || cleanMsg.toLowerCase().includes('teleport request')) {
                    this.emit('log', { type: 'system', text: `[Notice] Incoming teleport request detected on server!` });
                  }
                  const lower = cleanMsg.toLowerCase();
                  if (autoLogin && loginPassword && !autoLogged && (lower.includes('/login <password>') || lower.includes('please login') || lower.includes('use /login'))) {
                    autoLogged = true;
                    setTimeout(() => {
                      if (this.state === 'SPAWNED' && this.bot) {
                        this.emit('log', { type: 'system', text: 'Executing auto-login command: /login *******' });
                        this.bot.chat(`/login ${loginPassword}`);
                      }
                    }, 800);
                  }
                }
                return;
              }
            }
          }
        } catch (e) {
          console.error("Error parsing packet:", meta.name, e);
        }

        // Final fallback: deterministic UUID for Phyroosh
        if (!sender && data && data.senderUuid === '5f0f0818-ef23-3ade-ae93-571e53719fb6') {
          sender = 'Phyroosh';
        }

        if (sender && message && typeof message === 'string' && message.trim()) {
          const cleanMsg = message.replace(/§./g, '').trim();
          if (this.emitChat(sender, cleanMsg)) {
            this.addChatToRecentLog(sender, cleanMsg);
            this.handlePotentialAiChat(sender, cleanMsg);
          }
        }
      });
    }

    bot.on('connect', () => {
      this.state = 'CONNECTED';
      this.emit('status', this.getStatus());
      this.emit('log', { type: 'system', text: 'Connected to server! Handshaking...' });
    });

    bot.on('login', () => {
      this.emit('log', { type: 'system', text: `Logged in to server as ${bot.username}` });
    });

    bot.on('spawn', () => {
      this.state = 'SPAWNED';
      this.spawnTime = Date.now();
      this.emit('status', this.getStatus());
      this.emit('log', { type: 'system', text: 'Bot spawned into the Minecraft world!' });

      if (this.aiChat.apiKey) {
        const users = (this.settings.permittedUsers && this.settings.permittedUsers.length)
          ? this.settings.permittedUsers.join(', ')
          : 'Phyroosh';
        this.emit('log', { type: 'system', text: `🤖 Chat-Aware AI active: Ready for natural conversation and orders from [${users}] (GPT/Dream)!` });
      }

      if (autoLogin && loginPassword && !autoLogged) {
        autoLogged = true;
        setTimeout(() => {
          if (this.state === 'SPAWNED' && this.bot) {
            this.emit('log', { type: 'system', text: 'Executing auto-login command: /login *******' });
            this.bot.chat(`/login ${loginPassword}`);
          }
        }, 1200);
      }

      this.resetAntiAfkTimer();
    });

    bot.on('health', () => {
      this.emit('status', this.getStatus());
    });

    bot.on('move', () => {
      this.emit('status', this.getStatus());
    });

    bot.on('kicked', (reason) => {
      let kickReason = 'Unknown reason';
      try {
        kickReason = typeof reason === 'string' ? reason : JSON.stringify(reason);
      } catch (e) {
        kickReason = String(reason);
      }
      this.emit('log', { type: 'warn', text: `Bot was kicked: ${kickReason}` });
      this.cleanup(false);
      this.scheduleReconnect();
    });

    bot.on('end', (reason) => {
      this.emit('log', { type: 'warn', text: `Connection ended: ${reason || 'Connection closed'}` });
      this.cleanup(false);
      this.scheduleReconnect();
    });

    bot.on('error', (err) => {
      this.handleBotError(err);
    });
  }

  async handlePotentialAiChat(sender, message) {
    if (this.state !== 'SPAWNED' || !this.bot) return;

    const permitted = this.settings.permittedUsers || ['Phyroosh'];
    const cleanMsg = message.trim().toLowerCase();
    const hasTriggerWord = this.aiChat.triggerWords.some(word => cleanMsg.includes(word));
    const lowerSender = sender.toLowerCase();
    const isPermitted = permitted.some(u => String(u).trim().toLowerCase() === lowerSender);

    if (hasTriggerWord && !isPermitted) {
      this.emit('log', { type: 'system', text: `[AI Ignored] "${sender}" called GPT/Dream, but is not in the Permitted Users list!` });
      return;
    }

    if (!isPermitted || !hasTriggerWord) return;

    this.emit('log', { type: 'system', text: `[AI Triggered] Message from ${sender}: "${message}"` });

    const context = this.getBotContext();
    const chatLog = this.recentChatLog.slice(-15).join('\n');

    // Query LLM with full situational + ambient chat awareness
    const result = await this.aiChat.getReply(sender, message, context, chatLog);
    if (result && this.state === 'SPAWNED' && this.bot) {
      // 1. Execute any server slash commands requested by AI
      if (result.commands && result.commands.length > 0) {
        await this.actionExecutor.executeCommands(result.commands, sender);
      }

      // 2. Execute any physical in-game actions requested by AI
      if (result.actions && result.actions.length > 0) {
        await this.actionExecutor.executeActions(result.actions, sender);
      }

      // 3. Speak the completely natural, non-templated reply in Minecraft chat
      if (result.text) {
        this.bot.chat(result.text);
        this.emitChat(this.bot.username, result.text, true);
        this.emit('log', { type: 'action', text: `[AI Replied] "${result.text}"` });
      }
    }
  }

  handleBotError(err) {
    const errorMsg = err?.message || String(err);
    this.emit('log', { type: 'error', text: `Bot connection error: ${errorMsg}` });
    this.state = 'ERROR';
    this.cleanup(false);
    this.scheduleReconnect();
  }

  resetAntiAfkTimer() {
    if (this.antiAfkTimer) {
      clearTimeout(this.antiAfkTimer);
      this.antiAfkTimer = null;
    }

    if (!this.settings.antiAfkEnabled || this.state !== 'SPAWNED') {
      return;
    }

    const baseInterval = (this.settings.antiAfkIntervalSec || 10) * 1000;
    const jitter = (Math.random() * 0.5 - 0.25) * baseInterval;
    const nextInterval = Math.max(3000, Math.round(baseInterval + jitter));

    this.antiAfkTimer = setTimeout(() => {
      this.performAntiAfkAction();
      this.resetAntiAfkTimer();
    }, nextInterval);
  }

  async performAntiAfkAction() {
    if (!this.bot || this.state !== 'SPAWNED' || !this.bot.entity) return;

    const actions = this.settings.antiAfkActions || {};

    try {
      if (actions.swingArm !== false) {
        const hand = Math.random() > 0.5 ? 'right' : 'left';
        this.bot.swingArm(hand);
        this.emit('log', { type: 'action', text: `Anti-AFK: Swung ${hand} hand` });
      }

      if (actions.lookAround !== false) {
        const currentYaw = this.bot.entity.yaw || 0;
        const currentPitch = this.bot.entity.pitch || 0;

        const deltaYaw = (Math.random() * 0.8 - 0.4);
        const deltaPitch = (Math.random() * 0.4 - 0.2);

        const newYaw = currentYaw + deltaYaw;
        const newPitch = Math.max(-1.2, Math.min(1.2, currentPitch + deltaPitch));

        await this.bot.look(newYaw, newPitch, true);
        this.emit('log', { type: 'action', text: `Anti-AFK: Shifted view angle` });
      }

      if (actions.sneak) {
        this.bot.setControlState('sneak', true);
        setTimeout(() => {
          if (this.bot) this.bot.setControlState('sneak', false);
        }, 400);
      }

      if (actions.jump) {
        this.bot.setControlState('jump', true);
        setTimeout(() => {
          if (this.bot) this.bot.setControlState('jump', false);
        }, 300);
      }
    } catch (err) {
      console.warn('Anti-AFK action error:', err.message);
    }
  }

  manualAction(actionType) {
    if (!this.bot || this.state !== 'SPAWNED') {
      throw new Error('Bot is not spawned in a world');
    }

    switch (actionType) {
      case 'swing':
        this.bot.swingArm('right');
        this.emit('log', { type: 'action', text: 'Manual: Swung right arm' });
        break;
      case 'look':
        const randomYaw = (Math.random() * Math.PI * 2) - Math.PI;
        const randomPitch = (Math.random() * 0.6) - 0.3;
        this.bot.look(randomYaw, randomPitch, true);
        this.emit('log', { type: 'action', text: 'Manual: Looked around' });
        break;
      case 'jump':
        this.bot.setControlState('jump', true);
        setTimeout(() => {
          if (this.bot) this.bot.setControlState('jump', false);
        }, 350);
        this.emit('log', { type: 'action', text: 'Manual: Jumped' });
        break;
      default:
        throw new Error(`Unknown action: ${actionType}`);
    }
  }

  sendChat(message) {
    if (!this.bot || this.state !== 'SPAWNED') {
      throw new Error('Cannot send chat: Bot is not connected or spawned');
    }
    if (!message || !message.trim()) return;

    this.bot.chat(message);
    this.emitChat(this.bot.username, message, true);
  }

  disconnect() {
    this.manualDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanup(true);
    this.emit('log', { type: 'system', text: 'Bot disconnected by user.' });
  }

  cleanup(isManual = false) {
    if (this.antiAfkTimer) {
      clearTimeout(this.antiAfkTimer);
      this.antiAfkTimer = null;
    }
    if (isManual) {
      this.state = 'DISCONNECTED';
    }
    this.spawnTime = null;
    if (this.bot) {
      try {
        this.bot.removeAllListeners();
        if (this.bot._client) {
          this.bot._client.removeAllListeners('error');
          this.bot._client.removeAllListeners('playerChat');
        }
        this.bot.quit();
      } catch (e) {
        // ignore
      }
      this.bot = null;
    }
    this.emit('status', this.getStatus());
  }

  scheduleReconnect() {
    if (this.manualDisconnect || !this.settings.autoReconnect || !this.currentServer) {
      return;
    }

    const delaySec = Math.max(15, this.settings.autoReconnectDelaySec || 15);
    const delay = delaySec * 1000;
    this.emit('log', { type: 'warn', text: `Auto-reconnecting in ${delaySec}s...` });

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (!this.manualDisconnect && this.currentServer) {
        this.connect(this.currentServer);
      }
    }, delay);
  }
}
