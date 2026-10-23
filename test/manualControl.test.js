import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import EventEmitter from 'events';
import { BotManager, STATES } from '../src/botManager.js';
import { sanitizeQuickCommands, DEFAULT_QUICK_COMMANDS } from '../src/storage.js';

describe('Manual Control & Inventory Management', () => {
  let mockStorage;
  let botManager;
  let mockBot;

  beforeEach(() => {
    mockStorage = {
      getSettings: () => ({
        trustedPlayer: 'phyrooss',
        defaultUsername: 'Aaswaam',
        defaultPassword: 'password123',
        autoLogin: true,
        antiAfkEnabled: true,
        autoReconnect: false,
        permittedUsers: []
      }),
      saveSettings: (s) => s,
      saveServer: (srv) => srv,
      getSavedServers: () => []
    };

    botManager = new BotManager(mockStorage);

    mockBot = new EventEmitter();
    mockBot.entity = {
      position: { x: 100, y: 64, z: 200, distanceTo: () => 1.5 }
    };
    mockBot.quickBarSlot = 0;
    mockBot.heldItem = {
      type: 297,
      name: 'bread',
      displayName: 'Bread',
      count: 16,
      slot: 36
    };

    const slots = new Array(46).fill(null);
    slots[5] = { type: 310, name: 'diamond_helmet', displayName: 'Diamond Helmet', count: 1, slot: 5 };
    slots[6] = { type: 311, name: 'diamond_chestplate', displayName: 'Diamond Chestplate', count: 1, slot: 6 };
    slots[36] = mockBot.heldItem;
    slots[37] = { type: 276, name: 'diamond_sword', displayName: 'Diamond Sword', count: 1, slot: 37 };
    slots[10] = { type: 364, name: 'cooked_beef', displayName: 'Cooked Beef', count: 64, slot: 10 };
    slots[45] = { type: 442, name: 'shield', displayName: 'Shield', count: 1, slot: 45 };

    mockBot.inventory = {
      slots,
      items: () => slots.filter(Boolean)
    };

    mockBot.setQuickBarSlot = (slot) => {
      mockBot.quickBarSlot = slot;
      mockBot.heldItem = slots[36 + slot] || null;
    };
    mockBot.activateItem = (offhand) => { mockBot._activated = true; mockBot._offhand = offhand; };
    mockBot.deactivateItem = () => { mockBot._activated = false; };
    mockBot.swingArm = (arm) => { mockBot._swungArm = arm; };
    mockBot.attack = (target) => { mockBot._attackedTarget = target; };
    mockBot.consume = async () => { mockBot._consumed = true; };
    mockBot.tossStack = async (item) => { mockBot._tossedStack = item; };
    mockBot.toss = async (type, meta, count) => { mockBot._tossed = { type, count }; };
    mockBot.moveSlotItem = async (src, dst) => {
      const temp = mockBot.inventory.slots[src];
      mockBot.inventory.slots[src] = mockBot.inventory.slots[dst];
      mockBot.inventory.slots[dst] = temp;
    };
    mockBot.equip = async (item, dest) => { mockBot._equipped = { item, dest }; };
    mockBot.clickWindow = async (slot, btn, mode) => { mockBot._clickedWindow = { slot, btn, mode }; };
    mockBot.controls = {};
    mockBot.setControlState = (control, state) => {
      mockBot.controls[control] = state;
    };
    mockBot.getControlState = (control) => {
      return !!mockBot.controls[control];
    };
    mockBot.clearControlStates = () => {
      mockBot.controls = {};
    };
    mockBot.look = async (yaw, pitch) => {
      mockBot.yaw = yaw;
      mockBot.pitch = pitch;
    };
    mockBot.chat = (msg) => {
      mockBot._lastChat = msg;
    };

    botManager.bot = mockBot;
    botManager.state = STATES.AFK;
  });

  test('1. getInventory returns full breakdown with slots, hotbar, main, armor, offhand', () => {
    const inv = botManager.getInventory();
    assert.equal(inv.quickBarSlot, 0);
    assert.equal(inv.heldItem.name, 'bread');
    assert.equal(inv.armor.helmet.name, 'diamond_helmet');
    assert.equal(inv.armor.chestplate.name, 'diamond_chestplate');
    assert.equal(inv.armor.leggings, null);
    assert.equal(inv.offhand.name, 'shield');
    assert.equal(inv.hotbar.length, 9);
    assert.equal(inv.hotbar[0].item.name, 'bread');
    assert.equal(inv.hotbar[1].item.name, 'diamond_sword');
    assert.equal(inv.main.length, 27);
    assert.equal(inv.main[1].item.name, 'cooked_beef');
  });

  test('2. setQuickBarSlot validates range and switches active slot', () => {
    let emitted = false;
    botManager.on('inventory', (inv) => {
      if (inv.quickBarSlot === 1) emitted = true;
    });

    const res = botManager.setQuickBarSlot(1);
    assert.equal(res.success, true);
    assert.equal(mockBot.quickBarSlot, 1);
    assert.equal(emitted, true);

    assert.throws(() => botManager.setQuickBarSlot(-1));
    assert.throws(() => botManager.setQuickBarSlot(9));
    assert.throws(() => botManager.setQuickBarSlot('invalid'));
  });

  test('3. Right Click and Right Click Hold (activate/deactivate item)', () => {
    const res1 = botManager.rightClick();
    assert.equal(res1.success, true);
    assert.equal(mockBot._activated, true);

    const resHold = botManager.startRightClickHold();
    assert.equal(resHold.success, true);
    assert.equal(botManager.isHoldingRightClick, true);

    const resStop = botManager.stopRightClickHold();
    assert.equal(resStop.success, true);
    assert.equal(botManager.isHoldingRightClick, false);
    assert.equal(mockBot._activated, false);
  });

  test('4. Left Click and Left Click Hold (swing arm and loop)', async () => {
    const res1 = botManager.leftClick();
    assert.equal(res1.success, true);
    assert.equal(mockBot._swungArm, 'right');

    botManager.startLeftClickHold(50);
    assert.equal(botManager.isHoldingLeftClick, true);
    assert.ok(botManager.leftClickInterval);

    await new Promise(r => setTimeout(r, 70));
    assert.equal(mockBot._swungArm, 'right');

    botManager.stopLeftClickHold();
    assert.equal(botManager.isHoldingLeftClick, false);
    assert.equal(botManager.leftClickInterval, null);
  });

  test('5. swapSlots moves items between slots correctly', async () => {
    assert.equal(mockBot.inventory.slots[36].name, 'bread');
    assert.equal(mockBot.inventory.slots[10].name, 'cooked_beef');

    await botManager.swapSlots(36, 10);

    assert.equal(mockBot.inventory.slots[36].name, 'cooked_beef');
    assert.equal(mockBot.inventory.slots[10].name, 'bread');
  });

  test('6. dropHeldItem and consumeHeldItem operate on active slot', async () => {
    await botManager.dropHeldItem(true);
    assert.ok(mockBot._tossedStack);

    await botManager.consumeHeldItem();
    assert.equal(mockBot._consumed, true);
  });

  test('7. manualAction routes hand and click-hold commands', async () => {
    await botManager.manualAction('left_click');
    assert.equal(mockBot._swungArm, 'right');

    botManager.manualAction('start_right_click_hold');
    assert.equal(botManager.isHoldingRightClick, true);

    botManager.manualAction('stop_right_click_hold');
    assert.equal(botManager.isHoldingRightClick, false);
  });

  test('8. cleanup automatically releases right click and stops left click loop', () => {
    botManager.startRightClickHold();
    botManager.startLeftClickHold(100);
    assert.equal(botManager.isHoldingRightClick, true);
    assert.equal(botManager.isHoldingLeftClick, true);

    botManager.cleanup();

    assert.equal(botManager.isHoldingRightClick, false);
    assert.equal(botManager.isHoldingLeftClick, false);
    assert.equal(botManager.leftClickInterval, null);
  });

  test('9. manualAction WASD movement controls activate directional states', async () => {
    await botManager.manualAction('forward');
    assert.equal(mockBot.controls.forward, true);

    await botManager.manualAction('back');
    assert.equal(mockBot.controls.back, true);

    await botManager.manualAction('left');
    assert.equal(mockBot.controls.left, true);

    await botManager.manualAction('right');
    assert.equal(mockBot.controls.right, true);
  });

  test('10. manualAction jump, sneak, and stop controls', async () => {
    await botManager.manualAction('jump');
    assert.equal(mockBot.controls.jump, true);

    await botManager.manualAction('sneak');
    assert.equal(mockBot.controls.sneak, true);

    await botManager.manualAction('stop');
    assert.deepEqual(mockBot.controls, {});
  });

  test('11. manualAction roam and look executes without throwing', async () => {
    // roamChamber uses bot.look and setControlState
    await assert.doesNotReject(async () => {
      await botManager.manualAction('look');
    });
  });

  test('12. executeAfterLoginCommand sends configured command once per connection', async () => {
    botManager.afterLoginCommand = '/smp';
    botManager.afterLoginExecuted = false;

    botManager.executeAfterLoginCommand();
    // Simulate delay
    await new Promise(r => setTimeout(r, 1300));

    assert.equal(mockBot._lastChat, '/smp');
    assert.equal(botManager.afterLoginExecuted, true);

    // Second call in same session should be ignored
    mockBot._lastChat = null;
    botManager.executeAfterLoginCommand();
    await new Promise(r => setTimeout(r, 200));
    assert.equal(mockBot._lastChat, null);
  });

  test('13. Quick commands: sanitizeQuickCommands standardizes and assigns fallback ids', () => {
    const raw = [
      { command: '/warp farm', label: '🌾 Farm', color: 'green' },
      { command: '  /kit pvp  ', color: 'invalid_color' },
      { command: '', label: 'Empty' }
    ];
    const sanitized = sanitizeQuickCommands(raw);
    assert.equal(sanitized.length, 2);
    assert.equal(sanitized[0].command, '/warp farm');
    assert.equal(sanitized[0].label, '🌾 Farm');
    assert.equal(sanitized[0].color, 'green');
    assert.ok(sanitized[0].id);

    assert.equal(sanitized[1].command, '/kit pvp');
    assert.equal(sanitized[1].label, '/kit pvp');
    assert.equal(sanitized[1].color, 'default');
  });

  test('14. Quick commands: empty or invalid list reverts to DEFAULT_QUICK_COMMANDS', () => {
    assert.deepEqual(sanitizeQuickCommands([]), DEFAULT_QUICK_COMMANDS);
    assert.deepEqual(sanitizeQuickCommands(null), DEFAULT_QUICK_COMMANDS);
    assert.deepEqual(sanitizeQuickCommands([{ command: '' }]), DEFAULT_QUICK_COMMANDS);
  });
});
