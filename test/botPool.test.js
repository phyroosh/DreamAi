import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import EventEmitter from 'node:events';
import { BotPool } from '../src/botPool.js';
import { STATES } from '../src/botManager.js';

describe('BotPool - Multi-Bot Orchestration & Monitoring', () => {
  let mockStorage;
  let savedBotsMap;

  beforeEach(() => {
    savedBotsMap = new Map([
      ['bot_aaswaam', {
        id: 'bot_aaswaam',
        name: 'Aaswaam',
        username: 'Aaswaam',
        loginPassword: 'password123',
        host: 'mc.example.com',
        port: 25565
      }],
      ['bot_monalisa', {
        id: 'bot_monalisa',
        name: 'MONALISA__',
        username: 'MONALISA__',
        loginPassword: 'password456',
        host: 'mc.example.com',
        port: 25565
      }]
    ]);

    mockStorage = {
      getBots: () => Array.from(savedBotsMap.values()),
      getBot: (id) => savedBotsMap.get(id) || null,
      saveBot: (bot) => { savedBotsMap.set(bot.id, bot); return bot; },
      deleteBot: (id) => savedBotsMap.delete(id),
      getSettings: () => ({
        trustedPlayer: 'phyrooss',
        antiAfkEnabled: true,
        autoReconnect: false
      }),
      saveSettings: (s) => s,
      saveServer: (srv) => srv,
      getSavedServers: () => []
    };
  });

  test('1. Initializes with pre-configured bots (Aaswaam & MONALISA__)', () => {
    const pool = new BotPool(mockStorage);

    assert.equal(pool.bots.size, 2);
    assert.ok(pool.bots.has('bot_aaswaam'));
    assert.ok(pool.bots.has('bot_monalisa'));

    const summaries = pool.getBotSummaries();
    assert.equal(summaries.length, 2);

    const aaswaam = summaries.find(b => b.name === 'Aaswaam' || b.username === 'Aaswaam');
    const monalisa = summaries.find(b => b.name === 'MONALISA__' || b.username === 'MONALISA__');

    assert.ok(aaswaam, 'Aaswaam bot should exist in pool summaries');
    assert.ok(monalisa, 'MONALISA__ bot should exist in pool summaries');
    assert.equal(aaswaam.state, STATES.DISCONNECTED);
    assert.equal(monalisa.state, STATES.DISCONNECTED);
    assert.ok(pool.activeBotId === 'bot_aaswaam' || pool.activeBotId === 'bot_monalisa');
  });

  test('2. Resolves bots by id, username, or active fallback', () => {
    const pool = new BotPool(mockStorage);

    // Exact ID
    const bot1 = pool.getBot('bot_aaswaam');
    assert.equal(bot1.botName, 'Aaswaam');

    // Case-insensitive username
    const bot2 = pool.getBot('monalisa__');
    assert.equal(bot2.botName, 'MONALISA__');

    // Active fallback
    pool.setActiveBot('bot_monalisa');
    const active = pool.getBot();
    assert.equal(active.botId, 'bot_monalisa');
    assert.equal(active.botName, 'MONALISA__');
  });

  test('3. Dynamically adds a new custom bot to the pool', () => {
    const pool = new BotPool(mockStorage);

    let updatedEmitted = false;
    pool.on('bots:updated', (summaries) => {
      if (summaries.some(s => s.username === 'BuilderBot')) {
        updatedEmitted = true;
      }
    });

    const newBot = pool.addBot({
      name: 'BuilderBot',
      username: 'BuilderBot',
      host: 'builder.example.com',
      port: 25577
    });

    assert.ok(newBot);
    assert.equal(newBot.botName, 'BuilderBot');
    assert.equal(pool.bots.size, 3);
    assert.ok(updatedEmitted, 'bots:updated event should be emitted');
    assert.ok(savedBotsMap.has(newBot.botId), 'New bot should be persisted to storage');
  });

  test('4. Removes a bot and reassigns activeBotId if needed', () => {
    const pool = new BotPool(mockStorage);
    pool.setActiveBot('bot_aaswaam');

    const removed = pool.removeBot('bot_aaswaam');
    assert.equal(removed, true);
    assert.equal(pool.bots.size, 1);
    assert.ok(!pool.bots.has('bot_aaswaam'));
    assert.equal(pool.activeBotId, 'bot_monalisa');
    assert.ok(!savedBotsMap.has('bot_aaswaam'), 'Removed bot should be deleted from storage');
  });

  test('5. Aggregates and decorates events with botId and botName', () => {
    const pool = new BotPool(mockStorage);
    const botA = pool.getBot('bot_aaswaam');

    let capturedLog = null;
    let capturedChat = null;

    pool.on('bot:log', (log) => { capturedLog = log; });
    pool.on('bot:chat', (chat) => { capturedChat = chat; });

    botA.emit('log', { type: 'info', text: 'Testing log output' });
    assert.ok(capturedLog);
    assert.equal(capturedLog.botId, 'bot_aaswaam');
    assert.equal(capturedLog.botName, 'Aaswaam');
    assert.equal(capturedLog.text, 'Testing log output');

    botA.emitChat('Server', 'Welcome to the server!', false);
    assert.ok(capturedChat);
    assert.equal(capturedChat.botId, 'bot_aaswaam');
    assert.equal(capturedChat.sender, 'Server');
  });

  test('6. State isolation: actions on one bot do not affect other bots', () => {
    const pool = new BotPool(mockStorage);
    const botA = pool.getBot('bot_aaswaam');
    const botB = pool.getBot('bot_monalisa');

    // Transition botA state
    botA.transitionTo(STATES.INITIALIZING, 'connecting');
    assert.equal(botA.state, STATES.INITIALIZING);
    assert.equal(botB.state, STATES.DISCONNECTED);

    // Bot summaries reflect both independent states
    const summaries = pool.getBotSummaries();
    const sumA = summaries.find(s => s.id === 'bot_aaswaam');
    const sumB = summaries.find(s => s.id === 'bot_monalisa');
    assert.equal(sumA.state, STATES.INITIALIZING);
    assert.equal(sumB.state, STATES.DISCONNECTED);
  });

  test('7. Batch disconnectAll cleans up all bots in pool', () => {
    const pool = new BotPool(mockStorage);
    const botA = pool.getBot('bot_aaswaam');
    const botB = pool.getBot('bot_monalisa');

    let botADisconnected = false;
    let botBDisconnected = false;

    botA.disconnect = () => { botADisconnected = true; };
    botB.disconnect = () => { botBDisconnected = true; };

    pool.disconnectAll();
    assert.equal(botADisconnected, true);
    assert.equal(botBDisconnected, true);
  });

  test('8. Auto-recovery: slow_login kick automatically adapts offline username to bypass premium lock', () => {
    const pool = new BotPool(mockStorage);
    const bot = pool.getBot('bot_monalisa');
    bot.botConfig.username = 'MONALISA__';
    bot.currentServer = { host: 'mc.example.com', port: 25565, username: 'MONALISA__' };

    const fakeBot = new EventEmitter();
    fakeBot.entity = null;
    fakeBot.inventory = { slots: [] };
    bot.bot = fakeBot;
    bot.state = STATES.CONNECTING;
    bot.setupBotEvents('password123', true);

    // Trigger slow_login kick
    fakeBot.emit('kicked', 'multiplayer.disconnect.slow_login');

    assert.equal(bot.botConfig.username, 'MONALISA_99');
    assert.equal(bot.currentServer.username, 'MONALISA_99');
    assert.equal(bot.botName, 'MONALISA__');

    if (bot.reconnectTimer) {
      clearTimeout(bot.reconnectTimer);
      bot.reconnectTimer = null;
    }
  });

  test('9. afterLoginCommand is retained in summaries and custom bot additions', () => {
    const pool = new BotPool(mockStorage);
    const bot = pool.getBot('bot_aaswaam');
    assert.equal(bot.afterLoginCommand, '/home 1');

    const summaries = pool.getBotSummaries();
    const aaswaam = summaries.find(s => s.id === 'bot_aaswaam');
    assert.equal(aaswaam.afterLoginCommand, '/home 1');

    const customBot = pool.addBot({
      name: 'FarmerBot',
      username: 'FarmerBot',
      afterLoginCommand: '/warp farm'
    });
    assert.equal(customBot.afterLoginCommand, '/warp farm');
    const customSummary = pool.getBotSummaries().find(s => s.id === customBot.botId);
    assert.equal(customSummary.afterLoginCommand, '/warp farm');
  });
});
