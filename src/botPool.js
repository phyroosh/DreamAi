import EventEmitter from 'events';
import { BotManager, STATES } from './botManager.js';
import * as storage from './storage.js';

export class BotPool extends EventEmitter {
  constructor(storageInstance = storage) {
    super();
    this.storage = storageInstance;
    this.bots = new Map();
    this.activeBotId = null;

    this.initialize();
  }

  /**
   * Initializes bot instances from persistent storage
   */
  initialize() {
    const savedBots = this.storage.getBots();
    for (const config of savedBots) {
      this.addBot(config, false);
    }

    if (this.bots.size > 0 && !this.activeBotId) {
      this.activeBotId = this.bots.keys().next().value;
    }
  }

  /**
   * Registers a new bot instance in the pool
   */
  addBot(botConfig = {}, persist = true) {
    const rawUser = String(botConfig.username || botConfig.name || `Bot_${this.bots.size + 1}`).trim();
    const id = botConfig.id || `bot_${rawUser.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;

    if (this.bots.has(id)) {
      // Already exists; update config
      const existingBot = this.bots.get(id);
      existingBot.botConfig = { ...existingBot.botConfig, ...botConfig };
      if (persist) {
        this.storage.saveBot(existingBot.botConfig);
      }
      this.emit('bots:updated', this.getBotSummaries());
      return existingBot;
    }

    const normalizedConfig = {
      id,
      name: botConfig.name || rawUser,
      username: botConfig.username || rawUser,
      loginPassword: botConfig.loginPassword || '209801',
      autoLogin: botConfig.autoLogin !== false,
      host: botConfig.host || 'paid34.skilloraclouds.com',
      port: Number(botConfig.port) || 25593,
      version: botConfig.version || '1.21.4',
      autoReconnect: botConfig.autoReconnect !== false,
      antiAfkEnabled: botConfig.antiAfkEnabled !== false,
      antiAfkMode: botConfig.antiAfkMode || 'still'
    };

    const bot = new BotManager(this.storage, normalizedConfig);

    // Forward events with bot identification metadata
    bot.on('status', (st) => this.emit('bot:status', { botId: id, ...st }));
    bot.on('chat', (msg) => this.emit('bot:chat', { botId: id, ...msg }));
    bot.on('log', (entry) => this.emit('bot:log', { botId: id, botName: bot.botName, ...entry }));
    bot.on('inventory', (inv) => this.emit('bot:inventory', { botId: id, ...inv }));
    bot.on('settings', (sett) => this.emit('bot:settings', { botId: id, ...sett }));
    bot.on('stateChange', (sc) => {
      this.emit('bot:stateChange', { botId: id, ...sc });
      this.emit('bots:updated', this.getBotSummaries());
    });
    bot.on('shop:progress', (d) => this.emit('shop:progress', { botId: id, ...d }));
    bot.on('shop:complete', (cat) => this.emit('shop:complete', { botId: id, ...cat }));
    bot.on('shop:stopped', () => this.emit('shop:stopped', { botId: id }));
    bot.on('shop:error', (err) => this.emit('shop:error', { botId: id, ...err }));

    this.bots.set(id, bot);

    if (!this.activeBotId) {
      this.activeBotId = id;
    }

    if (persist) {
      this.storage.saveBot(normalizedConfig);
    }

    this.emit('bots:updated', this.getBotSummaries());
    return bot;
  }

  /**
   * Removes and disconnects a bot instance
   */
  removeBot(botId) {
    const bot = this.getBot(botId);
    if (!bot) return false;

    const actualId = bot.botId;
    bot.cleanup(true);
    this.bots.delete(actualId);
    this.storage.deleteBot(actualId);

    if (this.activeBotId === actualId) {
      this.activeBotId = this.bots.size > 0 ? this.bots.keys().next().value : null;
    }

    this.emit('bots:updated', this.getBotSummaries());
    return true;
  }

  /**
   * Retrieves a bot instance by ID or username
   */
  getBot(id = null) {
    if (!id) {
      if (this.activeBotId && this.bots.has(this.activeBotId)) {
        return this.bots.get(this.activeBotId);
      }
      return this.bots.size > 0 ? this.bots.values().next().value : null;
    }

    if (this.bots.has(id)) {
      return this.bots.get(id);
    }

    const cleanId = String(id).toLowerCase().trim();
    for (const [botId, bot] of this.bots.entries()) {
      if (botId.toLowerCase() === cleanId || 
          bot.botName.toLowerCase() === cleanId || 
          (bot.botConfig.username && bot.botConfig.username.toLowerCase() === cleanId)) {
        return bot;
      }
    }

    return null;
  }

  /**
   * Returns list of summary status objects for all bots in the pool
   */
  getBotSummaries() {
    return Array.from(this.bots.entries()).map(([id, bot]) => {
      const st = bot.getStatus();
      return {
        id,
        name: bot.botName,
        username: bot.botConfig?.username || st.username,
        state: st.state,
        health: st.health,
        food: st.food,
        uptime: st.uptime,
        position: st.position,
        server: st.server || { host: bot.botConfig?.host, port: bot.botConfig?.port },
        isReconnecting: st.isReconnecting,
        isActive: id === this.activeBotId
      };
    });
  }

  /**
   * Sets the active focused bot for legacy routes
   */
  setActiveBot(id) {
    const bot = this.getBot(id);
    if (!bot) return false;
    this.activeBotId = bot.botId;
    this.emit('bots:activeChanged', { activeBotId: this.activeBotId });
    return true;
  }

  /**
   * Initiates connection for a specific bot
   */
  connectBot(id, connectionOptions = {}) {
    const bot = this.getBot(id);
    if (!bot) throw new Error(`Bot with ID or username "${id}" not found`);

    const host = connectionOptions.host || bot.botConfig.host || 'paid34.skilloraclouds.com';
    const port = connectionOptions.port || bot.botConfig.port || 25593;
    const username = connectionOptions.username || bot.botConfig.username || bot.botName;
    const loginPassword = connectionOptions.loginPassword || bot.botConfig.loginPassword || '209801';
    const autoLogin = connectionOptions.autoLogin !== undefined ? connectionOptions.autoLogin : bot.botConfig.autoLogin;
    const version = connectionOptions.version || bot.botConfig.version || '1.21.4';

    bot.connect({
      host,
      port,
      username,
      loginPassword,
      autoLogin,
      version
    });

    return bot;
  }

  /**
   * Disconnects a specific bot
   */
  disconnectBot(id) {
    const bot = this.getBot(id);
    if (!bot) throw new Error(`Bot with ID or username "${id}" not found`);
    bot.disconnect();
    return true;
  }

  /**
   * Connects all registered bots sequentially with staggered delay
   */
  async connectAll(connectionOptions = {}, staggerMs = 2000) {
    const results = [];
    const botList = Array.from(this.bots.values());

    for (let i = 0; i < botList.length; i++) {
      const bot = botList[i];
      try {
        if (bot.state === STATES.DISCONNECTED || bot.state === STATES.ERROR) {
          const { username: _ignored, ...optionsWithoutUsername } = connectionOptions;
          this.connectBot(bot.botId, optionsWithoutUsername);
          results.push({ id: bot.botId, success: true });
        } else {
          results.push({ id: bot.botId, success: true, message: 'Already connected or connecting' });
        }
      } catch (err) {
        results.push({ id: bot.botId, success: false, error: err.message });
      }

      if (i < botList.length - 1 && staggerMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, staggerMs));
      }
    }

    return results;
  }

  /**
   * Disconnects all bots
   */
  disconnectAll() {
    for (const bot of this.bots.values()) {
      try {
        bot.disconnect();
      } catch (e) {}
    }
    return true;
  }

  /**
   * Clean shutdown for all bots in the pool
   */
  cleanupAll() {
    for (const bot of this.bots.values()) {
      try {
        bot.cleanup(true);
      } catch (e) {}
    }
  }
}
