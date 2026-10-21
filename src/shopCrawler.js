import EventEmitter from 'events';
import { classifyItem, stripFormatting } from './shopParser.js';

export class ShopCrawler extends EventEmitter {
  constructor(botManager, options = {}) {
    super();
    this.botManager = botManager;
    this.command = options.command || '/shop';
    this.baseDelay = options.delay || 1000;
    this.timeoutMs = options.timeout || 5000;
    this.isCrawling = false;
    this.shouldStop = false;
    this.activeWindow = null;
    this.visitedWindows = new Set();
  }

  /**
   * Helper delay with natural human jitter (±15-25%)
   */
  async sleep(ms) {
    const jitter = Math.floor(Math.random() * (ms * 0.3)) - Math.floor(ms * 0.15);
    const finalDelay = Math.max(400, ms + jitter);
    return new Promise(resolve => setTimeout(resolve, finalDelay));
  }

  /**
   * Stops the crawl in progress
   */
  async stop() {
    this.shouldStop = true;
    this.isCrawling = false;
    if (this.botManager?.bot?.currentWindow) {
      try {
        this.botManager.bot.closeWindow(this.botManager.bot.currentWindow);
      } catch {
        // ignore
      }
    }
    this.emit('log', { type: 'system', text: '🛑 Shop crawl stopped by user' });
    this.emit('stopped');
  }

  /**
   * Waits for a windowOpen event or an update to the current window
   */
  waitForWindowChange(timeoutMs = this.timeoutMs) {
    const bot = this.botManager?.bot;
    if (!bot) return Promise.reject(new Error('Bot is not active'));

    return new Promise((resolve, reject) => {
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          cleanup();
          resolve(bot.currentWindow || null);
        }
      }, timeoutMs);

