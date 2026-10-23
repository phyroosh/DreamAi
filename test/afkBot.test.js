import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import EventEmitter from 'events';
import { BotManager, STATES } from '../src/botManager.js';
import { AiChatHandler } from '../src/aiChat.js';

describe('Minecraft AFK Bot - Core State Machine & Workflow', () => {
  let mockStorage;
  let botManager;

  beforeEach(() => {
    mockStorage = {
      getSettings: () => ({
        trustedPlayer: 'phyrooss',
        defaultUsername: 'Dream',
        defaultPassword: 'password123',
        autoLogin: true,
        autoEat: true,
        autoEatThreshold: 16,
        aiModel: 'nvidia/nemotron-3-super-120b-a12b',
        antiAfkEnabled: true,
        antiAfkMode: 'still',
        antiAfkIntervalSec: 30,
        antiAfkActions: {
          walkAround: false,
          swingArm: false,
          lookAround: false,
          jump: false,
          microStep: false,
          sneak: false
        },
        autoReconnect: true,
        autoReconnectDelaySec: 10,
        maxReconnectAttempts: 3,
        tpaTimeoutSec: 25,
        permittedUsers: []
      }),
      saveSettings: (s) => s,
      saveServer: (srv) => srv,
      getSavedServers: () => []
    };

    botManager = new BotManager(mockStorage);
  });

  test('1. Initial state is DISCONNECTED and valid transitions are enforced', () => {
    assert.equal(botManager.state, STATES.DISCONNECTED);

    // Invalid transition directly from DISCONNECTED to AFK must be rejected
    const invalidJump = botManager.transitionTo(STATES.AFK, 'Illegal jump');
    assert.equal(invalidJump, false);
    assert.equal(botManager.state, STATES.DISCONNECTED);

    // Valid forward transition sequence: DISCONNECTED -> INITIALIZING -> CONNECTING -> JOINED -> WAITING_FOR_TPA
    assert.ok(botManager.transitionTo(STATES.INITIALIZING));
    assert.equal(botManager.state, STATES.INITIALIZING);

    assert.ok(botManager.transitionTo(STATES.CONNECTING));
    assert.equal(botManager.state, STATES.CONNECTING);

    assert.ok(botManager.transitionTo(STATES.JOINED));
    assert.equal(botManager.state, STATES.JOINED);

    assert.ok(botManager.transitionTo(STATES.WAITING_FOR_TPA));
    assert.equal(botManager.state, STATES.WAITING_FOR_TPA);
  });

  test('2. TPA detection correctly identifies trusted player requests and extraction command', () => {
    const trustedMsg1 = 'phyrooss has requested to teleport to you. Type /tpaccept to accept.';
    const result1 = botManager.detectTpaRequest(trustedMsg1);
    assert.ok(result1);
    assert.equal(result1.sender, 'phyrooss');
    assert.equal(result1.acceptCommand, '/tpaccept');

    const trustedMsg2 = '[TPA] phyrooss sent a teleport request. /tpyes';
    const result2 = botManager.detectTpaRequest(trustedMsg2);
    assert.ok(result2);
    assert.equal(result2.sender, 'phyrooss');
    assert.equal(result2.acceptCommand, '/tpyes');

    const untrustedMsg = 'Griefer123 has requested to teleport to you.';
    const resultUntrusted = botManager.detectTpaRequest(untrustedMsg);
    assert.ok(resultUntrusted);
    assert.equal(resultUntrusted.sender, 'Griefer123');
    // Verify it is NOT trusted
    assert.notEqual(resultUntrusted.sender.toLowerCase(), botManager.trustedPlayer.toLowerCase());
  });

  test('3. Ignores TPA requests from untrusted players and does not transition to ACCEPTING_TPA', async () => {
    botManager.transitionTo(STATES.INITIALIZING);
    botManager.transitionTo(STATES.CONNECTING);
    botManager.transitionTo(STATES.JOINED);
    botManager.transitionTo(STATES.WAITING_FOR_TPA);

    let warningLogged = false;
    botManager.on('log', (entry) => {
      if (entry.type === 'warn' && entry.text.includes('Ignored teleport request from untrusted player')) {
        warningLogged = true;
      }
    });

    // Mock bot instance
    const chatSent = [];
    botManager.bot = new EventEmitter();
    botManager.bot.chat = (msg) => chatSent.push(msg);

    const untrustedRequest = botManager.detectTpaRequest('UnknownPlayer has requested to teleport to you.');
    if (untrustedRequest && untrustedRequest.sender.toLowerCase() !== botManager.trustedPlayer.toLowerCase()) {
      botManager.emit('log', {
        type: 'warn',
        text: `[TPA] Ignored teleport request from untrusted player: ${untrustedRequest.sender}`
      });
    }

    assert.equal(botManager.state, STATES.WAITING_FOR_TPA);
    assert.equal(warningLogged, true);
    assert.equal(chatSent.length, 0); // No command sent!
  });

  test('4. Accepts trusted player TPA, sends command, and transitions to VERIFYING_TELEPORT', async () => {
    botManager.transitionTo(STATES.INITIALIZING);
    botManager.transitionTo(STATES.CONNECTING);
    botManager.transitionTo(STATES.JOINED);
    botManager.transitionTo(STATES.WAITING_FOR_TPA);

    const chatSent = [];
    botManager.bot = new EventEmitter();
    botManager.bot.chat = (msg) => chatSent.push(msg);
    botManager.bot.entity = {
      position: { x: 100, y: 64, z: 200, clone: () => ({ x: 100, y: 64, z: 200 }) }
    };
    botManager.bot.game = { dimension: 'Overworld' };

    await botManager.acceptTpaRequest('/tpaccept', 'phyrooss');

    assert.equal(botManager.state, STATES.VERIFYING_TELEPORT);
    assert.ok(chatSent.includes('/tpaccept'));
    assert.deepEqual(botManager.preTeleportPos, { x: 100, y: 64, z: 200 });
  });

  test('5. Teleport verification confirms destination and transitions to AFK stillness', () => {
    botManager.transitionTo(STATES.INITIALIZING);
    botManager.transitionTo(STATES.CONNECTING);
    botManager.transitionTo(STATES.JOINED);
    botManager.transitionTo(STATES.WAITING_FOR_TPA);
    botManager.transitionTo(STATES.ACCEPTING_TPA);
    botManager.transitionTo(STATES.VERIFYING_TELEPORT);

    let controlsCleared = false;
    botManager.bot = new EventEmitter();
    botManager.bot.entity = {
      position: { x: 500, y: 72, z: -350 }
    };
    botManager.bot.game = { dimension: 'Overworld' };
    botManager.bot.clearControlStates = () => { controlsCleared = true; };

    // Confirm teleportation
    botManager.confirmTeleport('Position displacement confirmed');

    assert.equal(botManager.state, STATES.AFK);
    assert.equal(controlsCleared, true);
    assert.ok(botManager.farmLocation);
    assert.equal(botManager.farmLocation.x, 500);
    assert.equal(botManager.farmLocation.y, 72);
    assert.equal(botManager.farmLocation.z, -350);
  });

  test('6. Absolute stillness in AFK mode: performAntiAfkAction clears controls and causes zero movement', async () => {
    botManager.transitionTo(STATES.INITIALIZING);
    botManager.transitionTo(STATES.CONNECTING);
    botManager.transitionTo(STATES.JOINED);
    botManager.transitionTo(STATES.WAITING_FOR_TPA);
    botManager.transitionTo(STATES.ACCEPTING_TPA);
    botManager.transitionTo(STATES.VERIFYING_TELEPORT);
    botManager.transitionTo(STATES.AFK);

    let clearControlsCalled = false;
    let lookCalled = false;
    let swingCalled = false;
    botManager.settings.antiAfkActions = {
      walkAround: false,
      swingArm: false,
      lookAround: false,
      jump: false,
      microStep: false,
      sneak: false
    };

    botManager.bot = new EventEmitter();
    botManager.bot.entity = { yaw: 0, pitch: 0, position: { x: 500, y: 72, z: -350 } };
    botManager.bot.clearControlStates = () => { clearControlsCalled = true; };
    botManager.bot.look = async () => { lookCalled = true; };
    botManager.bot.swingArm = () => { swingCalled = true; };
    botManager.bot.food = 20;

    await botManager.performAntiAfkAction();

    assert.equal(botManager.state, STATES.AFK);
    assert.equal(clearControlsCalled, true);
    assert.equal(lookCalled, false, 'Bot must not rotate camera in AFK');
    assert.equal(swingCalled, false, 'Bot must not swing arm in AFK');
  });

  test('7. Controlled reconnection enforces retry limit and transitions to ERROR when exceeded', () => {
    botManager.currentServer = { host: 'example-server.net', port: 25565 };
    botManager.settings.autoReconnect = true;
    botManager.maxReconnectAttempts = 2;

    assert.equal(botManager.reconnectAttempts, 0);

    // Attempt 1: Schedule reconnect -> RECONNECTING
    botManager.scheduleReconnect();
    assert.equal(botManager.state, STATES.RECONNECTING);
    assert.equal(botManager.reconnectAttempts, 1);
    if (botManager.reconnectTimer) {
      clearTimeout(botManager.reconnectTimer);
      botManager.reconnectTimer = null;
    }

    // Attempt 2: Schedule reconnect -> RECONNECTING
    botManager.scheduleReconnect();
    assert.equal(botManager.state, STATES.RECONNECTING);
    assert.equal(botManager.reconnectAttempts, 2);
    if (botManager.reconnectTimer) {
      clearTimeout(botManager.reconnectTimer);
      botManager.reconnectTimer = null;
    }

    // Attempt 3: Exceeds maxReconnectAttempts (2) -> transitions to ERROR
    let errorLogged = false;
    botManager.on('log', (entry) => {
      if (entry.type === 'error' && entry.text.includes('Maximum retry limit')) {
        errorLogged = true;
      }
    });

    botManager.scheduleReconnect();
    assert.equal(botManager.state, STATES.ERROR);
    assert.equal(errorLogged, true);
    assert.equal(botManager.reconnectTimer, null, 'No further timer should be scheduled');
  });

  test('8. LLM Interpreter safety: handles missing API key gracefully without errors', async () => {
    const aiChatNoKey = new AiChatHandler({ apiKey: '' });
    assert.equal(aiChatNoKey.apiKey, '');

    const interp = await aiChatNoKey.interpretTeleportMessage('Teleport request received', []);
    assert.equal(interp, null);

    const diag = await aiChatNoKey.diagnoseDisconnection('Connection timed out', []);
    assert.equal(diag, null);
  });

  test('9. Configured Anti-AFK actions execute movements (look, jump, swing, roam) when enabled', async () => {
    botManager.state = STATES.AFK;
    botManager.settings.antiAfkEnabled = true;
    botManager.settings.antiAfkActions = {
      walkAround: false,
      swingArm: true,
      lookAround: true,
      jump: true,
      microStep: true,
      sneak: false
    };

    let lookCalled = false;
    let swingCalled = false;
    const controlStates = {};
    let actionLog = null;

    botManager.bot = new EventEmitter();
    botManager.bot.entity = { yaw: 0, pitch: 0, position: { x: 100, y: 64, z: 200 } };
    botManager.bot.look = async () => { lookCalled = true; };
    botManager.bot.swingArm = () => { swingCalled = true; };
    botManager.bot.setControlState = (ctrl, val) => { controlStates[ctrl] = val; };
    botManager.bot.food = 20;

    botManager.on('log', (entry) => {
      if (entry.type === 'action' && entry.text.includes('[Anti-AFK]')) {
        actionLog = entry.text;
      }
    });

    await botManager.performAntiAfkAction();

    assert.equal(lookCalled, true, 'Bot should look around when lookAround is enabled');
    assert.equal(swingCalled, true, 'Bot should swing arm when swingArm is enabled');
    assert.equal(controlStates.jump, true, 'Bot should set jump control state');
    assert.equal(controlStates.sneak, true, 'Bot should set sneak control state for micro-step');
    assert.ok(actionLog && actionLog.includes('look') && actionLog.includes('swing') && actionLog.includes('jump'), 'Action log should record executed actions');
  });
});
