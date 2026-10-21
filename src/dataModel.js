/**
 * Data Model & Catalog Reconciliation Module
 * 
 * Establishes unambiguous transaction perspective definitions:
 * - `player_buys_from_shop`: Player pays the shop to acquire an item.
 * - `player_sells_to_shop`: Shop pays the player for an item.
 * - `player_buy_price`: The actual unit price the player pays to acquire the item.
 * - `player_sell_price`: The actual unit amount the player receives when selling.
 * - `buyable`: Whether the shop allows players to purchase the item.
 * - `sellable`: Whether the shop accepts the item from players.
 */

/**
 * Normalizes a raw or legacy shop listing into the unambiguous canonical data model
 * 
 * @param {Object} rawListing The raw item listing from crawler or JSON file
 * @param {string} [fallbackCategory='Unknown'] Category name if not present on listing
 * @param {string} [timestamp] ISO timestamp of collection
 * @returns {Object} Canonical normalized listing preserving raw data
 */
export function normalizeListing(rawListing, fallbackCategory = 'Unknown', timestamp = null) {
  if (!rawListing) return null;

  const rawName = String(rawListing.name || rawListing.canonical_id || 'unknown').trim();
  const canonicalId = rawName.startsWith('minecraft:') ? rawName : `minecraft:${rawName}`;
  const simpleName = rawName.replace(/^minecraft:/, '');
  const displayName = String(rawListing.displayName || rawListing.display_name || simpleName).trim();
  const category = String(rawListing.category || fallbackCategory || 'Unknown').trim();
  const slotIndex = typeof rawListing.slot === 'number' ? rawListing.slot : (rawListing.slot_index ?? 0);
  const collectedAt = rawListing.collected_at || timestamp || new Date().toISOString();

  // Buy capability (Player buys from shop)
  const playerBuysFromShop = Boolean(
    rawListing.player_buys_from_shop !== undefined 
      ? rawListing.player_buys_from_shop 
      : (rawListing.buyable !== undefined ? rawListing.buyable : rawListing.canBuy)
  );

  // Sell capability (Player sells to shop)
  const playerSellsToShop = Boolean(
    rawListing.player_sells_to_shop !== undefined
      ? rawListing.player_sells_to_shop
      : (rawListing.sellable !== undefined ? rawListing.sellable : rawListing.canSell)
  );

  // Buy price extraction
  let playerBuyPrice = null;
  const rawBuyPrice = rawListing.player_buy_price !== undefined ? rawListing.player_buy_price : rawListing.buyPrice;
  if (typeof rawBuyPrice === 'number' && Number.isFinite(rawBuyPrice)) {
    playerBuyPrice = rawBuyPrice;
  }

  // Sell price extraction
  let playerSellPrice = null;
  const rawSellPrice = rawListing.player_sell_price !== undefined ? rawListing.player_sell_price : rawListing.sellPrice;
  if (typeof rawSellPrice === 'number' && Number.isFinite(rawSellPrice)) {
    playerSellPrice = rawSellPrice;
  }

  // Buyable is strictly true only when shop permits purchase AND a valid numeric price exists
  const buyable = playerBuysFromShop && playerBuyPrice !== null;

  // Sellable is strictly true when shop accepts item AND a valid numeric price exists (including 0.00)
  const sellable = playerSellsToShop && playerSellPrice !== null;

  const unitSize = typeof rawListing.unit === 'number' && rawListing.unit > 0 ? rawListing.unit : (rawListing.unit_size || 1);

  return {
    type: 'shop_item',
    // Canonical identifiers
    canonical_id: canonicalId,
    item_id: simpleName,
    display_name: displayName,
    category,
    slot_index: slotIndex,

    // Unambiguous perspective flags
    player_buys_from_shop: buyable,
    player_sells_to_shop: sellable,
    buyable,
    sellable,

    // Prices (null if unavailable - NEVER converted to zero!)
    player_buy_price: playerBuyPrice,
    player_sell_price: playerSellPrice,
    currency: 'USD',
    unit_size: unitSize,

    // Provenance and confidence
    source: rawListing.source || 'shop_gui',
    confidence: rawListing.confidence || 'verified_from_gui',
    collected_at: collectedAt,

    // Raw information preservation
    raw: rawListing.raw || {
      name: rawListing.name,
      displayName: rawListing.displayName,
      lore: Array.isArray(rawListing.lore) ? [...rawListing.lore] : [],
      slot: rawListing.slot,
      id: rawListing.id
    },

    // Backward compatibility aliases
    name: simpleName,
    displayName,
    canBuy: buyable,
    canSell: sellable,
    buyPrice: playerBuyPrice,
    sellPrice: playerSellPrice,
    unit: unitSize,
    lore: Array.isArray(rawListing.lore) ? rawListing.lore : (rawListing.raw?.lore || [])
  };
}

