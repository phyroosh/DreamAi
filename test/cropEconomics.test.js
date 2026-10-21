import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateFullInventorySaleValue,
  getItemMaxStackSize,
  calculateExpectedHarvestRevenue,
  calculatePassiveFarmEconomics,
  CROP_HARVEST_DATA,
  PASSIVE_FARM_MODELS
} from '../src/cropEconomics.js';

describe('Crop & Inventory Economics Engine', () => {
  test('1. Regression Test: Full-inventory sale values match exact user specification (36 slots * 64 stack)', () => {
    // Exact table from User Specification Phase 3:
    // | Item        | Sale price | Full-inventory value |
    // | Nether Wart | $4         | $9,216               |
    // | Potato      | $2         | $4,608               |
    // | Carrot      | $2         | $4,608               |
    // | Wheat       | $2         | $4,608               |
    // | Beetroot    | $2         | $4,608               |

    const regressionFixtures = [
      { id: 'nether_wart', salePrice: 4.0, expectedValue: 9216 },
      { id: 'potato', salePrice: 2.0, expectedValue: 4608 },
      { id: 'carrot', salePrice: 2.0, expectedValue: 4608 },
      { id: 'wheat', salePrice: 2.0, expectedValue: 4608 },
      { id: 'beetroot', salePrice: 2.0, expectedValue: 4608 }
    ];

    for (const fix of regressionFixtures) {
      const res = calculateFullInventorySaleValue({
        canonical_id: `minecraft:${fix.id}`,
        player_sell_price: fix.salePrice
      });

      assert.equal(res.available_inventory_slots, 36);
      assert.equal(res.maximum_stack_size, 64);
      assert.equal(res.full_inventory_quantity, 2304); // 36 * 64
      assert.equal(res.player_sell_price, fix.salePrice);
      assert.equal(res.full_inventory_sale_value, fix.expectedValue, `Failed for ${fix.id}`);
    }
  });

  test('2. Inventory slot count is configurable (e.g. 27 main inventory slots excluding hotbar)', () => {
    const res = calculateFullInventorySaleValue(
      { canonical_id: 'minecraft:potato', player_sell_price: 2.0 },
      { inventorySlots: 27 }
    );
    assert.equal(res.available_inventory_slots, 27);
    assert.equal(res.full_inventory_quantity, 1728); // 27 * 64
    assert.equal(res.full_inventory_sale_value, 3456); // 1728 * $2
  });

  test('3. Uses actual Minecraft item maximum stack sizes instead of assuming 64 for everything', () => {
    // Stacks to 16
    assert.equal(getItemMaxStackSize('ender_pearl'), 16);
    assert.equal(getItemMaxStackSize('snowball'), 16);
    assert.equal(getItemMaxStackSize('egg'), 16);
    assert.equal(getItemMaxStackSize('oak_sign'), 16);
    assert.equal(getItemMaxStackSize('bucket'), 16);

    // Stacks to 1 (unstackable)
    assert.equal(getItemMaxStackSize('diamond_sword'), 1);
    assert.equal(getItemMaxStackSize('bow'), 1);
    assert.equal(getItemMaxStackSize('diamond_helmet'), 1);
    assert.equal(getItemMaxStackSize('potion'), 1);
    assert.equal(getItemMaxStackSize('totem_of_undying'), 1);
    assert.equal(getItemMaxStackSize('minecart'), 1);

    // Standard 64
    assert.equal(getItemMaxStackSize('wheat'), 64);
    assert.equal(getItemMaxStackSize('cobblestone'), 64);

    // Full inventory of Ender Pearls (36 slots * 16 stack = 576 items)
    const enderPearlInv = calculateFullInventorySaleValue({
      canonical_id: 'minecraft:ender_pearl',
      player_sell_price: 10.0
    });
    assert.equal(enderPearlInv.maximum_stack_size, 16);
    assert.equal(enderPearlInv.full_inventory_quantity, 576);
    assert.equal(enderPearlInv.full_inventory_sale_value, 5760); // 576 * $10

    // Full inventory of Diamond Swords (36 slots * 1 stack = 36 items)
    const swordInv = calculateFullInventorySaleValue({
      canonical_id: 'minecraft:diamond_sword',
      player_sell_price: 100.0
    });
    assert.equal(swordInv.maximum_stack_size, 1);
    assert.equal(swordInv.full_inventory_quantity, 36);
    assert.equal(swordInv.full_inventory_sale_value, 3600); // 36 * $100
  });

  test('4. Expected harvest yields correctly account for replanting retention vs gross drops', () => {
    // Potato: 2.5 gross drop, 1 replanted, 1.5 net sellable
    const potatoRevenue = calculateExpectedHarvestRevenue('potato', 2.0);
    assert.equal(potatoRevenue.expected_gross_crop_yield, 2.5);
    assert.equal(potatoRevenue.expected_net_sellable_crop_yield, 1.5);
    assert.equal(potatoRevenue.expected_gross_revenue_per_block, 5.0); // 2.5 * $2
    assert.equal(potatoRevenue.expected_net_revenue_per_block, 3.0);   // 1.5 * $2

    // Carrot: 3.0 gross drop, 1 replanted, 2.0 net sellable
    const carrotRevenue = calculateExpectedHarvestRevenue('carrot', 2.0);
    assert.equal(carrotRevenue.expected_gross_crop_yield, 3.0);
    assert.equal(carrotRevenue.expected_net_sellable_crop_yield, 2.0);
    assert.equal(carrotRevenue.expected_gross_revenue_per_block, 6.0); // 3.0 * $2
    assert.equal(carrotRevenue.expected_net_revenue_per_block, 4.0);   // 2.0 * $2

    // Nether Wart: 3.0 gross drop, 1 replanted, 2.0 net sellable
    const wartRevenue = calculateExpectedHarvestRevenue('nether_wart', 4.0);
    assert.equal(wartRevenue.expected_gross_crop_yield, 3.0);
    assert.equal(wartRevenue.expected_net_sellable_crop_yield, 2.0);
    assert.equal(wartRevenue.expected_gross_revenue_per_block, 12.0); // 3.0 * $4
    assert.equal(wartRevenue.expected_net_revenue_per_block, 8.0);   // 2.0 * $4
  });

  test('5. Passive farm economics distinguishes gross revenue, net profit, and establishment payback', () => {
    // Pumpkin: 100 plants, sell price $10, seed price $2, 90% collection efficiency
    const pumpkinEcon = calculatePassiveFarmEconomics('pumpkin', 10.0, 2.0, { plantCount: 100 });
    assert.equal(pumpkinEcon.plant_count, 100);
    assert.equal(pumpkinEcon.theoretical_production_rate_per_hour, 150);
    assert.equal(pumpkinEcon.estimated_collected_items_per_hour, 135); // 150 * 0.90
    assert.equal(pumpkinEcon.estimated_items_lost_per_hour, 15);      // 150 * 0.10
    assert.equal(pumpkinEcon.player_sell_price, 10.0);
    assert.equal(pumpkinEcon.gross_sales_revenue_per_hour, 1350.0);   // 135 * $10
    assert.equal(pumpkinEcon.recurring_operating_costs_per_hour, 0);
    assert.equal(pumpkinEcon.net_profit_per_hour, 1350.0);
    assert.equal(pumpkinEcon.initial_planting_capital, 200.0);         // 100 * $2
    assert.equal(pumpkinEcon.payback_period_hours, 0.1);              // 200 / 1350 = ~0.1 hrs
    assert.equal(pumpkinEcon.confidence_level, 'theoretical_estimate_unverified');
  });

  test('6. Planting material naming correctly distinguishes seeds vs plant items', () => {
    assert.equal(PASSIVE_FARM_MODELS.pumpkin.plantingMaterialName, 'pumpkin_seeds');
    assert.equal(PASSIVE_FARM_MODELS.melon_slice.plantingMaterialName, 'melon_seeds');
    assert.equal(PASSIVE_FARM_MODELS.bamboo.plantingMaterialName, 'bamboo');
    assert.equal(PASSIVE_FARM_MODELS.cactus.plantingMaterialName, 'cactus');
    assert.equal(PASSIVE_FARM_MODELS.sugar_cane.plantingMaterialName, 'sugar_cane');
  });
});
