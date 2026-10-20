import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import EventEmitter from 'events';
import { BotManager, STATES } from '../src/botManager.js';

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
    mockBot.clearControlStates = () => {};

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
});