/**
 * Normalizes all listings from a catalog (handling both flat items array and nested categories)
 * 
 * @param {Object} catalog The loaded or scraped shop catalog
 * @returns {Array<Object>} Flat array of canonical normalized listings
 */
export function normalizeCatalogListings(catalog) {
  if (!catalog) return [];

  const rawListings = [];
  if (Array.isArray(catalog.categories) && catalog.categories.some(c => Array.isArray(c.items) && c.items.length > 0)) {
    for (const cat of catalog.categories) {
      const catName = cat.name || 'Unknown';
      if (Array.isArray(cat.items)) {
        for (const itm of cat.items) {
          rawListings.push({ ...itm, category: itm.category || catName });
        }
      }
    }
  } else if (Array.isArray(catalog.items)) {
    rawListings.push(...catalog.items);
  }

  const timestamp = catalog.scrapedAt || new Date().toISOString();
  return rawListings.map(item => normalizeListing(item, item.category, timestamp)).filter(Boolean);
}

/**
 * Validates catalog listing counts and tests mathematical reconciliation invariants:
 * - total_listings = buyable_listings + unbuyable_listings
 * - total_listings = sellable_listings + unsellable_listings
 * 
 * @param {Array<Object>} listings Normalized shop listings
 * @returns {Object} Reconciliation statistics, invariants check, and duplicate analysis
 */
export function validateCatalogReconciliation(listings = []) {
  const totalListings = listings.length;

  let buyableCount = 0;
  let unbuyableCount = 0;
  let sellableCount = 0;
  let unsellableCount = 0;
  let zeroPayoutSellableCount = 0;
  let positivePayoutSellableCount = 0;

  // Track unique canonical items
  const canonicalGroups = new Map();

  for (const listing of listings) {
    // 1. Purchase classifications
    if (listing.buyable && typeof listing.player_buy_price === 'number') {
      buyableCount++;
    } else {
      unbuyableCount++;
    }

    // 2. Sale classifications
    if (listing.sellable && typeof listing.player_sell_price === 'number') {
      sellableCount++;
      if (listing.player_sell_price > 0) {
        positivePayoutSellableCount++;
      } else {
        zeroPayoutSellableCount++;
      }
    } else {
      unsellableCount++;
    }

    // 3. Group by canonical ID to track duplicates
    const id = listing.canonical_id;
    if (!canonicalGroups.has(id)) {
      canonicalGroups.set(id, []);
    }
    canonicalGroups.get(id).push(listing);
  }

  // Duplicate analysis
  const duplicateListingsMap = new Map();
  let uniqueBuyableCount = 0;
  let uniqueSellableCount = 0;

  for (const [canonicalId, group] of canonicalGroups.entries()) {
    if (group.length > 1) {
      duplicateListingsMap.set(canonicalId, {
        canonical_id: canonicalId,
        display_name: group[0].display_name,
        listing_count: group.length,
        categories: [...new Set(group.map(g => g.category))],
        distinct_buy_prices: [...new Set(group.map(g => g.player_buy_price).filter(p => p !== null))],
        distinct_sell_prices: [...new Set(group.map(g => g.player_sell_price).filter(p => p !== null))],
        listings: group
      });
    }

    if (group.some(g => g.buyable)) uniqueBuyableCount++;
    if (group.some(g => g.sellable && g.player_sell_price > 0)) uniqueSellableCount++;
  }

  // Invariant equations
  const purchaseSum = buyableCount + unbuyableCount;
  const saleSum = sellableCount + unsellableCount;

  const purchaseReconciles = totalListings === purchaseSum;
  const saleReconciles = totalListings === saleSum;

  const warnings = [];
  if (!purchaseReconciles) {
    warnings.push(`Purchase classification discrepancy: total (${totalListings}) != buyable (${buyableCount}) + unbuyable (${unbuyableCount}) [Sum: ${purchaseSum}]`);
  }
  if (!saleReconciles) {
    warnings.push(`Sale classification discrepancy: total (${totalListings}) != sellable (${sellableCount}) + unsellable (${unsellableCount}) [Sum: ${saleSum}]`);
  }
  if (zeroPayoutSellableCount > 0) {
    warnings.push(`Detected ${zeroPayoutSellableCount} listing(s) with $0.00 sale payout (shop accepts item but pays $0.00). These are tracked separately from positive-payout listings.`);
  }

  return {
    total_listings: totalListings,
    unique_canonical_items: canonicalGroups.size,

    // Purchase statistics
    buyable_listings: buyableCount,
    unbuyable_listings: unbuyableCount,
    unique_buyable_items: uniqueBuyableCount,

    // Sale statistics
    sellable_listings: sellableCount,
    unsellable_listings: unsellableCount,
    profitable_sellable_listings: positivePayoutSellableCount,
    zero_payout_sellable_listings: zeroPayoutSellableCount,
    unique_sellable_items: uniqueSellableCount,

    // Invariant check flags
    purchase_reconciles: purchaseReconciles,
    sale_reconciles: saleReconciles,
    is_fully_reconciled: purchaseReconciles && saleReconciles,
    equations: {
      purchase: `${buyableCount} + ${unbuyableCount} = ${purchaseSum} (Total: ${totalListings})`,
      sale: `${sellableCount} + ${unsellableCount} = ${saleSum} (Total: ${totalListings})`
    },

    // Duplicate records breakdown
    duplicate_items_count: duplicateListingsMap.size,
    duplicate_items: Array.from(duplicateListingsMap.values()),

    warnings
  };
}

