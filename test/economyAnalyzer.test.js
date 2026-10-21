import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeEconomy,
  generateAiPrompt,
  generateMarkdownReport
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
    // Cactus: 100 * 5 = 500, Sugar cane: 100 * 3 = 300, Pumpkin: 150 * 2 = 300
    assert.equal(analysis.passiveFarmRankings[0].crop, 'Cactus');
    assert.equal(analysis.passiveFarmRankings[0].estHourlyProfitPer100Plots, 500);
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
});
