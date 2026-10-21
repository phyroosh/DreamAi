import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  stripFormatting,
  extractChatComponentText,
  parsePricesFromLore,
  classifyItem
} from '../src/shopParser.js';

describe('Shop Parser - Minecraft GUI Price & Item Extraction', () => {
  test('1. stripFormatting correctly removes color codes and JSON text formatting', () => {
    assert.equal(stripFormatting('§a$1,500.00'), '$1,500.00');
    assert.equal(stripFormatting('&7[Shop] &eClick to open'), '[Shop] Click to open');
    assert.equal(stripFormatting('§c§lSELL §r§7Price: §e$25.50'), 'SELL Price: $25.50');

    // JSON text component format
    const jsonStr = JSON.stringify({
      text: 'Buy: ',
      extra: [{ text: '$10.00', color: 'green' }]
    });
    assert.equal(stripFormatting(jsonStr), 'Buy: $10.00');
  });

  test('2. parsePricesFromLore handles EconomyShopGUI standard format', () => {
    const lore = [
      '§7Buy: §a$25.00',
      '§7Sell: §c$6.25',
      '§eLeft-click to buy',
      '§eRight-click to sell'
    ];
    const res = parsePricesFromLore(lore, 'Wheat');
    assert.equal(res.canBuy, true);
    assert.equal(res.canSell, true);
    assert.equal(res.buyPrice, 25.0);
    assert.equal(res.sellPrice, 6.25);
  });

  test('3. parsePricesFromLore handles ShopGUIPlus stack and multiplier format', () => {
    const lore = [
      '§8Farming Section',
      '§7Buy 64x: §a$640.00',
      '§7Sell 64x: §c$160.00'
    ];
    const res = parsePricesFromLore(lore, 'Sugar Cane');
    assert.equal(res.canBuy, true);
    assert.equal(res.canSell, true);
    assert.equal(res.buyPrice, 10.0); // 640 / 64
    assert.equal(res.sellPrice, 2.5); // 160 / 64
  });

  test('4. parsePricesFromLore handles unsellable or unbuyable items', () => {
    const lore = [
      '§6Rare Spawner',
      '§7Cost: §a$500,000',
      '§cThis item cannot be sold!'
    ];
    const res = parsePricesFromLore(lore, 'Blaze Spawner');
    assert.equal(res.canBuy, true);
    assert.equal(res.canSell, false);
    assert.equal(res.buyPrice, 500000);
    assert.equal(res.sellPrice, null);
  });

  test('5. parsePricesFromLore handles multiplier abbreviations (k, m)', () => {
    const lore = [
      '§7Buy: $1.5k',
      '§7Sell: $500'
    ];
    const res = parsePricesFromLore(lore, 'Nether Star');
    assert.equal(res.buyPrice, 1500);
    assert.equal(res.sellPrice, 500);
  });

  test('6. classifyItem distinguishes between filler, navigation, categories, and items', () => {
    // Glass pane filler
    const fillerItem = {
      name: 'gray_stained_glass_pane',
      displayName: ' ',
      customLore: []
    };
    assert.equal(classifyItem(fillerItem, 0).type, 'filler');

    // Back button
    const backItem = {
      name: 'barrier',
      displayName: '§c« Back to Main Menu',
      customLore: ['§7Return to categories']
    };
    const backClass = classifyItem(backItem, 45);
    assert.equal(backClass.type, 'navigation');
    assert.equal(backClass.action, 'back');

    // Next page
    const nextItem = {
      name: 'arrow',
      displayName: '§eNext Page »',
      customLore: ['§7Go to page 2']
    };
    const nextClass = classifyItem(nextItem, 53);
    assert.equal(nextClass.type, 'navigation');
    assert.equal(nextClass.action, 'next_page');

    // Category folder
    const catItem = {
      name: 'wheat',
      displayName: '§aFarming Shop',
      customLore: ['§7Click to view farming goods']
    };
    assert.equal(classifyItem(catItem, 11).type, 'category');

    // Shop item
    const shopItem = {
      name: 'cactus',
      displayName: '§2Cactus',
      customLore: ['§7Buy: §a$8.00', '§7Sell: §c$3.50']
    };
    const shopClass = classifyItem(shopItem, 20);
    assert.equal(shopClass.type, 'shop_item');
    assert.equal(shopClass.sellPrice, 3.5);
  });

  test('7. stripFormatting and extractLore handle raw JSON component objects (1.21.4 Paper/Spigot)', () => {
    // Component object for window title or item name
    const titleObj = {
      text: 'Server Shop',
      color: 'dark_gray',
      bold: true
    };
    assert.equal(stripFormatting(titleObj), 'Server Shop');

    // Lore array composed of component objects with extra
    const modernItem = {
      name: 'blaze_rod',
      customName: { text: 'Blaze Rod', color: 'gold' },
      customLore: [
        { text: '', extra: [{ text: 'Buy: ', color: 'gray' }, { text: '$150.00', color: 'green' }] },
        { text: '', extra: [{ text: 'Sell: ', color: 'gray' }, { text: '$50.00', color: 'red' }] }
      ]
    };

    const parsed = classifyItem(modernItem, 10, titleObj);
    assert.equal(parsed.displayName, 'Blaze Rod');
    assert.notEqual(parsed.displayName, '[object Object]');
    assert.equal(parsed.type, 'shop_item');
    assert.equal(parsed.buyPrice, 150.0);
    assert.equal(parsed.sellPrice, 50.0);
  });

  test('8. Category detection correctly identifies root category icons without explicit lore keywords', () => {
    const categoryIcon = {
      name: 'iron_pickaxe',
      displayName: { text: 'Mining Shop' },
      customLore: [{ text: 'Items: 42' }]
    };
    const parsed = classifyItem(categoryIcon, 4);
    assert.equal(parsed.type, 'category');
    assert.equal(parsed.displayName, 'Mining Shop');
  });

  test('9. parsePricesFromLore handles multi-line EconomyShopGUI price format (Line N: Buy Price, Line N+1: ■ $10.00)', () => {
    const lore = [
      'Buy Price',
      '■ $10.00',
      'Sell Price',
      '■ $5.00',
      'Usage:',
      '╚» Left click to buy',
      '╚» Shift + Right Click to sell all',
      '╚» Right click to sell'
    ];
    const res = parsePricesFromLore(lore, 'Lime Wool');
    assert.equal(res.canBuy, true);
    assert.equal(res.canSell, true);
    assert.equal(res.buyPrice, 10.0);
    assert.equal(res.sellPrice, 5.0);

    const item = {
      name: 'lime_wool',
      displayName: 'Lime Wool',
      customLore: lore
    };
    const classified = classifyItem(item, 14, 'Blocks');
    assert.equal(classified.type, 'shop_item');
    assert.equal(classified.buyPrice, 10.0);
    assert.equal(classified.sellPrice, 5.0);
  });
});