/**
 * Extracts deduplicated list of unique canonical items with their best transaction options
 * 
 * @param {Array<Object>} listings Normalized shop listings
 * @returns {Array<Object>} Array of unique canonical items with best buy and sell prices
 */
export function getUniqueCanonicalItems(listings = []) {
  const itemsMap = new Map();

  for (const listing of listings) {
    const id = listing.canonical_id;
    if (!itemsMap.has(id)) {
      itemsMap.set(id, {
        canonical_id: id,
        item_id: listing.item_id,
        display_name: listing.display_name,
        listing_count: 1,
        categories: [listing.category],
        // Best prices: lowest price to buy, highest price to sell
        best_player_buy_price: listing.buyable ? listing.player_buy_price : null,
        best_player_sell_price: (listing.sellable && listing.player_sell_price !== null) ? listing.player_sell_price : null,
        best_buy_listing: listing.buyable ? listing : null,
        best_sell_listing: listing.sellable ? listing : null,
        all_listings: [listing]
      });
    } else {
      const entry = itemsMap.get(id);
      entry.listing_count++;
      if (!entry.categories.includes(listing.category)) {
        entry.categories.push(listing.category);
      }
      entry.all_listings.push(listing);

      // Update best buy price (lowest cost for player)
      if (listing.buyable && listing.player_buy_price !== null) {
        if (entry.best_player_buy_price === null || listing.player_buy_price < entry.best_player_buy_price) {
          entry.best_player_buy_price = listing.player_buy_price;
          entry.best_buy_listing = listing;
        }
      }

      // Update best sell price (highest payout for player)
      if (listing.sellable && listing.player_sell_price !== null) {
        if (entry.best_player_sell_price === null || listing.player_sell_price > entry.best_player_sell_price) {
          entry.best_player_sell_price = listing.player_sell_price;
          entry.best_sell_listing = listing;
        }
      }
    }
  }

  return Array.from(itemsMap.values()).map(item => ({
    ...item,
    can_buy: item.best_player_buy_price !== null,
    can_sell: item.best_player_sell_price !== null && item.best_player_sell_price > 0,
    has_zero_payout_sell: item.best_player_sell_price === 0
  }));
}
