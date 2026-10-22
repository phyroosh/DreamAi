import mineflayer from 'mineflayer';
import EventEmitter from 'events';
import dns from 'dns';
import net from 'net';
import { AiChatHandler } from './aiChat.js';
import { ActionExecutor } from './commandHandler.js';
import { ShopCrawler } from './shopCrawler.js';

export const STATES = Object.freeze({
  INITIALIZING: 'INITIALIZING',
  CONNECTING: 'CONNECTING',
  JOINED: 'JOINED',
  WAITING_FOR_TPA: 'WAITING_FOR_TPA',
  ACCEPTING_TPA: 'ACCEPTING_TPA',
  VERIFYING_TELEPORT: 'VERIFYING_TELEPORT',
  AFK: 'AFK',
  DISCONNECTED: 'DISCONNECTED',
  RECONNECTING: 'RECONNECTING',
  ERROR: 'ERROR'
});

export const VALID_TRANSITIONS = {
  [STATES.INITIALIZING]: [STATES.CONNECTING, STATES.ERROR, STATES.DISCONNECTED],
  [STATES.CONNECTING]: [STATES.JOINED, STATES.ERROR, STATES.DISCONNECTED, STATES.RECONNECTING],
  [STATES.JOINED]: [STATES.WAITING_FOR_TPA, STATES.ACCEPTING_TPA, STATES.DISCONNECTED, STATES.RECONNECTING, STATES.ERROR],
  [STATES.WAITING_FOR_TPA]: [STATES.ACCEPTING_TPA, STATES.AFK, STATES.DISCONNECTED, STATES.RECONNECTING, STATES.ERROR],
  [STATES.ACCEPTING_TPA]: [STATES.VERIFYING_TELEPORT, STATES.WAITING_FOR_TPA, STATES.DISCONNECTED, STATES.RECONNECTING, STATES.ERROR],
  [STATES.VERIFYING_TELEPORT]: [STATES.AFK, STATES.WAITING_FOR_TPA, STATES.DISCONNECTED, STATES.RECONNECTING, STATES.ERROR],
  [STATES.AFK]: [STATES.WAITING_FOR_TPA, STATES.ACCEPTING_TPA, STATES.DISCONNECTED, STATES.RECONNECTING, STATES.ERROR],
  [STATES.DISCONNECTED]: [STATES.INITIALIZING, STATES.CONNECTING, STATES.RECONNECTING, STATES.ERROR],
  [STATES.RECONNECTING]: [STATES.INITIALIZING, STATES.CONNECTING, STATES.DISCONNECTED, STATES.ERROR],
  [STATES.ERROR]: [STATES.INITIALIZING, STATES.CONNECTING, STATES.DISCONNECTED]
};

export class BotManager extends EventEmitter {
  constructor(storage, options = {}) {
    super();
    this.storage = storage;
    this.botId = options.id || options.botId || 'bot_default';
    this.botName = options.name || options.username || 'Bot';
    this.botConfig = { ...options };
    this.bot = null;
    this.state = STATES.DISCONNECTED;
    this.currentServer = null;
    this.antiAfkTimer = null;
    this.isRoaming = false;
    this.isEating = false;
    this.manualDisconnect = false;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.connectionWatchdog = null;
    this.tpaTimeoutTimer = null;
    this.spawnTime = null;

    // Manual mouse & hand control states
    this.isHoldingRightClick = false;
    this.isHoldingLeftClick = false;
    this.leftClickInterval = null;
    this._lastInvStatus = 0;

    // Farm & Teleport verification
    this.preTeleportPos = null;
    this.preTeleportDim = null;
    this.farmLocation = null;
    this.lastTeleportRequester = null;

    // Rolling buffer of recent server chat for ambient awareness (last 25 messages)
    this.recentChatLog = [];
    this.recentEmittedChats = new Set();

    // Load initial settings
    this.settings = this.storage.getSettings();
    this.trustedPlayer = this.settings.trustedPlayer || process.env.TRUSTED_PLAYER || 'phyrooss';
    this.maxReconnectAttempts = Number(this.settings.maxReconnectAttempts || process.env.MAX_RECONNECT_ATTEMPTS || 10);

    // AI Companion & Physical Action Executor
    this.aiChat = new AiChatHandler({
      model: this.settings.aiModel || 'nvidia/nemotron-3-super-120b-a12b',
      targetUser: this.trustedPlayer
    });
    this.actionExecutor = new ActionExecutor(this);

    // Shop GUI Crawler & Price Extractor
    this.shopCrawler = new ShopCrawler(this);
    this.shopCrawler.on('progress', (data) => this.emit('shop:progress', data));
    this.shopCrawler.on('complete', (catalog) => {
      this.storage?.saveShopCatalog?.(this.currentServer?.host, catalog);
      this.emit('shop:complete', catalog);
    });
    this.shopCrawler.on('stopped', () => this.emit('shop:stopped'));
    this.shopCrawler.on('error', (err) => this.emit('shop:error', { message: err?.message || String(err) }));

    // Rolling buffer of recent system logs (last 100)
    this.systemLogs = [];
    this.on('log', (entry) => {
      const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      this.systemLogs.push({ time, botId: this.botId, botName: this.botName, ...entry });
      if (this.systemLogs.length > 100) this.systemLogs.shift();
    });
  }

  getLogs() {
    return this.systemLogs;
  }

  clearWatchdog() {
    if (this.connectionWatchdog) {
      clearTimeout(this.connectionWatchdog);
      this.connectionWatchdog = null;
    }
  }

  clearTpaTimeout() {
    if (this.tpaTimeoutTimer) {
      clearTimeout(this.tpaTimeoutTimer);
      this.tpaTimeoutTimer = null;
    }
  }

