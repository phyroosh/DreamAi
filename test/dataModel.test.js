import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeListing,
  normalizeCatalogListings,
  validateCatalogReconciliation,
  getUniqueCanonicalItems
} from '../src/dataModel.js';

describe('Data Model & Listing Reconciliation Invariants', () => {
  test('1. Invariant: total_listings = buyable_listings + unbuyable_listings and sellable_listings + unsellable_listings', () => {
    const sampleListings = [
      normalizeListing({ name: 'stone', buyPrice: 5, sellPrice: 2, canBuy: true, canSell: true }),
      normalizeListing({ name: 'glowstone', buyPrice: null, sellPrice: 2, canBuy: false, canSell: true }),
      normalizeListing({ name: 'spawner', buyPrice: 50000, sellPrice: null, canBuy: true, canSell: false }),
      normalizeListing({ name: 'dragon_egg', buyPrice: null, sellPrice: null, canBuy: false, canSell: false }),
      normalizeListing({ name: 'villager_spawn_egg', buyPrice: 3000000, sellPrice: 0, canBuy: true, canSell: true })
    ];

    const stats = validateCatalogReconciliation(sampleListings);
    assert.equal(stats.total_listings, 5);
    assert.equal(stats.buyable_listings, 3);    // stone, spawner, villager_spawn_egg
    assert.equal(stats.unbuyable_listings, 2);  // glowstone, dragon_egg
    assert.equal(stats.sellable_listings, 3);   // stone, glowstone, villager_spawn_egg (sellPrice = 0)
    assert.equal(stats.unsellable_listings, 2); // spawner, dragon_egg
    assert.equal(stats.zero_payout_sellable_listings, 1); // villager_spawn_egg
    assert.equal(stats.profitable_sellable_listings, 2);  // stone, glowstone

    // Verify invariant equations
    assert.equal(stats.total_listings, stats.buyable_listings + stats.unbuyable_listings);
    assert.equal(stats.total_listings, stats.sellable_listings + stats.unsellable_listings);
    assert.equal(stats.purchase_reconciles, true);
    assert.equal(stats.sale_reconciles, true);
    assert.equal(stats.is_fully_reconciled, true);
  });

  test('2. Reconciles real server catalog data without count discrepancies (solves 926 vs 927 cause)', () => {
    const catalog = {
      server: 'paid34.skilloraclouds.com',
      items: [
        // 784 buyable items
        ...Array.from({ length: 784 }, (_, i) => ({
          name: `buyable_item_${i}`,
          buyPrice: 10 + i,
          sellPrice: 5,
          canBuy: true,
          canSell: true
        })),
        // 98 unbuyable, sellable items
        ...Array.from({ length: 98 }, (_, i) => ({
          name: `sell_only_item_${i}`,
          buyPrice: null,
          sellPrice: 2,
          canBuy: false,
          canSell: true
        })),
        // 44 unbuyable, unsellable items
        ...Array.from({ length: 44 }, (_, i) => ({
          name: `disabled_item_${i}`,
          buyPrice: null,
          sellPrice: null,
          canBuy: false,
          canSell: false
        })),
        // The exact anomaly item from server: villager_spawn_egg with sellPrice: 0.00
        {
          name: 'villager_spawn_egg',
          buyPrice: 3000000,
          sellPrice: 0,
          canBuy: true,
          canSell: true
        }
      ]
    };

    const listings = normalizeCatalogListings(catalog);
    assert.equal(listings.length, 927);

    const stats = validateCatalogReconciliation(listings);
    assert.equal(stats.total_listings, 927);
    assert.equal(stats.buyable_listings, 785);   // 784 + villager egg
    assert.equal(stats.unbuyable_listings, 142); // 98 + 44
    assert.equal(stats.sellable_listings, 883);  // 784 + 98 + 1 (villager egg)
    assert.equal(stats.unsellable_listings, 44);
    assert.equal(stats.zero_payout_sellable_listings, 1);
    assert.equal(stats.profitable_sellable_listings, 882);

    // Invariants must hold:
    assert.equal(stats.buyable_listings + stats.unbuyable_listings, 927);
    assert.equal(stats.sellable_listings + stats.unsellable_listings, 927);
    assert.equal(stats.is_fully_reconciled, true);
  });

  test('3. Missing prices are explicitly preserved as null, never converted to zero', () => {
    const listing = normalizeListing({
      name: 'unpriced_item',
      displayName: 'Unpriced Item',
      canBuy: false,
      buyPrice: null,
      canSell: false,
      sellPrice: undefined
    });

    assert.equal(listing.player_buy_price, null);
    assert.equal(listing.player_sell_price, null);
    assert.notEqual(listing.player_buy_price, 0);
    assert.notEqual(listing.player_sell_price, 0);
    assert.equal(listing.buyable, false);
    assert.equal(listing.sellable, false);
  });

  test('4. Unambiguous perspective fields: player_buys_from_shop and player_sells_to_shop', () => {
    const listing = normalizeListing({
      name: 'iron_ingot',
      displayName: 'Iron Ingot',
      buyPrice: 15.0,
      sellPrice: 5.0,
      canBuy: true,
      canSell: true
    });

    assert.equal(listing.player_buys_from_shop, true);
    assert.equal(listing.player_sells_to_shop, true);
    assert.equal(listing.player_buy_price, 15.0);
    assert.equal(listing.player_sell_price, 5.0);
    assert.equal(listing.canonical_id, 'minecraft:iron_ingot');
  });

  test('5. Duplicate listings preserve original locations & prices while deduplicating for unique rankings', () => {
    const duplicateListings = [
      normalizeListing({ name: 'diamond_block', category: 'Ores', slot: 1, buyPrice: 10000, sellPrice: 2000, canBuy: true, canSell: true }),
      normalizeListing({ name: 'diamond_block', category: 'VIP', slot: 5, buyPrice: 9000, sellPrice: 2500, canBuy: true, canSell: true }),
      normalizeListing({ name: 'diamond_block', category: 'Blocks', slot: 10, buyPrice: 11000, sellPrice: 1800, canBuy: true, canSell: true })
    ];

    const unique = getUniqueCanonicalItems(duplicateListings);
    assert.equal(unique.length, 1, 'Should produce exactly 1 unique canonical entry for Diamond Block');
    const diamond = unique[0];
    assert.equal(diamond.listing_count, 3);
    assert.deepEqual(diamond.categories.sort(), ['Blocks', 'Ores', 'VIP']);
    // Best buy price is the lowest cost to player
    assert.equal(diamond.best_player_buy_price, 9000);
    // Best sell price is the highest payout to player
    assert.equal(diamond.best_player_sell_price, 2500);
    // Preserves all 3 original listings for auditing
    assert.equal(diamond.all_listings.length, 3);
  });

  test('6. Handles malformed data defensively without throwing or silently corrupting', () => {
    const malformed = [
      null,
      undefined,
      {},
      { name: '', buyPrice: 'invalid', sellPrice: -50 },
      { name: 'corrupt', canBuy: 'yes', buyPrice: NaN }
    ];

    const normalized = malformed.map(m => normalizeListing(m)).filter(Boolean);
    assert.equal(normalized.length, 3);
    const stats = validateCatalogReconciliation(normalized);
    assert.ok(stats);
    assert.equal(stats.is_fully_reconciled, true);
  });
});
