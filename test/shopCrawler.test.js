import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import EventEmitter from 'events';
import { ShopCrawler } from '../src/shopCrawler.js';

describe('Shop Crawler - GUI Traversal & Price Harvester', () => {
  let mockBot;
  let mockBotManager;
  let crawler;

  beforeEach(() => {
    mockBot = new EventEmitter();
    mockBot.currentWindow = null;
    mockBot.chat = (msg) => {
      // Simulate opening root window on /shop
      if (msg === '/shop') {
        mockBot.currentWindow = {
          title: '§8Server Shop',
          type: 'minecraft:chest',
          slots: [
            // Category: Farming
            {
              slot: 0,
              type: 296,
              name: 'wheat',
              displayName: '§aFarming Shop',
              customLore: ['§7Click to view farming goods']
            },
            // Filler
            {
              slot: 1,
              type: 160,
              name: 'gray_stained_glass_pane',
              displayName: ' ',
              customLore: []
            }
          ]
        };
        mockBot.emit('windowOpen', mockBot.currentWindow);
      }
    };

    mockBot.clickWindow = async (slot) => {
      if (slot === 0) {
        // Opened category window
        mockBot.currentWindow = {
          title: '§8Farming Shop - Page 1',
          type: 'minecraft:chest',
          slots: [
            // Item 1: Cactus
            {
              slot: 0,
              type: 81,
              name: 'cactus',
              displayName: '§2Cactus',
              customLore: ['§7Buy: §a$10.00', '§7Sell: §c$4.50']
            },
            // Back button
            {
              slot: 1,
              type: 166,
              name: 'barrier',
              displayName: '§c« Back to Main Menu',
              customLore: ['§7Return to categories']
            }
          ]
        };
      } else if (slot === 1) {
        // Clicked back button
        mockBot.currentWindow = {
          title: '§8Server Shop',
          type: 'minecraft:chest',
          slots: []
        };
      }
    };

    mockBot.closeWindow = () => {
      mockBot.currentWindow = null;
    };

    mockBotManager = new EventEmitter();
    mockBotManager.bot = mockBot;
    mockBotManager.hasSpawned = () => true;
    mockBotManager.currentServer = { host: 'hypixel.net' };

    crawler = new ShopCrawler(mockBotManager, {
      command: '/shop',
      delay: 10 // fast for tests
    });
  });

  test('1. Crawls root menu, navigates into category, extracts item, and returns', async () => {
    const catalog = await crawler.startCrawl();

    assert.ok(catalog);
    assert.equal(catalog.server, 'hypixel.net');
    assert.ok(catalog.categories.length >= 1);
    
    // Check extracted item
    const cactus = catalog.items.find(i => i.name === 'cactus');
    assert.ok(cactus, 'Cactus should be found');
    assert.equal(cactus.buyPrice, 10.0);
    assert.equal(cactus.sellPrice, 4.5);
    assert.equal(cactus.canBuy, true);
    assert.equal(cactus.canSell, true);
  });

  test('2. Gracefully stops crawl when stop() is called', async () => {
    let stoppedEvent = false;
    crawler.on('stopped', () => { stoppedEvent = true; });

    crawler.stop();
    assert.equal(crawler.isCrawling, false);
    assert.equal(stoppedEvent, true);
  });
});