  addChatToRecentLog(sender, text) {
    if (!text || !text.trim()) return;
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.recentChatLog.push(`[${time}] ${sender}: ${text.trim()}`);
    if (this.recentChatLog.length > 25) {
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
      botId: this.botId,
      botName: this.botName,
      sender: cleanSender,
      text: cleanText,
      time: new Date().toLocaleTimeString(),
      isMe
    });
    return true;
  }

  /**
   * Explicit State Machine Transition with validation and logging
   */
  transitionTo(nextState, reason = '') {
    const prevState = this.state;
    if (prevState === nextState) return true;

    const allowed = VALID_TRANSITIONS[prevState] || [];
    if (!allowed.includes(nextState)) {
      this.emit('log', {
        type: 'warn',
        text: `[STATE] Transition rejected: ${prevState} -> ${nextState} (${reason || 'invalid transition'})`
      });
      return false;
    }

    this.state = nextState;
    this.emit('stateChange', { from: prevState, to: nextState, reason });
    this.emit('status', this.getStatus());

    // Standardized log output
    switch (nextState) {
      case STATES.CONNECTING:
        this.emit('log', { type: 'system', text: `[CONNECT] Connecting to the server...` });
        break;
      case STATES.JOINED:
        this.emit('log', { type: 'system', text: `[CONNECT] Successfully joined the server.` });
        break;
      case STATES.WAITING_FOR_TPA:
        this.emit('log', { type: 'system', text: `[TPA] Waiting for a request from the trusted player (${this.trustedPlayer})...` });
        break;
      case STATES.ACCEPTING_TPA:
        this.emit('log', { type: 'system', text: `[TPA] Trusted teleport request detected. Accepting...` });
        break;
      case STATES.VERIFYING_TELEPORT:
        this.emit('log', { type: 'system', text: `[TPA] Teleport accepted. Verifying destination...` });
        break;
      case STATES.AFK:
        const coords = this.farmLocation
          ? ` at farm (${this.farmLocation.x}, ${this.farmLocation.y}, ${this.farmLocation.z})`
          : '';
        this.emit('log', { type: 'system', text: `[AFK] Teleport confirmed. Bot is now standing still${coords}.` });
        break;
      default:
        break;
    }

    return true;
  }

  updateSettings(newSettings) {
    this.settings = this.storage.saveSettings(newSettings);
    if (newSettings.trustedPlayer) {
      this.trustedPlayer = String(newSettings.trustedPlayer).trim();
      if (this.aiChat) this.aiChat.targetUser = this.trustedPlayer.toLowerCase();
    }
    if (newSettings.maxReconnectAttempts) {
      this.maxReconnectAttempts = Number(newSettings.maxReconnectAttempts);
    }
    if (newSettings.aiModel && this.aiChat) {
      this.aiChat.model = newSettings.aiModel;
    }
    if (this.hasSpawned()) {
      this.resetAntiAfkTimer();
    }
    this.emit('settings', this.settings);
    this.emit('status', this.getStatus());
  }

  addPermittedUsers(users) {
    const rawList = Array.isArray(users) ? users : String(users || '').split(',');
    const current = (this.settings.permittedUsers || []).filter(u => u && u.toLowerCase() !== this.trustedPlayer.toLowerCase());
    const updated = [...current];

    for (const item of rawList) {
      const clean = String(item || '').trim();
      if (!clean || clean.toLowerCase() === this.trustedPlayer.toLowerCase()) continue;
      if (!updated.some(u => u.toLowerCase() === clean.toLowerCase())) {
        updated.push(clean);
      }
    }

    this.updateSettings({ permittedUsers: updated });
    return updated;
  }

  removePermittedUser(username) {
    const cleanTarget = String(username || '').trim().toLowerCase();
    if (cleanTarget === this.trustedPlayer.toLowerCase()) {
      return this.settings.permittedUsers || [];
    }
    const current = (this.settings.permittedUsers || []).filter(u => u && u.toLowerCase() !== this.trustedPlayer.toLowerCase());
    const updated = current.filter(u => u.trim().toLowerCase() !== cleanTarget);
    this.updateSettings({ permittedUsers: updated });
    return updated;
  }

  hasSpawned() {
    return [
      STATES.JOINED,
      STATES.WAITING_FOR_TPA,
      STATES.ACCEPTING_TPA,
      STATES.VERIFYING_TELEPORT,
      STATES.AFK
    ].includes(this.state);
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
    const version = this.bot.version || 'Unknown';
    const seed = this.settings.worldSeed || 'Unknown';

    let nearby = 'None';
    try {
      const players = Object.values(this.bot.players)
        .filter(p => p.entity && p.username && p.username.toLowerCase() !== (this.bot.username || '').toLowerCase())
        .map(p => {
          const dist = Math.round(p.entity.position.distanceTo(pos));
          return `${p.username} (${dist}m away)`;
        });
      if (players.length > 0) nearby = players.slice(0, 4).join(', ');
    } catch (e) {}

    return `- Coordinates: X: ${x}, Y: ${y}, Z: ${z}
- Current Dimension: ${dim}
- Health: ${hp}/20
- Food: ${food}/20
- Holding in hand: ${held}
- Nearby Players: ${nearby}
- Minecraft Version: ${version}
- World Seed: ${seed}
- State: ${this.state}
- Trusted Player: ${this.trustedPlayer}`;
  }

  getStatus() {
    let position = null;
    let health = 20;
    let food = 20;
    let experience = { level: 0, points: 0, progress: 0 };
    let weather = 'Clear';
    let timeOfDay = 'Day';
    let gameMode = 'Unknown';
    let dimension = 'Unknown';
    let difficulty = 'Unknown';
    let serverBrand = '';
    let mcVersion = '';

    if (this.bot && this.bot.entity) {
      position = {
        x: Math.round(this.bot.entity.position.x * 10) / 10,
        y: Math.round(this.bot.entity.position.y * 10) / 10,
        z: Math.round(this.bot.entity.position.z * 10) / 10
      };
      health = Math.round(this.bot.health ?? 20);
      food = Math.round(this.bot.food ?? 20);

      if (this.bot.experience) {
        experience = {
          level: this.bot.experience.level ?? 0,
          points: this.bot.experience.points ?? 0,
          progress: Math.round((this.bot.experience.progress ?? 0) * 100)
        };
      }

      if (this.bot.thunderState > 0) weather = 'Thunder ⛈️';
      else if (this.bot.isRaining) weather = 'Rain 🌧️';
      else weather = 'Clear ☀️';

      if (this.bot.time) {
        const t = this.bot.time.timeOfDay;
        if (t >= 0 && t < 6000) timeOfDay = 'Morning 🌅';
        else if (t >= 6000 && t < 12000) timeOfDay = 'Day ☀️';
        else if (t >= 12000 && t < 13000) timeOfDay = 'Dusk 🌇';
        else if (t >= 13000 && t < 23000) timeOfDay = 'Night 🌙';
        else timeOfDay = 'Dawn 🌄';
      }

      if (this.bot.game) {
        gameMode = this.bot.game.gameMode ?? 'Unknown';
        dimension = this.bot.game.dimension ?? 'Unknown';
        difficulty = ['Peaceful', 'Easy', 'Normal', 'Hard'][this.bot.game.difficulty] ?? String(this.bot.game.difficulty ?? 'Unknown');
        serverBrand = this.bot.game.serverBrand ?? '';
        mcVersion = this.bot.version ?? '';
      }
    }

    return {
      botId: this.botId,
      botName: this.botName,
      state: this.state,
      server: this.currentServer,
      username: this.bot?.username || this.currentServer?.username || this.botConfig.username || this.settings.defaultUsername,
      trustedPlayer: this.trustedPlayer,
      farmLocation: this.farmLocation,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      health,
      food,
      position,
      uptime: this.spawnTime ? Math.floor((Date.now() - this.spawnTime) / 1000) : 0,
      antiAfkEnabled: this.settings.antiAfkEnabled,
      aiActive: !!this.aiChat.apiKey,
      settings: this.settings,
      experience,
      weather,
      timeOfDay,
      gameMode,
      dimension,
      difficulty,
      serverBrand,
      mcVersion,
      worldSeed: this.settings.worldSeed || '',
      onlinePlayers: this.getOnlinePlayers(),
      inventory: this.getInventory(),
      isReconnecting: this.state === STATES.RECONNECTING || !!this.reconnectTimer
    };
  }

  getInventory() {
    if (!this.bot || !this.bot.inventory) {
      return {
        botId: this.botId,
        botName: this.botName,
        items: [],
        armor: { helmet: null, chestplate: null, leggings: null, boots: null },
        heldItem: null,
        offhand: null,
        quickBarSlot: 0,
        isHoldingRightClick: !!this.isHoldingRightClick,
        isHoldingLeftClick: !!this.isHoldingLeftClick,
        hotbar: Array.from({ length: 9 }, (_, i) => ({ slot: 36 + i, hotbarIndex: i, item: null, active: i === 0 })),
        main: Array.from({ length: 27 }, (_, i) => ({ slot: 9 + i, item: null }))
      };
    }

    const slots = this.bot.inventory.slots || [];
    const formatItem = (item, slotIdx) => {
      if (!item) return null;
      return {
        slot: typeof item.slot === 'number' ? item.slot : slotIdx,
        id: item.type,
        name: item.name,
        displayName: item.displayName || item.name,
        count: item.count,
        maxDurability: item.maxDurability ?? null,
        durabilityUsed: item.durabilityUsed ?? null
      };
    };

    const items = (this.bot.inventory.items() || []).map(item => formatItem(item, item.slot));
    const activeHotbarIdx = Number(this.bot.quickBarSlot) || 0;

    const hotbar = [];
    for (let i = 0; i < 9; i++) {
      const slotNum = 36 + i;
      hotbar.push({
        slot: slotNum,
        hotbarIndex: i,
        item: formatItem(slots[slotNum], slotNum),
        active: i === activeHotbarIdx
      });
    }

    const main = [];
    for (let i = 0; i < 27; i++) {
      const slotNum = 9 + i;
      main.push({
        slot: slotNum,
        item: formatItem(slots[slotNum], slotNum)
      });
    }

    const armor = {
      helmet: formatItem(slots[5], 5),
      chestplate: formatItem(slots[6], 6),
      leggings: formatItem(slots[7], 7),
      boots: formatItem(slots[8], 8)
    };

    const held = this.bot.heldItem;
    const heldItem = formatItem(held, 36 + activeHotbarIdx);
    const off = slots[45];
    const offhand = formatItem(off, 45);

    return {
      botId: this.botId,
      botName: this.botName,
      items,
      armor,
      heldItem,
      offhand,
      quickBarSlot: activeHotbarIdx,
      isHoldingRightClick: !!this.isHoldingRightClick,
      isHoldingLeftClick: !!this.isHoldingLeftClick,
      hotbar,
      main
    };
  }

  getOnlinePlayers() {
    if (!this.bot || !this.bot.players) return [];
    return Object.values(this.bot.players)
      .filter(p => p && p.username)
      .map(p => ({
        username: p.username,
        ping: p.ping ?? null,
        uuid: p.uuid ?? null
      }));
  }

  async connect(serverConfig) {
    this.clearWatchdog();
    this.clearTpaTimeout();

    if (this.hasSpawned() || this.state === STATES.CONNECTING) {
      this.cleanup(false);
      await new Promise(r => setTimeout(r, 800));
    }

    this.manualDisconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    let host = ((serverConfig.host && String(serverConfig.host).trim()) || (this.botConfig && this.botConfig.host) || '').trim().toLowerCase();
    let port = Number(serverConfig.port) || (this.botConfig && Number(this.botConfig.port)) || 25565;

    // Auto-detect host:port syntax (e.g. paid34.skilloraclouds.com:25585)
    if (host.includes(':')) {
      const parts = host.split(':');
      host = parts[0].trim();
      const parsedPort = parseInt(parts[1], 10);
      if (!isNaN(parsedPort) && parsedPort > 0) {
        port = parsedPort;
      }
    }

    if (!port || isNaN(port) || port <= 0) {
      port = (this.botConfig && this.botConfig.port) || 25565;
    }

    const username = (serverConfig.username && serverConfig.username.trim()) || (this.botConfig && this.botConfig.username) || this.settings.defaultUsername || 'Aaswaam';
    const loginPassword = serverConfig.loginPassword !== undefined ? serverConfig.loginPassword : ((this.botConfig && this.botConfig.loginPassword) || this.settings.defaultPassword);
    const autoLogin = serverConfig.autoLogin !== undefined ? serverConfig.autoLogin : (this.botConfig && this.botConfig.autoLogin !== undefined ? this.botConfig.autoLogin : this.settings.autoLogin);
    let version = serverConfig.version ? serverConfig.version.trim() : ((this.botConfig && this.botConfig.version) || '1.21.4');
    if (!version || version.toLowerCase() === 'auto') {
      version = '1.21.4';
    }

    if (!host) {
      this.transitionTo(STATES.ERROR, 'Server host is required');
      this.emit('log', { type: 'error', text: '[ERROR] Cannot connect: Server host is missing.' });
      return;
    }

    this.transitionTo(STATES.INITIALIZING, 'Preparing connection');

    let targetIp = null;
    const originalDomain = host;

    // DNS & SRV Resolution
    if (net.isIP(host) === 0 && host !== 'localhost') {
      try {
        const resolver = new dns.promises.Resolver();
        resolver.setServers(['8.8.8.8', '1.1.1.1']);

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
          } catch (e) {}
        }

        try {
          const ips = await resolver.resolve4(host);
          if (ips && ips.length > 0) {
            targetIp = ips[0];
          }
        } catch (e) {}
      } catch (err) {}
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

    this.storage.saveServer(this.currentServer);

    this.transitionTo(STATES.CONNECTING, `Connecting to ${targetIp || host}:${port}`);

    const botOptions = {
      host: targetIp || host,
      port,
      fakeHost: originalDomain,
      username,
      auth: 'offline',
      skipValidation: true,
      keepAlive: false, // Prevents minecraft-protocol from running internal suicide timeout timer
      checkTimeoutInterval: 120000
    };

    if (version && version !== 'auto') {
      botOptions.version = version;
    }

    try {
      this.clearWatchdog();
      const currentBot = mineflayer.createBot(botOptions);
      this.bot = currentBot;

      // 90s connection watchdog
      this.connectionWatchdog = setTimeout(() => {
        if (this.state === STATES.CONNECTING && this.bot === currentBot) {
          this.emit('log', { type: 'warn', text: '[CONNECT] Handshake timed out after 90s. Retrying connection...' });
          this.handleBotError(new Error('Connection handshake timed out after 90s'));
        }
      }, 90000);

      const clearIfCurrent = () => {
        if (this.bot === currentBot) {
          this.clearWatchdog();
        }
      };

      currentBot.once('connect', clearIfCurrent);
      currentBot.once('login', clearIfCurrent);
      currentBot.once('spawn', clearIfCurrent);
      currentBot.once('error', clearIfCurrent);
      currentBot.once('end', clearIfCurrent);
      currentBot.once('kicked', clearIfCurrent);

      if (currentBot._client) {
        // Bulletproof Keep-Alive Handler:
        // Always respond immediately to server keep_alive packets so the server never kicks us,
        // without any artificial client-side suicide timeout.
        currentBot._client.on('keep_alive', (packet) => {
          try {
            currentBot._client.write('keep_alive', {
              keepAliveId: packet.keepAliveId
            });
          } catch (e) {
            // Socket in closure state
          }
        });

        currentBot._client.once('connect', () => {
          this.emit('log', { type: 'system', text: '[CONNECT] TCP socket connection established.' });
          if (currentBot._client.socket) {
            try {
              currentBot._client.socket.setKeepAlive(true, 10000); // Send TCP keepalive probe every 10s
              currentBot._client.socket.setNoDelay(true); // Disable Nagle algorithm for instant packets
              this.emit('log', { type: 'system', text: '[NETWORK] TCP keepalive enabled (10s interval) to prevent idle drops.' });
            } catch (e) {
              console.warn('[NETWORK] Failed to set TCP keepalive:', e.message);
            }
          }
        });
        currentBot._client.on('error', (err) => {
          this.emit('log', { type: 'error', text: `Client network error: ${err.message}` });
        });
      }

      currentBot.on('resourcePack', () => {
        try {
          currentBot.acceptResourcePack();
          this.emit('log', { type: 'system', text: '[SERVER] Auto-accepted server resource pack.' });
        } catch (e) {}
      });

      this.setupBotEvents(loginPassword, autoLogin);
    } catch (err) {
      this.clearWatchdog();
      this.handleBotError(err);
    }
  }

  resolvePlayerAndTeam(rawSender) {
    if (!rawSender) return { username: 'Unknown', team: null };
    const clean = String(rawSender).replace(/§./g, '').trim();

    const bracketMatch = clean.match(/^\[([^\]]+)\]\s*([a-zA-Z0-9_]{3,16})$/i);
    if (bracketMatch) {
      return { team: bracketMatch[1].trim(), username: bracketMatch[2].trim() };
    }

    const spaceMatch = clean.match(/^([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_]{3,16})$/i);
    if (spaceMatch) {
      const secondWord = spaceMatch[2].trim();
      if (this.bot && this.bot.players && Object.values(this.bot.players).some(p => p.username.toLowerCase() === secondWord.toLowerCase())) {
        return { team: spaceMatch[1].trim(), username: secondWord };
      }
    }

    if (this.bot && this.bot.players) {
      const directPlayer = Object.values(this.bot.players).find(p => p.username.toLowerCase() === clean.toLowerCase());
      if (directPlayer) {
        return { username: directPlayer.username, team: directPlayer.team || null };
      }
    }

    return { username: clean, team: null };
  }

  parseWhisper(text) {
    if (!text) return null;
    const clean = String(text).replace(/§./g, '').trim();

    const p1 = clean.match(/^(?:\[([^\]]+)\]\s*)?([a-zA-Z0-9_]{3,16})\s+(?:whispers to you|whispers|tells you|whispered to you):\s*(.*)$/i);
    if (p1) {
      return { team: p1[1] || null, sender: p1[2], message: p1[3] };
    }

    const p2 = clean.match(/^(?:\[([^\]]+)\]\s*)?\[\s*([a-zA-Z0-9_]{3,16})\s*->\s*(?:you|me)\s*\]\s*(.*)$/i);
    if (p2) {
      return { team: p2[1] || null, sender: p2[2], message: p2[3] };
    }

    const p3 = clean.match(/^(?:\[([^\]]+)\]\s*)?(?:\[\s*From\s+([a-zA-Z0-9_]{3,16})\s*\]|From\s+([a-zA-Z0-9_]{3,16}):)\s*(.*)$/i);
    if (p3) {
      return { team: p3[1] || null, sender: p3[2] || p3[3], message: p3[4] };
    }

    const p4 = clean.match(/^(?:\[([^\]]+)\]\s*)?([a-zA-Z0-9_]{3,16})\s*(?:->|»)\s*(?:you|me):\s*(.*)$/i);
    if (p4) {
      return { team: p4[1] || null, sender: p4[2], message: p4[3] };
    }

    return null;
  }

  /**
   * Deterministic TPA detection from server message
   */
  detectTpaRequest(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;
    const clean = rawText.replace(/§./g, '').trim();

    // 1. "<Player> has requested to teleport to you" or "has requested that you teleport"
    const m1 = clean.match(/([a-zA-Z0-9_]{3,16})\s+(?:has requested to teleport|has requested that you teleport|wants to teleport to you|requested to teleport|has asked to teleport)/i);
    if (m1) {
      const cmdMatch = clean.match(/\/(tpaccept(?:\s+[a-zA-Z0-9_]{3,16})?|tpyes)/i);
      return {
        sender: m1[1].trim(),
        acceptCommand: cmdMatch ? `/${cmdMatch[1].trim()}` : '/tpaccept',
        raw: clean
      };
    }

    // 2. "[TPA] <Player> sent a teleport request" or "TPA from <Player>"
    const m2 = clean.match(/(?:\[TPA\]|TPA:|\bTPA\b)\s*(?:request\s+from\s+)?([a-zA-Z0-9_]{3,16})/i);
    if (m2) {
      const candidate = m2[1].trim();
      if (!['request', 'from', 'to', 'you', 'type', 'accept'].includes(candidate.toLowerCase())) {
        const cmdMatch = clean.match(/\/(tpaccept(?:\s+[a-zA-Z0-9_]{3,16})?|tpyes)/i);
        return {
          sender: candidate,
          acceptCommand: cmdMatch ? `/${cmdMatch[1].trim()}` : '/tpaccept',
          raw: clean
        };
      }
    }

    // 3. "Teleport request received from <Player>"
    const m3 = clean.match(/teleport request (?:received from|from)\s+([a-zA-Z0-9_]{3,16})/i);
    if (m3) {
      const cmdMatch = clean.match(/\/(tpaccept(?:\s+[a-zA-Z0-9_]{3,16})?|tpyes)/i);
      return {
        sender: m3[1].trim(),
        acceptCommand: cmdMatch ? `/${cmdMatch[1].trim()}` : '/tpaccept',
        raw: clean
      };
    }

    // 4. "To accept, type /tpaccept" or "Type /tpaccept to accept"
    if (clean.includes('/tpaccept') || clean.includes('/tpyes')) {
      const cmdMatch = clean.match(/\/(tpaccept(?:\s+[a-zA-Z0-9_]{3,16})?|tpyes)/i);
      if (cmdMatch) {
        return {
          sender: null,
          acceptCommand: `/${cmdMatch[1].trim()}`,
          raw: clean
        };
      }
    }

    return null;
  }

  /**
   * Accepts incoming TPA request, records position, and enters verification
   */
  async acceptTpaRequest(acceptCommand = '/tpaccept', requester = '') {
    if (this.state !== STATES.WAITING_FOR_TPA && this.state !== STATES.AFK) {
      return;
    }
    if (!this.bot) return;

    this.transitionTo(STATES.ACCEPTING_TPA, `Accepting request from ${requester}`);

    // Snapshot pre-teleport coordinates & dimension
    if (this.bot.entity && this.bot.entity.position) {
      this.preTeleportPos = this.bot.entity.position.clone();
      this.preTeleportDim = this.bot.game?.dimension || 'Overworld';
    } else {
      this.preTeleportPos = null;
      this.preTeleportDim = null;
    }

    // Small delay before command to avoid server packet drop
    await new Promise(r => setTimeout(r, 450));
    if (!this.bot || (this.state !== STATES.ACCEPTING_TPA && this.state !== STATES.VERIFYING_TELEPORT)) return;

    const finalCmd = acceptCommand.startsWith('/') ? acceptCommand : `/${acceptCommand}`;
    this.bot.chat(finalCmd);

    this.transitionTo(STATES.VERIFYING_TELEPORT, `Sent ${finalCmd}`);

    this.clearTpaTimeout();
    const timeoutSec = this.settings.tpaTimeoutSec || 25;
    this.tpaTimeoutTimer = setTimeout(async () => {
      if (this.state === STATES.VERIFYING_TELEPORT) {
        await this.handleTeleportTimeout();
      }
    }, timeoutSec * 1000);
  }

  /**
   * Confirms teleport destination and enters AFK mode
   */
  confirmTeleport(reason = '') {
    if (this.state !== STATES.VERIFYING_TELEPORT) return;

    this.clearTpaTimeout();

    // Snapshot final farm location
    if (this.bot && this.bot.entity && this.bot.entity.position) {
      this.farmLocation = {
        x: Math.round(this.bot.entity.position.x * 10) / 10,
        y: Math.round(this.bot.entity.position.y * 10) / 10,
        z: Math.round(this.bot.entity.position.z * 10) / 10,
        dimension: this.bot.game?.dimension || 'Overworld'
      };
    }

    // Clear all control states so bot remains completely still
    if (this.bot) {
      try {
        this.bot.clearControlStates();
      } catch (e) {}
    }

    this.transitionTo(STATES.AFK, reason || 'Teleport verified');
  }

  /**
   * Handles teleport verification timeout
   */
  async handleTeleportTimeout() {
    this.clearTpaTimeout();
    this.emit('log', {
      type: 'warn',
      text: `[TPA] Teleport verification timed out after ${this.settings.tpaTimeoutSec || 25}s without position change.`
    });

    if (this.aiChat?.apiKey) {
      try {
        const diag = await this.aiChat.diagnoseDisconnection(
          'Teleport verification timed out without movement confirmation',
          this.recentChatLog
        );
        if (diag && diag.explanation) {
          this.emit('log', { type: 'system', text: `[Diagnostics] ${diag.explanation}` });
        }
      } catch (e) {}
    }

    // Return to WAITING_FOR_TPA so trusted player can send another request
    this.transitionTo(STATES.WAITING_FOR_TPA, 'Teleport verification timed out');
  }

  /**
   * Handles teleport cancellation or failure reported by server
   */
  handleTeleportFailure(reason) {
    this.clearTpaTimeout();
    this.emit('log', { type: 'warn', text: `[TPA] ${reason}` });
    this.transitionTo(STATES.WAITING_FOR_TPA, reason);
  }

  setupBotEvents(loginPassword, autoLogin) {
    const bot = this.bot;

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

    // Smart Auto-Auth State
    let authCompleted = false;
    let lastAuthCommand = null;
    let lastAuthTime = 0;
    let authAttempts = 0;
    let pendingAuth = null;
    const MAX_AUTH_ATTEMPTS = 6;

    const executeAuth = (commandType, reason) => {
      if (!autoLogin || !loginPassword) return;
      if (!this.bot) return;

      const now = Date.now();
      if (lastAuthCommand === commandType && (now - lastAuthTime) < 1800) {
        return;
      }
      if (authAttempts >= MAX_AUTH_ATTEMPTS) {
        return;
      }

      if (!this.hasSpawned()) {
        pendingAuth = { commandType, reason };
        return;
      }

      authAttempts++;
      lastAuthCommand = commandType;
      lastAuthTime = now;

      setTimeout(() => {
        if (!this.bot || !this.hasSpawned()) return;

        if (commandType === 'register') {
          this.emit('log', { 
            type: 'system', 
            text: `[Auto-Auth] Registering account (${reason}): /register ******* *******` 
          });
          this.bot.chat(`/register ${loginPassword} ${loginPassword}`);
        } else if (commandType === 'login') {
          this.emit('log', { 
            type: 'system', 
            text: `[Auto-Auth] Logging in (${reason}): /login *******` 
          });
          this.bot.chat(`/login ${loginPassword}`);
        }
      }, 400);
    };

    const checkAuthPrompt = (rawText, source = 'SERVER') => {
      if (!autoLogin || !loginPassword || authCompleted) return;
      if (!rawText || typeof rawText !== 'string') return;

      const clean = rawText.replace(/§./g, '').trim();
      const lower = clean.toLowerCase();
      if (!lower) return;

      if (
        lower.includes('successful login') ||
        lower.includes('successfully logged in') ||
        lower.includes('you are now logged in') ||
        lower.includes('login successful') ||
        lower.includes('registration successful') ||
        lower.includes('successfully registered') ||
        lower.includes('you are now registered') ||
        lower.includes('login accepted') ||
        lower.includes('authentication successful')
      ) {
        if (!authCompleted) {
          authCompleted = true;
          this.emit('log', { type: 'system', text: '✅ [Auto-Auth] Successfully authenticated with server!' });
        }
        return;
      }

      const isRegisterPrompt =
        lower.includes('/register') ||
        lower.includes('/reg ') ||
        lower.includes('register <') ||
        lower.includes('register your') ||
        lower.includes('please register') ||
        lower.includes('use /register') ||
        lower.includes('type /register') ||
        lower.includes('not registered') ||
        lower.includes('unregistered') ||
        lower.includes('register with') ||
        lower.includes('register first') ||
        lower.includes('must register') ||
        lower.includes('need to register') ||
        lower.includes('create a password') ||
        lower.includes('password twice') ||
        lower.includes('password 2 times') ||
        lower.includes('confirm password') ||
        (lower.includes('register') && lower.includes('password'));

      const isLoginPrompt =
        lower.includes('/login') ||
        lower.includes('/l ') ||
        lower.includes('login <') ||
        lower.includes('please login') ||
        lower.includes('use /login') ||
        lower.includes('type /login') ||
        lower.includes('already registered') ||
        lower.includes('login with') ||
        lower.includes('login to continue') ||
        lower.includes('enter your password to continue') ||
        (lower.includes('login') && lower.includes('password'));

      if (lastAuthCommand === 'register' && (lower.includes('already registered') || lower.includes('username taken') || lower.includes('use /login') || lower.includes('please login'))) {
        executeAuth('login', 'Switched to login: account is already registered');
        return;
      }

      if (lastAuthCommand === 'login' && (lower.includes('not registered') || lower.includes('please register') || lower.includes('use /register') || lower.includes('unregistered') || lower.includes('register first') || lower.includes('must register'))) {
        executeAuth('register', 'Switched to register: account not registered yet');
        return;
      }

      if (isRegisterPrompt) {
        executeAuth('register', `Detected register prompt in ${source}`);
      } else if (isLoginPrompt) {
        executeAuth('login', `Detected login prompt in ${source}`);
      }
    };

    /**
     * Unified message pipeline for chat, whispers, system messages, and titles
     */
    const handleIncomingMessage = async (cleanText, source = 'CHAT', senderCandidate = null) => {
      if (!cleanText || typeof cleanText !== 'string') return;
      const clean = cleanText.replace(/§./g, '').trim();
      if (!clean) return;

      checkAuthPrompt(clean, source);

      // Check teleport completion or cancellation during verification
      if (this.state === STATES.VERIFYING_TELEPORT) {
        const lower = clean.toLowerCase();
        if (
          lower.includes('teleport complete') ||
          lower.includes('teleportation complete') ||
          lower.includes('teleported to') ||
          lower.includes('teleporting in') ||
          lower.includes('teleportation commencing') ||
          lower.includes('request accepted') ||
          lower.includes('teleport accepted')
        ) {
          this.confirmTeleport(`Server message confirmation: "${clean}"`);
          return;
        }

        if (
          lower.includes('teleport cancelled') ||
          lower.includes('request timed out') ||
          lower.includes('request expired') ||
          lower.includes('teleport failed')
        ) {
          this.handleTeleportFailure(`Server reported: "${clean}"`);
          return;
        }
      }

      // Check TPA requests when in WAITING_FOR_TPA or AFK
      if (this.state === STATES.WAITING_FOR_TPA || this.state === STATES.AFK) {
        let tpa = this.detectTpaRequest(clean);

        // Fallback to LLM interpreter if message mentions teleport/tpa but regex is ambiguous
        if (!tpa && (clean.toLowerCase().includes('teleport') || clean.toLowerCase().includes('tpa'))) {
          try {
            const aiInterp = await this.aiChat.interpretTeleportMessage(clean, this.recentChatLog);
            if (aiInterp && aiInterp.isTpaRequest) {
              tpa = {
                sender: aiInterp.sender,
                acceptCommand: aiInterp.acceptCommand || '/tpaccept',
                raw: clean
              };
            }
          } catch (e) {}
        }

        if (tpa) {
          let sender = tpa.sender || senderCandidate;
          if (!sender && this.lastTeleportRequester) {
            sender = this.lastTeleportRequester;
          }

          if (sender) {
            this.lastTeleportRequester = sender;
            const isTrusted = sender.trim().toLowerCase() === this.trustedPlayer.toLowerCase();

            if (isTrusted) {
              await this.acceptTpaRequest(tpa.acceptCommand || '/tpaccept', sender);
            } else {
              this.emit('log', {
                type: 'warn',
                text: `[TPA] Ignored teleport request from untrusted player: ${sender}`
              });
            }
          } else if (this.lastTeleportRequester && this.lastTeleportRequester.toLowerCase() === this.trustedPlayer.toLowerCase()) {
            await this.acceptTpaRequest(tpa.acceptCommand || '/tpaccept', this.lastTeleportRequester);
          }
        }
      }
    };

    if (bot._client) {
      bot._client.on('packet', (data, meta) => {
        let sender = null;
        let message = null;
        let isWhisper = false;

        try {
          if (meta.name === 'profileless_chat') {
            sender = extractText(data.name);
            message = extractText(data.message) || data.message;
            if (data.type) {
              const typeStr = JSON.stringify(data.type).toLowerCase();
              if (typeStr.includes('msg_command') || typeStr.includes('whisper')) {
                isWhisper = true;
              }
            }
          } else if (meta.name === 'player_chat') {
            if (data.senderUuid && bot.players) {
              const p = Object.values(bot.players).find(pl => pl.uuid === data.senderUuid);
              if (p) sender = p.username;
            }
            if (!sender && data.senderUuid === '5f0f0818-ef23-3ade-ae93-571e53719fb6') {
              sender = this.trustedPlayer || 'phyrooss';
            }
            if (!sender) {
              sender = extractText(data.networkName || data.senderName);
            }
            message = data.plainMessage || extractText(data.unsignedChatContent || data.formattedMessage);
            if (data.type) {
              const typeStr = JSON.stringify(data.type).toLowerCase();
              if (typeStr.includes('msg_command') || typeStr.includes('whisper')) {
                isWhisper = true;
              }
            }
          } else if (meta.name === 'set_title_text' || meta.name === 'set_subtitle_text' || meta.name === 'set_action_bar_text' || meta.name === 'title') {
            const titleText = extractText(data.text || data.content || data.value);
            if (titleText) {
              handleIncomingMessage(titleText, 'TITLE');
            }
          } else if (meta.name === 'system_chat') {
            message = extractText(data.content || data.formattedMessage);
            if (message) {
              const cleanMsg = message.replace(/§./g, '').trim();
              if (cleanMsg) {
                const whisperData = this.parseWhisper(cleanMsg);
                if (whisperData) {
                  const identity = this.resolvePlayerAndTeam(whisperData.sender);
                  const resolvedUsername = identity.username;
                  const resolvedTeam = whisperData.team || identity.team;
                  const displayTag = `[Whisper] ${resolvedTeam && resolvedUsername.toLowerCase() !== resolvedTeam.toLowerCase() ? `[${resolvedTeam}] ` : ''}${resolvedUsername}`;
                  if (this.emitChat(displayTag, whisperData.message)) {
                    this.addChatToRecentLog(displayTag, whisperData.message);
                    handleIncomingMessage(whisperData.message, 'WHISPER', resolvedUsername);
                    this.handlePotentialAiChat(resolvedUsername, whisperData.message, resolvedTeam, true);
                  }
                  return;
                }

                const sysLabel = data.isActionBar ? 'ACTIONBAR' : 'SERVER';
                if (this.emitChat(sysLabel, cleanMsg)) {
                  this.addChatToRecentLog(sysLabel, cleanMsg);
                  handleIncomingMessage(cleanMsg, sysLabel);
                }
              }
            }
            return;
          } else if (meta.name === 'chat') {
            message = extractText(data.message);
            if (message) {
              const cleanMsg = message.replace(/§./g, '').trim();
              const whisperData = this.parseWhisper(cleanMsg);
              if (whisperData) {
                const identity = this.resolvePlayerAndTeam(whisperData.sender);
                const resolvedUsername = identity.username;
                const resolvedTeam = whisperData.team || identity.team;
                const displayTag = `[Whisper] ${resolvedTeam && resolvedUsername.toLowerCase() !== resolvedTeam.toLowerCase() ? `[${resolvedTeam}] ` : ''}${resolvedUsername}`;
                if (this.emitChat(displayTag, whisperData.message)) {
                  this.addChatToRecentLog(displayTag, whisperData.message);
                  handleIncomingMessage(whisperData.message, 'WHISPER', resolvedUsername);
                  this.handlePotentialAiChat(resolvedUsername, whisperData.message, resolvedTeam, true);
                }
                return;
              }

              const parsed = this.aiChat.parseSenderAndMessage(cleanMsg);
              if (parsed) {
                sender = parsed.sender;
                message = parsed.message;
              } else {
                if (this.emitChat('SERVER', cleanMsg)) {
                  this.addChatToRecentLog('SERVER', cleanMsg);
                  handleIncomingMessage(cleanMsg, 'SERVER');
                }
                return;
              }
            }
          }
        } catch (e) {
          console.error('Error parsing packet:', meta.name, e);
        }

        if (data && data.senderUuid) {
          if (data.senderUuid === '5f0f0818-ef23-3ade-ae93-571e53719fb6') {
            sender = this.trustedPlayer || 'phyrooss';
          } else if (bot.players) {
            const matchedPlayer = Object.values(bot.players).find(pl => pl.uuid === data.senderUuid);
            if (matchedPlayer && matchedPlayer.username) {
              sender = matchedPlayer.username;
            }
          }
        }

        if (sender && message && typeof message === 'string' && message.trim()) {
          const cleanMsg = message.replace(/§./g, '').trim();
          const identity = this.resolvePlayerAndTeam(sender);
          const resolvedUsername = identity.username;
          const resolvedTeam = identity.team;

          const displayTag = resolvedTeam && resolvedUsername.toLowerCase() !== resolvedTeam.toLowerCase()
            ? `[${resolvedTeam}] ${resolvedUsername}`
            : resolvedUsername;

          if (this.emitChat(displayTag, cleanMsg)) {
            this.addChatToRecentLog(displayTag, cleanMsg);
            handleIncomingMessage(cleanMsg, 'CHAT', resolvedUsername);
            this.handlePotentialAiChat(resolvedUsername, cleanMsg, resolvedTeam, isWhisper);
          }
        }
      });
    }

    bot.on('whisper', (username, msg) => {
      const identity = this.resolvePlayerAndTeam(username);
      const displayTag = `[Whisper] ${identity.username}`;
      const cleanMsg = String(msg).replace(/§./g, '').trim();
      if (this.emitChat(displayTag, cleanMsg)) {
        this.addChatToRecentLog(displayTag, cleanMsg);
        handleIncomingMessage(cleanMsg, 'WHISPER', identity.username);
        this.handlePotentialAiChat(identity.username, cleanMsg, identity.team, true);
      }
    });

    bot.on('messagestr', (msg) => {
      if (!msg) return;
      const cleanMsg = String(msg).replace(/§./g, '').trim();
      handleIncomingMessage(cleanMsg, 'MESSAGESTR');
      const whisperData = this.parseWhisper(cleanMsg);
      if (whisperData) {
        const identity = this.resolvePlayerAndTeam(whisperData.sender);
        const resolvedUsername = identity.username;
        const resolvedTeam = whisperData.team || identity.team;
        const displayTag = `[Whisper] ${resolvedTeam && resolvedUsername.toLowerCase() !== resolvedTeam.toLowerCase() ? `[${resolvedTeam}] ` : ''}${resolvedUsername}`;
        if (this.emitChat(displayTag, whisperData.message)) {
          this.addChatToRecentLog(displayTag, whisperData.message);
          this.handlePotentialAiChat(resolvedUsername, whisperData.message, resolvedTeam, true);
        }
      }
    });

    bot.on('windowOpen', (window) => {
      const title = extractText(window.title || '').replace(/§./g, '').trim();
      this.emit('log', { type: 'system', text: `[Server GUI] Window opened: "${title}" (id: ${window.id}, type: ${window.type})` });
      checkAuthPrompt(title, 'WINDOW');
    });

    bot.on('login', () => {
      this.emit('log', { type: 'system', text: `Logged in to server as ${bot.username}` });
    });

    bot.on('spawn', () => {
      this.spawnTime = Date.now();

      // Reset reconnect counter only after remaining connected for 15s
      setTimeout(() => {
        if (this.hasSpawned() && this.bot === bot) {
          this.reconnectAttempts = 0;
        }
      }, 15000);

      this.transitionTo(STATES.JOINED, 'Bot spawned in world');

      if (pendingAuth) {
        executeAuth(pendingAuth.commandType, pendingAuth.reason);
        pendingAuth = null;
      } else if (autoLogin && loginPassword && !authCompleted) {
        setTimeout(() => {
          if (this.state === STATES.JOINED && this.bot && !authCompleted && authAttempts === 0) {
            executeAuth('login', 'Default initial spawn login');
          }
        }, 1500);
      }

      // Check if we were already at the farm before disconnect
      setTimeout(() => {
        if (!this.bot || this.state !== STATES.JOINED) return;

        if (this.farmLocation && this.bot.entity?.position) {
          const currentPos = this.bot.entity.position;
          const farmPos = this.farmLocation;
          const dist = Math.hypot(
            currentPos.x - farmPos.x,
            currentPos.y - farmPos.y,
            currentPos.z - farmPos.z
          );
          if (dist <= 25) {
            this.emit('log', {
              type: 'system',
              text: `[Farm Auto-Resume] Reconnected at farm (${currentPos.x.toFixed(1)}, ${currentPos.y.toFixed(1)}, ${currentPos.z.toFixed(1)}). Resuming AFK stillness!`
            });
            this.confirmTeleport('Auto-resumed farm position after reconnect');
            return;
          }
        }

        this.transitionTo(STATES.WAITING_FOR_TPA, 'Ready to receive teleport request');
      }, 2500);

      this.resetAntiAfkTimer();
    });

    bot.on('health', () => {
      this.emit('status', this.getStatus());
      this.checkAutoEat();
    });

    bot.on('move', () => {
      // Teleport verification check: verify movement displacement > 2.0 blocks
      if (this.state === STATES.VERIFYING_TELEPORT && this.preTeleportPos && this.bot?.entity?.position) {
        const dist = this.bot.entity.position.distanceTo(this.preTeleportPos);
        const currentDim = this.bot.game?.dimension;
        if (dist > 2.0 || (this.preTeleportDim && currentDim && currentDim !== this.preTeleportDim)) {
          this.confirmTeleport(`Position shifted by ${dist.toFixed(1)} blocks`);
          return;
        }
      }

      const now = Date.now();
      if (!this._lastMoveStatus || now - this._lastMoveStatus > 1000) {
        this.emit('status', this.getStatus());
        this._lastMoveStatus = now;
      }
    });

    bot.on('time', () => {
      const now = Date.now();
      if (!this._lastTimeStatus || now - this._lastTimeStatus > 10000) {
        this.emit('status', this.getStatus());
        this._lastTimeStatus = now;
      }
    });

    bot.on('rain', () => this.emit('status', this.getStatus()));
    bot.on('experience', () => this.emit('status', this.getStatus()));

    const updatePlayers = () => this.emit('status', this.getStatus());
    bot.on('playerJoined', updatePlayers);
    bot.on('playerLeft', updatePlayers);

    const updateInventory = () => {
      const now = Date.now();
      if (!this._lastInvStatus || now - this._lastInvStatus > 1000) {
        this.emit('status', this.getStatus());
        this._lastInvStatus = now;
      }
    };

    const hookInventory = () => {
      if (bot.inventory && typeof bot.inventory.on === 'function') {
        try {
          bot.inventory.on('updateSlot', updateInventory);
        } catch (e) {}
      }
    };
    hookInventory();
    bot.on('spawn', hookInventory);

    bot.on('kicked', (reason) => {
      let kickReason = 'Unknown reason';
      try {
        kickReason = typeof reason === 'string' ? reason : JSON.stringify(reason);
      } catch (e) {
        kickReason = String(reason);
      }

      const lower = kickReason.toLowerCase();
      let customDelay = null;
      if (lower.includes('already logged in') || lower.includes('already connected') || lower.includes('another location') || lower.includes('logged in from')) {
        customDelay = 22; // Wait 22s for ghost session to expire on server
        this.emit('log', { type: 'warn', text: `[SERVER] Ghost session detected (${kickReason}). Waiting 22s for server cleanup before reconnecting...` });
      } else if (lower.includes('slow_login') || lower.includes('official minecraft account') || lower.includes('different username') || lower.includes('registered to an official')) {
        const currentUsername = (this.botConfig && this.botConfig.username) || (this.currentServer && this.currentServer.username) || this.botName || 'Bot';
        let fallbackUsername = currentUsername;
        if (!fallbackUsername.endsWith('_99')) {
          fallbackUsername = `${fallbackUsername.replace(/_+$/, '')}_99`;
        } else {
          fallbackUsername = `${fallbackUsername.slice(0, -3)}_88`;
        }
        if (fallbackUsername.length > 16) fallbackUsername = fallbackUsername.substring(0, 16);

        this.emit('log', {
          type: 'warn',
          text: `⚠️ [CONNECT] Server requires official Mojang authentication for "${currentUsername}" (${kickReason}). Automatically adapting offline in-game username to "${fallbackUsername}" to bypass premium auth lock...`
        });

        this.botConfig.username = fallbackUsername;
        if (this.currentServer) {
          this.currentServer.username = fallbackUsername;
          try {
            this.storage.saveServer(this.currentServer);
          } catch (e) {}
        }
        if (this.storage && typeof this.storage.saveBot === 'function') {
          try {
            this.storage.saveBot({
              ...this.botConfig,
              id: this.botId,
              name: this.botName,
              username: fallbackUsername
            });
          } catch (e) {}
        }
        this.reconnectAttempts = 0;
        customDelay = 3;
      } else if (this.state === STATES.AFK) {
        this.emit('log', { type: 'warn', text: `[AFK] Connection lost (kicked: ${kickReason}). Preparing recovery...` });
      } else {
        this.emit('log', { type: 'warn', text: `[CONNECT] Bot was kicked: ${kickReason}` });
      }

      this.cleanup(false);
      this.scheduleReconnect(customDelay);
    });

    bot.on('end', (reason) => {
      const endReason = reason || 'Connection closed';
      let customDelay = null;
      if (endReason === 'socketClosed') {
        customDelay = 16; // Wait 16s for server to cleanly despawn player
      }

      if (this.state === STATES.AFK) {
        this.emit('log', { type: 'warn', text: `[AFK] Connection lost (${endReason}). Preparing recovery...` });
      } else {
        this.emit('log', { type: 'warn', text: `[CONNECT] Connection ended: ${endReason}` });
      }

      this.cleanup(false);
      this.scheduleReconnect(customDelay);
    });

    bot.on('error', (err) => {
      this.handleBotError(err);
    });
  }

  async handlePotentialAiChat(sender, message, team = null, isWhisper = false) {
    if (!this.hasSpawned() || !this.bot) return;

    const lowerSender = sender.toLowerCase().trim();
    const isOwner = lowerSender === this.trustedPlayer.toLowerCase();
    const guestUsers = (this.settings.permittedUsers || []).filter(u => u && u.toLowerCase() !== this.trustedPlayer.toLowerCase());
    const isGuest = guestUsers.some(u => {
      const p = String(u).trim().toLowerCase();
      return p === lowerSender || lowerSender.includes(p) || p.includes(lowerSender);
    });
    const isPermitted = isOwner || isGuest;

    const cleanMsg = message.trim().toLowerCase();
    const asksToWhisper = cleanMsg.includes('whisper') || 
                          cleanMsg.includes('wisper') || 
                          cleanMsg.includes('/msg') || 
                          cleanMsg.includes('/tell') ||
                          cleanMsg.includes('privately') ||
                          cleanMsg.includes('private');

    const shouldWhisperReply = isWhisper || asksToWhisper;
    const mentionsTriggerWord = this.aiChat.triggerWords.some(word => cleanMsg.includes(word));
    const hasTriggerWord = mentionsTriggerWord || shouldWhisperReply;

    if (hasTriggerWord && !isPermitted) {
      const label = team ? `"${sender}" (Team: ${team})` : `"${sender}"`;
      this.emit('log', { type: 'system', text: `[AI Ignored] ${label} called bot, but is not in Permitted Users list!` });
      return;
    }

    if (!isPermitted || !hasTriggerWord) return;

    // Quick direct in-game commands for permitted players
    if (cleanMsg === '!crawlshop' || cleanMsg === '!scan shop' || cleanMsg === '!shopscan') {
      if (this.shopCrawler) {
        this.shopCrawler.startCrawl().catch(e => {
          this.emit('log', { type: 'error', text: `Shop crawl error: ${e.message}` });
        });
        const reply = "Started crawling /shop! I will explore all categories and collect prices.";
        if (shouldWhisperReply) this.bot.chat(`/tell ${sender} ${reply}`);
        else this.bot.chat(reply);
        return;
      }
    }
    if (cleanMsg === '!stopshop' || cleanMsg === '!stopcrawl') {
      if (this.shopCrawler) {
        this.shopCrawler.stop();
        const reply = "Stopped shop crawl.";
        if (shouldWhisperReply) this.bot.chat(`/tell ${sender} ${reply}`);
        else this.bot.chat(reply);
        return;
      }
    }

    const channelTag = shouldWhisperReply ? '[Private Whisper]' : '[Public Chat]';
    const logLabel = team && sender.toLowerCase() !== team.toLowerCase()
      ? `${sender} [Team: ${team}]`
      : sender;
    this.emit('log', { type: 'system', text: `[AI Triggered] ${channelTag} Message from ${logLabel}: "${message}"` });

    const context = this.getBotContext();
    const chatLog = this.recentChatLog.slice(-15).join('\n');
    const actualPlayer = sender;

    const result = await this.aiChat.getReply(actualPlayer, message, context, chatLog, (logEvent) => {
      this.emit('log', logEvent);
    });

    if (result && this.hasSpawned() && this.bot) {
      if (result.commands && result.commands.length > 0) {
        await this.actionExecutor.executeCommands(result.commands, actualPlayer, shouldWhisperReply);
      }

      // In AFK mode, suppress artificial movement actions from LLM unless user explicitly ordered
      if (result.actions && result.actions.length > 0) {
        if (this.state === STATES.AFK) {
          this.emit('log', { type: 'system', text: `[AFK Protection] Retaining stillness; suppressed physical movement actions.` });
        } else {
          await this.actionExecutor.executeActions(result.actions, actualPlayer);
        }
      }

      if (result.text) {
        if (shouldWhisperReply) {
          this.bot.chat(`/tell ${actualPlayer} ${result.text}`);
          this.emitChat(`-> ${actualPlayer} [Whisper]`, result.text, true);
          this.emit('log', { type: 'action', text: `[AI Whispered to ${actualPlayer}] "${result.text}"` });
        } else {
          this.bot.chat(result.text);
          this.emitChat(this.bot.username, result.text, true);
          this.emit('log', { type: 'action', text: `[AI Replied] "${result.text}"` });
        }
      }
    }
  }

  handleBotError(err) {
    this.clearWatchdog();
    this.clearTpaTimeout();
    const errorMsg = err?.message || String(err);
    this.emit('log', { type: 'error', text: `[CONNECT] Bot connection error: ${errorMsg}` });
    if (errorMsg.includes('ECONNREFUSED')) {
      const server = this.currentServer || {};
      const targetStr = server.host ? `${server.host}:${server.port || 25565}` : 'target server';
      this.emit('log', {
        type: 'warn',
        text: `💡 [Troubleshoot] Connection refused (${targetStr}). On cloud/shared hosting (like Skillora Clouds / Aternos): 1) Confirm your server is turned ON in your hosting dashboard, and 2) Ensure you entered your server's assigned port (not 0 or default 25565).`
      });
    }
    this.cleanup(false);
    this.scheduleReconnect();
  }

  resetAntiAfkTimer() {
    if (this.antiAfkTimer) {
      clearTimeout(this.antiAfkTimer);
      this.antiAfkTimer = null;
    }

    if (!this.settings.antiAfkEnabled || !this.hasSpawned()) {
      return;
    }

    const intervalSec = this.settings.antiAfkIntervalSec || 30;
    this.antiAfkTimer = setTimeout(() => {
      this.performAntiAfkAction();
      this.resetAntiAfkTimer();
    }, intervalSec * 1000);
  }

  /**
   * AFK Action: Absolute Stillness in AFK Mode!
   * No moving, jumping, looking around, or punching while in AFK.
   */
  async performAntiAfkAction() {
    if (!this.bot || !this.hasSpawned() || !this.bot.entity) return;

    // AFK Mode: Maintain absolute stillness
    if (this.state === STATES.AFK) {
      try {
        this.bot.clearControlStates();
      } catch (e) {}

      // Optional safe sustenance without movement
      if (this.settings.autoEat !== false) {
        await this.checkAutoEat();
      }
      return;
    }

    // Outside of AFK (e.g. testing or non-AFK states), respect configured actions
    const actions = this.settings.antiAfkActions || {};
    try {
      if (actions.swingArm) {
        this.bot.swingArm('right');
      }
      if (actions.lookAround) {
        const currentYaw = this.bot.entity.yaw || 0;
        const currentPitch = this.bot.entity.pitch || 0;
        const newYaw = currentYaw + (Math.random() * 0.4 - 0.2);
        const newPitch = Math.max(-1.0, Math.min(1.0, currentPitch + (Math.random() * 0.2 - 0.1)));
        await this.bot.look(newYaw, newPitch, true);
      }
    } catch (e) {}
  }

  findBestFood() {
    if (!this.bot || !this.bot.inventory) return null;
    const items = this.bot.inventory.items();
    if (!items || items.length === 0) return null;

    const HARMFUL_FOODS = new Set([
      'rotten_flesh',
      'pufferfish',
      'poisonous_potato',
      'spider_eye',
      'chorus_fruit',
      'suspicious_stew'
    ]);

    const COMMON_FOODS = new Set([
      'cooked_beef', 'cooked_porkchop', 'golden_carrot', 'golden_apple', 'enchanted_golden_apple',
      'cooked_mutton', 'cooked_salmon', 'baked_potato', 'bread', 'cooked_chicken',
      'cooked_cod', 'cooked_rabbit', 'carrot', 'apple', 'melon_slice', 'sweet_berries',
      'glow_berries', 'pumpkin_pie', 'cookie', 'beef', 'porkchop', 'mutton', 'chicken',
      'rabbit', 'salmon', 'cod', 'potato', 'beetroot', 'dried_kelp'
    ]);

    const edible = items.filter(item => {
      if (!item || !item.name) return false;
      if (HARMFUL_FOODS.has(item.name)) return false;
      if (this.bot.registry?.foodsByName && this.bot.registry.foodsByName[item.name]) return true;
      return COMMON_FOODS.has(item.name);
    });

    if (edible.length === 0) return null;

    edible.sort((a, b) => {
      const aPoints = this.bot.registry?.foodsByName?.[a.name]?.foodPoints ?? 4;
      const bPoints = this.bot.registry?.foodsByName?.[b.name]?.foodPoints ?? 4;
      return bPoints - aPoints;
    });

    return edible[0];
  }

  async eatFood(targetItem = null) {
    if (!this.bot || !this.hasSpawned() || !this.bot.entity || this.isEating) return false;
    if (this.bot.food >= 20) return false;

    const foodItem = targetItem || this.findBestFood();
    if (!foodItem) return false;

    this.isEating = true;
    const prevSlot = this.bot.quickBarSlot;

    try {
      this.emit('log', {
        type: 'action',
        text: `Auto-Eat: Low hunger (${Math.round(this.bot.food)}/20). Eating ${foodItem.name}...`
      });

      await this.bot.equip(foodItem, 'hand');
      await this.bot.consume();

      this.emit('log', {
        type: 'action',
        text: `Auto-Eat: Finished eating ${foodItem.name}! Hunger restored to ${Math.round(this.bot.food)}/20.`
      });
      this.emit('status', this.getStatus());
      return true;
    } catch (err) {
      return false;
    } finally {
      if (prevSlot !== undefined && this.bot) {
        try {
          this.bot.setQuickBarSlot(prevSlot);
        } catch (e) {}
      }
      this.isEating = false;
    }
  }

  async checkAutoEat() {
    if (!this.bot || !this.hasSpawned() || !this.bot.entity || this.isEating) return;
    if (this.settings.autoEat === false) return;

    const threshold = this.settings.autoEatThreshold || 16;
    const needsHealing = (this.bot.health < 20 && this.bot.food <= 18);

    if (this.bot.food <= threshold || needsHealing) {
      await this.eatFood();
    }
  }

  sendChat(message) {
    if (!this.bot || !this.hasSpawned()) {
      throw new Error('Cannot send chat: Bot is not connected or spawned');
    }
    if (!message || !message.trim()) return;

    this.bot.chat(message);
    this.emitChat(this.bot.username, message, true);
  }

  disconnect() {
    this.manualDisconnect = true;
    this.clearWatchdog();
    this.clearTpaTimeout();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanup(true);
    this.emit('log', { type: 'system', text: 'Bot disconnected by user.' });
  }

  cleanup(isManual = false) {
    if (this.shopCrawler && this.shopCrawler.isCrawling) {
      this.shopCrawler.stop();
    }
    this.isRoaming = false;
    this.isEating = false;
    this.stopRightClickHold();
    this.stopLeftClickHold();
    this.clearWatchdog();
    this.clearTpaTimeout();
    if (this.antiAfkTimer) {
      clearTimeout(this.antiAfkTimer);
      this.antiAfkTimer = null;
    }
    if (isManual) {
      this.manualDisconnect = true;
      this.reconnectAttempts = 0;
      this.transitionTo(STATES.DISCONNECTED, 'Manual disconnect');
    }
    this.spawnTime = null;
    if (this.bot) {
      try {
        this.bot.clearControlStates();
      } catch (e) {}
      try {
        if (this.bot._client) {
          this.bot._client.removeAllListeners();
          this.bot._client.on('error', () => {}); // Absorb trailing socket closure errors
        }
        this.bot.removeAllListeners();
        this.bot.on('error', () => {}); // Absorb trailing bot closure errors
        this.bot.quit();
      } catch (e) {}
      this.bot = null;
    }
    this.emit('status', this.getStatus());
  }

  /**
   * Controlled reconnection with backoff and maximum retry limit
   */
  scheduleReconnect(customDelay = null) {
    if (this.manualDisconnect) {
      this.transitionTo(STATES.DISCONNECTED, 'Manual disconnect');
      return;
    }
    if (!this.settings.autoReconnect || !this.currentServer) {
      this.transitionTo(STATES.DISCONNECTED, 'Auto-reconnect disabled');
      return;
    }

    // Deduplicate: ignore duplicate triggers while a reconnection timer is already running
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectAttempts++;
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.transitionTo(STATES.ERROR, `Max reconnect attempts reached (${this.maxReconnectAttempts})`);
      this.emit('log', {
        type: 'error',
        text: `[ERROR] Reconnection failed. Reason: Maximum retry limit (${this.maxReconnectAttempts}) reached. Manual intervention required.`
      });
      return;
    }

    const baseDelaySec = customDelay || Math.max(12, this.settings.autoReconnectDelaySec || 12);
    // Backoff factor capped at 60s
    const backoffFactor = Math.min(4, Math.pow(1.15, this.reconnectAttempts - 1));
    const delaySec = Math.min(60, Math.round(baseDelaySec * backoffFactor));

    this.transitionTo(STATES.RECONNECTING, `Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
    this.emit('log', {
      type: 'warn',
      text: `[RECONNECTING] Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delaySec}s...`
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.manualDisconnect && this.currentServer) {
        this.connect(this.currentServer);
      }
    }, delaySec * 1000);
  }

  setQuickBarSlot(slotIndex) {
    if (!this.bot || !this.hasSpawned()) {
      throw new Error('Bot is not spawned in a world');
    }
    const idx = parseInt(slotIndex, 10);
    if (isNaN(idx) || idx < 0 || idx > 8) {
      throw new Error(`Invalid hotbar slot: ${slotIndex}. Must be 0-8.`);
    }
    this.bot.setQuickBarSlot(idx);
    const item = this.bot.heldItem;
    const itemName = item ? (item.displayName || item.name) : 'Empty Hand';
    this.emit('log', { type: 'action', text: `Switched hotbar to slot ${idx + 1} (${itemName})` });
    this.emit('status', this.getStatus());
    this.emit('inventory', this.getInventory());
    return { success: true, slot: idx, heldItem: item ? (item.displayName || item.name) : null };
  }

  startRightClickHold(offHand = false) {
    if (!this.bot || !this.hasSpawned()) {
      throw new Error('Bot is not spawned in a world');
    }
    if (this.isHoldingRightClick) return { success: true, alreadyHolding: true };
    this.isHoldingRightClick = true;
    try {
      this.bot.activateItem(offHand);
    } catch (e) {
      console.warn('[HandAction] Error activating item:', e.message);
    }
    const held = offHand ? (this.bot.inventory?.slots?.[45]) : this.bot.heldItem;
    const label = held ? (held.displayName || held.name) : (offHand ? 'Offhand' : 'Main Hand');
    this.emit('log', { type: 'action', text: `Started holding Right Click (${label})` });
    this.emit('status', this.getStatus());
    this.emit('inventory', this.getInventory());
    return { success: true, isHoldingRightClick: true };
  }

  stopRightClickHold() {
    if (!this.isHoldingRightClick && (!this.bot || !this.bot.usingHeldItem)) {
      return { success: true, alreadyStopped: true };
    }
    this.isHoldingRightClick = false;
    if (this.bot) {
      try {
        this.bot.deactivateItem();
      } catch (e) {
        console.warn('[HandAction] Error deactivating item:', e.message);
      }
    }
    this.emit('log', { type: 'action', text: 'Released Right Click' });
    this.emit('status', this.getStatus());
    this.emit('inventory', this.getInventory());
    return { success: true, isHoldingRightClick: false };
  }

  rightClick(offHand = false) {
    if (!this.bot || !this.hasSpawned()) {
      throw new Error('Bot is not spawned in a world');
    }
    try {
      this.bot.activateItem(offHand);
      setTimeout(() => {
        if (this.bot && !this.isHoldingRightClick) {
          try { this.bot.deactivateItem(); } catch (e) {}
        }
      }, 150);
    } catch (e) {
      console.warn('[HandAction] Right click error:', e.message);
    }
    const held = offHand ? (this.bot.inventory?.slots?.[45]) : this.bot.heldItem;
    const label = held ? (held.displayName || held.name) : 'Hand';
    this.emit('log', { type: 'action', text: `Right Clicked with ${label}` });
    return { success: true };
  }

  leftClick() {
    if (!this.bot || !this.hasSpawned()) {
      throw new Error('Bot is not spawned in a world');
    }
    try {
      this.bot.swingArm('right');
      if (this.bot.nearestEntity) {
        const target = this.bot.nearestEntity(e => (e.type === 'mob' || e.type === 'player') && e !== this.bot.entity && this.bot.entity.position.distanceTo(e.position) <= 3.5);
        if (target) {
          this.bot.attack(target);
        }
      }
    } catch (e) {
      console.warn('[HandAction] Left click error:', e.message);
    }
    this.emit('log', { type: 'action', text: 'Left Click (Punch / Attack)' });
    return { success: true };
  }

  startLeftClickHold(intervalMs = 350) {
    if (!this.bot || !this.hasSpawned()) {
      throw new Error('Bot is not spawned in a world');
    }
    if (this.isHoldingLeftClick) return { success: true, alreadyHolding: true };
    this.isHoldingLeftClick = true;
    this.leftClick();
    this.leftClickInterval = setInterval(() => {
      if (!this.bot || !this.hasSpawned() || !this.isHoldingLeftClick) {
        this.stopLeftClickHold();
        return;
      }
      this.leftClick();
    }, intervalMs);

    this.emit('log', { type: 'action', text: 'Started holding Left Click (Continuous Attack/Swing)' });
    this.emit('status', this.getStatus());
    this.emit('inventory', this.getInventory());
    return { success: true, isHoldingLeftClick: true };
  }

  stopLeftClickHold() {
    if (!this.isHoldingLeftClick && !this.leftClickInterval) {
      return { success: true, alreadyStopped: true };
    }
    this.isHoldingLeftClick = false;
    if (this.leftClickInterval) {
      clearInterval(this.leftClickInterval);
      this.leftClickInterval = null;
    }
    this.emit('log', { type: 'action', text: 'Released Left Click' });
    this.emit('status', this.getStatus());
    this.emit('inventory', this.getInventory());
    return { success: true, isHoldingLeftClick: false };
  }

  async dropHeldItem(all = true) {
    if (!this.bot || !this.hasSpawned()) {
      throw new Error('Bot is not spawned in a world');
    }
    const item = this.bot.heldItem;
    if (!item) {
      this.emit('log', { type: 'warn', text: 'Nothing in main hand to drop.' });
      return { success: false, reason: 'Empty hand' };
    }
    const name = item.displayName || item.name;
    if (all) {
      await this.bot.tossStack(item);
      this.emit('log', { type: 'action', text: `Dropped full stack of ${name}` });
    } else {
      await this.bot.toss(item.type, null, 1);
      this.emit('log', { type: 'action', text: `Dropped 1 of ${name}` });
    }
    this.emit('status', this.getStatus());
    this.emit('inventory', this.getInventory());
    return { success: true };
  }

  async consumeHeldItem() {
    if (!this.bot || !this.hasSpawned()) {
      throw new Error('Bot is not spawned in a world');
    }
    const held = this.bot.heldItem;
    if (!held) {
      this.emit('log', { type: 'warn', text: 'Cannot consume: main hand is empty.' });
      return { success: false, reason: 'Empty hand' };
    }
    const name = held.displayName || held.name;
    this.emit('log', { type: 'action', text: `Consuming ${name}...` });
    try {
      await this.bot.consume();
      this.emit('log', { type: 'action', text: `Finished consuming ${name}.` });
      this.emit('status', this.getStatus());
      this.emit('inventory', this.getInventory());
      return { success: true };
    } catch (e) {
      this.emit('log', { type: 'warn', text: `Failed consuming ${name}: ${e.message}` });
      return { success: false, error: e.message };
    }
  }

  async swapSlots(sourceSlot, destSlot) {
    if (!this.bot || !this.hasSpawned()) {
      throw new Error('Bot is not spawned in a world');
    }
    const src = parseInt(sourceSlot, 10);
    const dst = parseInt(destSlot, 10);
    if (isNaN(src) || isNaN(dst)) {
      throw new Error('Invalid slot numbers for swap');
    }
    await this.bot.moveSlotItem(src, dst);
    this.emit('log', { type: 'action', text: `Moved/Swapped item between slot ${src} and slot ${dst}` });
    this.emit('status', this.getStatus());
    this.emit('inventory', this.getInventory());
    return { success: true, sourceSlot: src, destSlot: dst };
  }

  async dropSlot(slot, count = null) {
    if (!this.bot || !this.hasSpawned()) {
      throw new Error('Bot is not spawned in a world');
    }
    const s = parseInt(slot, 10);
    const item = this.bot.inventory?.slots?.[s];
    if (!item) {
      throw new Error(`Slot ${s} is empty`);
    }
    const name = item.displayName || item.name;
    if (count === null || count >= item.count) {
      await this.bot.tossStack(item);
      this.emit('log', { type: 'action', text: `Dropped all ${item.count}x ${name} from slot ${s}` });
    } else {
      await this.bot.toss(item.type, null, count);
      this.emit('log', { type: 'action', text: `Dropped ${count}x ${name} from slot ${s}` });
    }
    this.emit('status', this.getStatus());
    this.emit('inventory', this.getInventory());
    return { success: true, slot: s };
  }

  async equipSlot(slot, destination = 'hand') {
    if (!this.bot || !this.hasSpawned()) {
      throw new Error('Bot is not spawned in a world');
    }
    const s = parseInt(slot, 10);
    const item = this.bot.inventory?.slots?.[s];
    if (!item) {
      throw new Error(`Slot ${s} is empty`);
    }
    await this.bot.equip(item, destination);
    this.emit('log', { type: 'action', text: `Equipped ${item.displayName || item.name} to ${destination}` });
    this.emit('status', this.getStatus());
    this.emit('inventory', this.getInventory());
    return { success: true, slot: s, destination };
  }

  async clickWindowSlot(slot, mouseButton = 0, mode = 0) {
    if (!this.bot || !this.hasSpawned()) {
      throw new Error('Bot is not spawned in a world');
    }
    const s = parseInt(slot, 10);
    await this.bot.clickWindow(s, mouseButton, mode);
    this.emit('status', this.getStatus());
    this.emit('inventory', this.getInventory());
    return { success: true, slot: s };
  }

  async manualAction(actionType) {
    if (!this.bot || !this.hasSpawned()) {
      throw new Error('Bot is not spawned in a world');
    }

    const act = typeof actionType === 'string' ? actionType : (actionType?.action || '');
    switch (act) {
      case 'eat':
        await this.eatFood();
        break;
      case 'swing':
      case 'left_click':
        this.leftClick();
        break;
      case 'start_left_click_hold':
        this.startLeftClickHold();
        break;
      case 'stop_left_click_hold':
        this.stopLeftClickHold();
        break;
      case 'right_click':
        this.rightClick();
        break;
      case 'start_right_click_hold':
        this.startRightClickHold();
        break;
      case 'stop_right_click_hold':
        this.stopRightClickHold();
        break;
      case 'drop_held':
        await this.dropHeldItem(true);
        break;
      case 'consume':
        await this.consumeHeldItem();
        break;
      case 'accept_tpa':
        this.bot.chat('/tpaccept');
        this.emit('log', { type: 'action', text: 'Manual: Sent /tpaccept' });
        break;
      case 'stand_still':
        this.bot.clearControlStates();
        this.emit('log', { type: 'action', text: 'Manual: Enforced standstill' });
        break;
      default:
        throw new Error(`Unknown manual action: ${act}`);
    }
  }
}
