import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  auditArbitrageOpportunities,
  CONVERSION_RECIPES
} from '../src/arbitrageEngine.js';
import { normalizeListing } from '../src/dataModel.js';

describe('Arbitrage & Economic Conversion Engine', () => {
  test('1. Direct buy/sell arbitrage detects shop pricing inversions and classifies as transaction exploit', () => {
    const listings = [
      // Normal item: Buy $10, Sell $2.50 (no arbitrage)
      normalizeListing({ name: 'iron_ingot', buyPrice: 10, sellPrice: 2.5, canBuy: true, canSell: true }),
      // Exploitative item: Buy $5, Sell $15 (direct pricing inversion!)
      normalizeListing({ name: 'nether_star', buyPrice: 5, sellPrice: 15, canBuy: true, canSell: true })
    ];

    const audit = auditArbitrageOpportunities(listings);
    assert.equal(audit.transaction_exploits.length, 1);
    const exploit = audit.transaction_exploits[0];
    assert.equal(exploit.item_id, 'nether_star');
    assert.equal(exploit.player_buy_price, 5);
    assert.equal(exploit.player_sell_price, 15);
    assert.equal(exploit.profit_per_unit, 10);
    assert.equal(exploit.profit_margin_pct, 200.0);
    assert.equal(exploit.classification, 'transaction_exploit');
  });

  test('2. Crafting conversions calculate profit with correct signs and account for all ingredients', () => {
    // 1 Log ($4) -> 4 Planks (sell $2 each = $8 revenue). Net profit: +$4.
    const listings = [
      normalizeListing({ name: 'oak_log', buyPrice: 4.0, sellPrice: 1.0, canBuy: true, canSell: true }),
      normalizeListing({ name: 'oak_planks', buyPrice: 3.0, sellPrice: 2.0, canBuy: true, canSell: true })
    ];

    const audit = auditArbitrageOpportunities(listings);
    assert.ok(audit.confirmed_arbitrage.length >= 1);
    const logsToPlanks = audit.confirmed_arbitrage.find(a => a.recipe_id === 'log_to_planks');
    assert.ok(logsToPlanks);
    assert.equal(logsToPlanks.total_acquisition_cost, 4.0);
    assert.equal(logsToPlanks.total_sale_revenue, 8.0);
    assert.equal(logsToPlanks.net_profit_per_cycle, 4.0);
    assert.equal(logsToPlanks.profit_margin_pct, 100.0);
    assert.equal(logsToPlanks.profit_per_unit_output, 1.0); // $4 profit / 4 planks
    assert.equal(logsToPlanks.classification, 'confirmed_arbitrage');
  });

  test('3. Smelting conversions account for fuel cost (coal)', () => {
    // 1 Sand ($1) + 0.125 Coal ($8 * 0.125 = $1) = $2 expense. Glass sells for $5 -> Net profit +$3.
    const listings = [
      normalizeListing({ name: 'sand', buyPrice: 1.0, sellPrice: 0.5, canBuy: true, canSell: true }),
      normalizeListing({ name: 'coal', buyPrice: 8.0, sellPrice: 2.0, canBuy: true, canSell: true }),
      normalizeListing({ name: 'glass', buyPrice: 10.0, sellPrice: 5.0, canBuy: true, canSell: true })
    ];

    const audit = auditArbitrageOpportunities(listings);
    const smeltSand = audit.confirmed_arbitrage.find(a => a.recipe_id === 'smelt_sand');
    assert.ok(smeltSand);
    assert.equal(smeltSand.total_acquisition_cost, 1.0);
    assert.equal(smeltSand.processing_costs, 1.0); // 0.125 * $8
    assert.equal(smeltSand.total_sale_revenue, 5.0);
    assert.equal(smeltSand.net_profit_per_cycle, 3.0); // 5 - (1 + 1)
  });

  test('4. Rejects conversions when required inputs cannot be bought or outputs cannot be sold', () => {
    const listings = [
      // Output (bread) cannot be sold to shop
      normalizeListing({ name: 'wheat', buyPrice: 2.0, sellPrice: 1.0, canBuy: true, canSell: true }),
      normalizeListing({ name: 'bread', buyPrice: 5.0, sellPrice: null, canBuy: true, canSell: false }),

      // Input (raw_iron) cannot be bought from shop
      normalizeListing({ name: 'raw_iron', buyPrice: null, sellPrice: 5.0, canBuy: false, canSell: true }),
      normalizeListing({ name: 'iron_ingot', buyPrice: 20.0, sellPrice: 10.0, canBuy: true, canSell: true })
    ];

    const audit = auditArbitrageOpportunities(listings);
    const bread = audit.confirmed_arbitrage.find(a => a.recipe_id === 'wheat_to_bread');
    const iron = audit.confirmed_arbitrage.find(a => a.recipe_id === 'smelt_raw_iron');
    assert.equal(bread, undefined, 'Wheat to bread must be rejected because bread is unsellable');
    assert.equal(iron, undefined, 'Raw iron to ingot must be rejected because raw iron cannot be bought');
  });

  test('5. Never assumes custom or unverified server recipes without evidence', () => {
    // Check that all standard recipes in CONVERSION_RECIPES are tagged with isVanilla: true
    for (const r of CONVERSION_RECIPES) {
      assert.equal(r.isVanilla, true, `Recipe ${r.id} must be flagged as vanilla`);
    }
  });
});
