import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeEconomy,
  generateAiPrompt,
  generateMarkdownReport,
  findItem
} from '../src/economyAnalyzer.js';

describe('Economy Analyzer - Arbitrage & ROI Intelligence', () => {
  const mockCatalog = {
    server: 'test.hypixel.net',
    items: [
      // Arbitrage case: Log buys for $4, Planks sell for $2 each (1 log -> 4 planks = $8 revenue, $4 profit!)
      { name: 'oak_log', displayName: 'Oak Log', buyPrice: 4.0, sellPrice: 2.0, canBuy: true, canSell: true },
      { name: 'oak_planks', displayName: 'Oak Planks', buyPrice: 3.0, sellPrice: 2.0, canBuy: true, canSell: true },
      
      // Passive crops
      { name: 'cactus', displayName: 'Cactus', buyPrice: 10.0, sellPrice: 5.0, canBuy: true, canSell: true },
      { name: 'sugar_cane', displayName: 'Sugar Cane', buyPrice: 12.0, sellPrice: 3.0, canBuy: true, canSell: true },
      { name: 'pumpkin', displayName: 'Pumpkin', buyPrice: 8.0, sellPrice: 2.0, canBuy: true, canSell: true },

      // Spawners
      { name: 'spawner', displayName: 'Blaze Spawner', buyPrice: 100000, sellPrice: null, canBuy: true, canSell: false },
      { name: 'blaze_rod', displayName: 'Blaze Rod', buyPrice: 100, sellPrice: 50.0, canBuy: true, canSell: true }
    ]
  };

  test('1. Discovers crafting arbitrage opportunities', () => {
    const analysis = analyzeEconomy(mockCatalog);
    assert.ok(analysis.arbitrageOpportunities.length > 0, 'Should find arbitrage');
    const logsToPlanks = analysis.arbitrageOpportunities.find(a => a.recipeName === 'Logs to Planks');
    assert.ok(logsToPlanks, 'Should find Logs to Planks arbitrage');
    assert.equal(logsToPlanks.totalCost, 4.0);
    assert.equal(logsToPlanks.totalRevenue, 8.0);
    assert.equal(logsToPlanks.netProfitPerCraft, 4.0);
    assert.equal(logsToPlanks.profitMarginPct, 100.0);
  });

  test('2. Ranks passive AFK crops by hourly profit', () => {
    const analysis = analyzeEconomy(mockCatalog);
    assert.ok(analysis.passiveFarmRankings.length >= 3);
    // Cactus: 100 plants * 3.33 blocks/hr * 0.80 efficiency * $5 = $1,332/hr
    assert.equal(analysis.passiveFarmRankings[0].crop, 'Cactus');
    assert.equal(analysis.passiveFarmRankings[0].estHourlyProfitPer100Plots, 1332);
  });

  test('3. Computes Spawner payback break-even time', () => {
    const analysis = analyzeEconomy(mockCatalog);
    assert.ok(analysis.spawnerAnalysis.length > 0);
    const blaze = analysis.spawnerAnalysis.find(s => s.mob === 'Blaze');
    assert.ok(blaze);
    assert.equal(blaze.spawnerCost, 100000);
    assert.equal(blaze.dropSellPrice, 50);
    // 450 drops/hr * 50 = 22,500/hr. 100,000 / 22,500 = ~4.4 hrs
    assert.equal(blaze.hoursToBreakEven, 4.4);
  });

  test('4. Generates formatted AI prompt and Markdown report', () => {
    const analysis = analyzeEconomy(mockCatalog);
    const prompt = generateAiPrompt(mockCatalog, analysis);
    assert.ok(prompt.includes('DISCOVERED CRAFTING ARBITRAGE'));
    assert.ok(prompt.includes('Logs to Planks'));
    assert.ok(prompt.includes('Passive AFK Farm Rankings'));

    const report = generateMarkdownReport(analysis, 'Phase 1: Start with wood arbitrage.');
    assert.ok(report.includes('INFINITE MONEY ARBITRAGE DETECTED'));
    assert.ok(report.includes('Phase 1: Start with wood arbitrage.'));
  });

  test('5. findItem enforces strict identifier matching and forbids partial prefix false-positives', () => {
    const sampleItems = [
      { name: 'melon_slice', displayName: 'Melon Slice' },
      { name: 'melon_seeds', displayName: 'Melon Seeds' },
      { name: 'wheat_seeds', displayName: 'Wheat Seeds' },
      { name: 'wheat', displayName: 'Wheat' },
      { name: 'oak_log', displayName: 'Oak Log' }
    ];

    // 'melon' should NOT match 'melon_slice' or 'melon_seeds'
    const foundMelon = findItem(sampleItems, 'melon');
    assert.equal(foundMelon, undefined, 'findItem(melon) must not match melon_slice');

    // 'melon_slice' should match exactly
    const foundSlice = findItem(sampleItems, 'melon_slice');
    assert.ok(foundSlice);
    assert.equal(foundSlice.name, 'melon_slice');

    // 'wheat' should match 'wheat', not 'wheat_seeds'
    const foundWheat = findItem(sampleItems, 'wheat');
    assert.ok(foundWheat);
    assert.equal(foundWheat.name, 'wheat');

    // 'log' should match 'oak_log'
    const foundLog = findItem(sampleItems, 'log');
    assert.ok(foundLog);
    assert.equal(foundLog.name, 'oak_log');
  });

  test('6. Melon Block vs Slice clarification and dual Buy/Sell reporting in prompt & report', () => {
    const catalogWithMelons = {
      server: 'paid34.skilloraclouds.com',
      items: [
        { name: 'melon_slice', displayName: 'Melon Slice', buyPrice: 4.0, sellPrice: 2.0, canBuy: true, canSell: true },
        { name: 'melon_seeds', displayName: 'Melon Seeds', buyPrice: 4.0, sellPrice: 2.0, canBuy: true, canSell: true },
        { name: 'pumpkin', displayName: 'Pumpkin', buyPrice: null, sellPrice: 10.0, canBuy: false, canSell: true },
        { name: 'pumpkin_seeds', displayName: 'Pumpkin Seeds', buyPrice: 2.0, sellPrice: 1.0, canBuy: true, canSell: true }
      ]
    };

    const analysis = analyzeEconomy(catalogWithMelons);
    assert.ok(analysis.melonClarification, 'Should produce melonClarification when block is missing');
    assert.equal(analysis.melonClarification.sliceSellPrice, 2.0);
    assert.equal(analysis.melonClarification.sliceBuyPrice, 4.0);

    const melonSliceCrop = analysis.passiveFarmRankings.find(c => c.name === 'melon_slice');
    assert.ok(melonSliceCrop);
    assert.equal(melonSliceCrop.canBuy, true);
    assert.equal(melonSliceCrop.buyPrice, 4.0);
    assert.equal(melonSliceCrop.sellPrice, 2.0);
    assert.equal(melonSliceCrop.seedBuyPrice, 4.0);

    const pumpkinCrop = analysis.passiveFarmRankings.find(c => c.name === 'pumpkin');
    assert.ok(pumpkinCrop);
    assert.equal(pumpkinCrop.canBuy, false);
    assert.equal(pumpkinCrop.buyPrice, null);
    assert.equal(pumpkinCrop.seedBuyPrice, 2.0);

    const prompt = generateAiPrompt(catalogWithMelons, analysis);
    assert.ok(prompt.includes('Item Economics Clarification (Melon Block vs Melon Slice)'));
    assert.ok(prompt.includes('Melon Slice'));
    assert.ok(prompt.includes('Shop Buy: $4.00'));
    assert.ok(prompt.includes('Shop Buy: Cannot buy directly'));

    const report = generateMarkdownReport(analysis);
    assert.ok(report.includes('Melon Block vs Melon Slice Shop Economics'));
    assert.ok(report.includes('Shop Buy Price'));
    assert.ok(report.includes('Seed Buy Price'));
  });
});