      const onWindowOpen = (window) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(window);
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        bot.removeListener('windowOpen', onWindowOpen);
      };

      bot.once('windowOpen', onWindowOpen);
    });
  }

  getUpperSlotCount(window) {
    if (!window || !window.slots) return 0;
    if (window.inventoryStart != null) return window.inventoryStart;
    if (window.slots.length > 36) return window.slots.length - 36;
    return window.slots.length;
  }

  /**
   * Starts scraping the shop
   */
  async startCrawl(customCommand = null) {
    if (this.isCrawling) {
      throw new Error('A shop crawl is already in progress');
    }

    const bot = this.botManager?.bot;
    if (!bot || !this.botManager.hasSpawned()) {
      throw new Error('Bot is not spawned in the world');
    }

    const cmd = customCommand || this.command;
    this.isCrawling = true;
    this.shouldStop = false;
    this.visitedWindows.clear();

    const catalog = {
      server: this.botManager.currentServer?.host || 'unknown-server',
      scrapedAt: new Date().toISOString(),
      command: cmd,
      totalItems: 0,
      categories: [],
      items: []
    };

    const emitProgress = (stage, detail = '', percent = 0) => {
      this.emit('progress', {
        stage,
        detail,
        percent,
        itemsFound: catalog.items.length
      });
      this.botManager.emit('log', {
        type: 'system',
        text: `[Shop Crawler] ${stage}: ${detail}`
      });
    };

    try {
      emitProgress('Opening Shop', `Executing ${cmd}...`, 5);
      bot.chat(cmd);

      // Wait for shop window to open
      await this.sleep(Math.min(this.baseDelay, 1200));
      let window = bot.currentWindow;

      if (!window) {
        // If window hasn't opened yet, wait for windowOpen event
        window = await this.waitForWindowChange(Math.max(200, this.timeoutMs));
      }

      if (!window || !window.slots) {
        throw new Error(`Shop GUI did not open for ${cmd}. Check if the server uses a different command like /store, /market, or /gui shop.`);
      }

      const rootTitle = stripFormatting(window.title || 'Shop');
      emitProgress('Root Menu Scanned', `Inspecting "${rootTitle}"`, 10);

      // Inspect root window slots
      const upperSlotCount = this.getUpperSlotCount(window);

      const rootCategories = [];
      const rootShopItems = [];

      for (let s = 0; s < upperSlotCount; s++) {
        const item = window.slots[s];
        if (!item) continue;

        const classification = classifyItem(item, s, rootTitle);
        if (classification.type === 'category') {
          rootCategories.push({
            slot: s,
            name: classification.name,
            displayName: classification.displayName,
            lore: classification.lore
          });
        } else if (classification.type === 'shop_item') {
          rootShopItems.push(classification);
        }
      }

      // If the shop doesn't have category sub-menus and directly contains items
      if (rootShopItems.length > 0) {
        catalog.items.push(...rootShopItems);
        catalog.categories.push({
          name: rootTitle,
          items: rootShopItems
        });
      }

      emitProgress('Categories Discovered', `Found ${rootCategories.length} categories to explore`, 20);

      // Traverse each category sub-menu
      for (let cIdx = 0; cIdx < rootCategories.length; cIdx++) {
        if (this.shouldStop) break;

        const cat = rootCategories[cIdx];
        const catPercent = 20 + Math.floor(((cIdx) / rootCategories.length) * 70);
        emitProgress('Exploring Category', `[${cIdx + 1}/${rootCategories.length}] ${cat.displayName}`, catPercent);

        // Click into category
        await this.sleep(this.baseDelay);
        if (!bot.currentWindow) {
          bot.chat(cmd);
          await this.sleep(1000);
        }

        try {
          await bot.clickWindow(cat.slot, 0, 0);
        } catch (err) {
          this.botManager.emit('log', { type: 'warn', text: `Failed to click category slot ${cat.slot}: ${err.message}` });
          continue;
        }

        await this.sleep(this.baseDelay);
        window = bot.currentWindow;
        if (!window) continue;

        const catTitle = stripFormatting(window.title || cat.displayName);
        const categoryData = {
          name: catTitle,
          categoryIcon: cat.name,
          items: []
        };

        // Scan pages in this category
        let hasNextPage = true;
        let pageNum = 1;
        const visitedPages = new Set();

        while (hasNextPage && !this.shouldStop) {
          const currentUpperSlots = this.getUpperSlotCount(window);
          let nextPageSlot = null;
          let backSlot = null;

          for (let s = 0; s < currentUpperSlots; s++) {
            const itm = window.slots[s];
            if (!itm) continue;

            const c = classifyItem(itm, s, catTitle);
            if (c.type === 'shop_item') {
              categoryData.items.push(c);
              catalog.items.push(c);
            } else if (c.type === 'navigation') {
              if (c.action === 'next_page') nextPageSlot = s;
              if (c.action === 'back' || c.action === 'close') backSlot = s;
            }
          }

          visitedPages.add(pageNum);

          if (nextPageSlot !== null && !visitedPages.has(pageNum + 1) && pageNum < 15) {
            emitProgress('Next Page', `${cat.displayName} (Page ${pageNum + 1})`, catPercent);
            await this.sleep(this.baseDelay);
            try {
              await bot.clickWindow(nextPageSlot, 0, 0);
              await this.sleep(this.baseDelay);
              window = bot.currentWindow;
              pageNum++;
            } catch {
              hasNextPage = false;
            }
          } else {
            hasNextPage = false;
          }
        }

        catalog.categories.push(categoryData);

        // Click back button to return to root menu
        if (bot.currentWindow && !this.shouldStop) {
          const currentUpperSlots = this.getUpperSlotCount(window);
          let backSlot = null;
          for (let s = 0; s < currentUpperSlots; s++) {
            const itm = window.slots[s];
            if (!itm) continue;
            const c = classifyItem(itm, s, catTitle);
            if (c.type === 'navigation' && (c.action === 'back' || c.action === 'close')) {
              backSlot = s;
              break;
            }
          }

          if (backSlot !== null) {
            await this.sleep(this.baseDelay);
            try {
              await bot.clickWindow(backSlot, 0, 0);
              await this.sleep(this.baseDelay);
            } catch {
              // ignore
            }
          } else {
            // Re-open /shop if no explicit back button was found
            try {
              bot.closeWindow(bot.currentWindow);
            } catch {}
            await this.sleep(this.baseDelay);
            bot.chat(cmd);
            await this.sleep(1200);
          }
        }
      }

      // Close open window after crawl finishes
      if (bot.currentWindow) {
        try {
          bot.closeWindow(bot.currentWindow);
        } catch {
          // ignore
        }
      }

      catalog.totalItems = catalog.items.length;
      emitProgress('Crawl Complete', `Successfully extracted ${catalog.totalItems} items across ${catalog.categories.length} categories!`, 100);

      this.isCrawling = false;
      this.emit('complete', catalog);
      return catalog;

    } catch (err) {
      this.isCrawling = false;
      if (bot.currentWindow) {
        try { bot.closeWindow(bot.currentWindow); } catch {}
      }
      this.emit('error', err);
      this.botManager.emit('log', { type: 'error', text: `[Shop Crawler Error] ${err.message}` });
      throw err;
    }
  }
}
