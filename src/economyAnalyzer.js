/**
 * Economy & Arbitrage Intelligence Engine
 * 
 * Conducts transparent, auditable economic analysis across:
 * - Data model normalization & mathematical listing count reconciliation (Phase 1 & 2)
 * - True full-inventory and harvest crop economics (Phase 3)
 * - Reliable passive AFK farm modeling with documented growth mechanics (Phase 4)
 * - Deduplicated unique item rankings and investment payback (Phase 5)
 * - Systematic arbitrage and conversion auditor (Phase 6 & 7)
 * - Auditable strategic reports and AI prompts (Phase 9)
 */

import {
  normalizeListing,
  normalizeCatalogListings,
  validateCatalogReconciliation,
  getUniqueCanonicalItems
} from './dataModel.js';

import {
  calculateFullInventorySaleValue,
  calculateExpectedHarvestRevenue,
  calculatePassiveFarmEconomics,
  CROP_HARVEST_DATA,
  PASSIVE_FARM_MODELS
} from './cropEconomics.js';

import {
  auditArbitrageOpportunities,
  CONVERSION_RECIPES
} from './arbitrageEngine.js';

// Spawner drop data (Vanilla drops per spawner in typical water/fall grinder)
export const SPAWNER_DATA = [
  { mob: 'Iron Golem', spawnerKeys: ['iron_golem', 'iron golem'], dropName: 'iron_ingot', dropsPerHour: 360 },
  { mob: 'Blaze', spawnerKeys: ['blaze'], dropName: 'blaze_rod', dropsPerHour: 450 },
  { mob: 'Creeper', spawnerKeys: ['creeper'], dropName: 'gunpowder', dropsPerHour: 400 },
  { mob: 'Skeleton', spawnerKeys: ['skeleton'], dropName: 'bone', dropsPerHour: 400 },
  { mob: 'Zombie', spawnerKeys: ['zombie'], dropName: 'rotten_flesh', dropsPerHour: 400 },
  { mob: 'Enderman', spawnerKeys: ['enderman'], dropName: 'ender_pearl', dropsPerHour: 350 },
  { mob: 'Witch', spawnerKeys: ['witch'], dropName: 'redstone', dropsPerHour: 250 }
];

/**
 * Finds matching item in listings by strict technical ID or display name matching.
 * Enforces exact token boundaries and forbids false-positive cross-matching.
 */
export function findItem(catalogItems = [], query = '') {
  if (!query || !Array.isArray(catalogItems)) return undefined;

  const rawQ = query.toLowerCase().trim();
  const qId = rawQ.replace(/[\s\-]+/g, '_');
  const qDisplay = rawQ.replace(/[_]+/g, ' ');

  // Pass 1: Exact ID or exact Display Name match
  const exactMatch = catalogItems.find(item => {
    if (!item) return false;
    const name = (item.item_id || item.name || '').toLowerCase().replace(/^minecraft:/, '');
    const displayName = (item.display_name || item.displayName || '').toLowerCase();
    return (
      name === qId ||
      name === `minecraft:${qId}` ||
      displayName === qDisplay ||
      displayName === qId
    );
  });
  if (exactMatch) return exactMatch;

  // Pass 2: Canonical Minecraft aliases
  const aliases = {
    'melon': ['melon_block', 'melon block'],
    'hay_block': ['hay_bale', 'hay bale'],
    'bone_meal': ['bonemeal']
  };
  if (aliases[qId]) {
    const aliasMatch = catalogItems.find(item => {
      if (!item) return false;
      const name = (item.item_id || item.name || '').toLowerCase().replace(/^minecraft:/, '');
      const displayName = (item.display_name || item.displayName || '').toLowerCase();
      return aliases[qId].some(a => name === a || displayName === a);
    });
    if (aliasMatch) return aliasMatch;
  }

  // Pass 3: Category suffixes (e.g. 'log', 'planks', 'wool', 'carpet')
  const genericSuffixes = ['log', 'planks', 'wool', 'carpet', 'sandstone'];
  if (genericSuffixes.includes(qId)) {
    const suffixMatch = catalogItems.find(item => {
      if (!item) return false;
      const name = (item.item_id || item.name || '').toLowerCase().replace(/^minecraft:/, '');
      return (
        (name.endsWith(`_${qId}`) || name === qId) &&
        !name.includes('slab') &&
        !name.includes('stairs') &&
        !name.includes('wall')
      );
    });
    if (suffixMatch) return suffixMatch;
  }

  // Pass 4: Word-boundary match with strict forbidden token exclusions
  const forbiddenMap = {
    melon: ['slice', 'seeds', 'speck', 'glistering'],
    wheat: ['seeds', 'bale', 'hay'],
    pumpkin: ['seeds', 'pie', 'stem'],
    carrot: ['golden', 'stick'],
    potato: ['poisonous', 'baked'],
    beetroot: ['seeds', 'soup'],
    bone: ['meal'],
    iron_ingot: ['nugget', 'block', 'bars', 'door', 'trapdoor', 'ore'],
    gold_ingot: ['nugget', 'block', 'bars', 'door', 'trapdoor', 'ore'],
    diamond: ['block', 'ore']
  };

  const forbidden = forbiddenMap[qId] || [];

  return catalogItems.find(item => {
    if (!item) return false;
    const name = (item.item_id || item.name || '').toLowerCase().replace(/^minecraft:/, '');
    const displayName = (item.display_name || item.displayName || '').toLowerCase();

    for (const f of forbidden) {
      if (name.includes(f) || displayName.includes(f)) return false;
    }

    const wordsName = name.replace(/_/g, ' ').split(/\s+/);
    const wordsDisplay = displayName.replace(/_/g, ' ').split(/\s+/);
    const qWords = qDisplay.split(/\s+/);

    return (
      qWords.every(w => wordsName.includes(w)) ||
      qWords.every(w => wordsDisplay.includes(w))
    );
  });
}

/**
 * Runs deterministic economic calculations on a shop catalog
 */
export function analyzeEconomy(catalogData, options = {}) {
  // 1. Normalize listings into canonical data model (Phase 1)
  const normalizedListings = normalizeCatalogListings(catalogData);

  // 2. Mathematical count reconciliation & duplicate tracking (Phase 2)
  const reconciliation = validateCatalogReconciliation(normalizedListings);

  // 3. Unique canonical items extraction (Phase 2 & Phase 5)
  const uniqueItems = getUniqueCanonicalItems(normalizedListings);

  // 4. Ranking 1: Top 10 unique items by player sale price (Phase 5)
  const topUniqueSellItems = uniqueItems
    .filter(i => i.can_sell && i.best_player_sell_price > 0)
    .sort((a, b) => b.best_player_sell_price - a.best_player_sell_price)
    .slice(0, 10)
    .map(i => ({
      canonical_id: i.canonical_id,
      name: i.display_name,
      player_sell_price: i.best_player_sell_price,
      player_buy_price: i.best_player_buy_price,
      listing_count: i.listing_count,
      categories: i.categories
    }));

  // 5. Ranking 2 & Systematic Arbitrage Audit (Phase 6 & 7)
  const arbitrageAudit = auditArbitrageOpportunities(normalizedListings);

  // 6. Active Crop Economics (Phase 3)
  const activeFarmRankings = [];
  const activeCropKeys = ['nether_wart', 'potato', 'carrot', 'wheat', 'beetroot'];

  for (const cropKey of activeCropKeys) {
    const cropListing = findItem(normalizedListings, cropKey);
    const harvestData = CROP_HARVEST_DATA[cropKey];

    if (cropListing && cropListing.sellable && typeof cropListing.player_sell_price === 'number') {
      const sellPrice = cropListing.player_sell_price;
      
      // Look up seed/starter item
      const seedKey = harvestData?.seedName || cropKey;
      const seedListing = findItem(normalizedListings, seedKey);
      const seedBuyPrice = (seedListing && seedListing.buyable && typeof seedListing.player_buy_price === 'number') 
        ? seedListing.player_buy_price 
        : null;
      const seedSellPrice = (seedListing && seedListing.sellable && typeof seedListing.player_sell_price === 'number') 
        ? seedListing.player_sell_price 
        : null;

      // Full inventory sale value (36 slots * item max stack size * sell price)
      const inventoryVal = calculateFullInventorySaleValue(cropListing, {
        inventorySlots: options.inventorySlots || 36
      });

      // Expected harvest revenue per block (accounting for replanting)
      const harvestRevenue = calculateExpectedHarvestRevenue(cropKey, sellPrice, seedSellPrice);

      activeFarmRankings.push({
        crop: cropListing.display_name || cropKey,
        name: cropKey,
        canBuy: cropListing.buyable,
        buyPrice: cropListing.player_buy_price,
        sellPrice,
        seedName: harvestData?.seedDisplayName || seedKey,
        seedBuyPrice,
        // Detailed economics
        full_inventory_sale_value: inventoryVal.full_inventory_sale_value,
        available_inventory_slots: inventoryVal.available_inventory_slots,
        maximum_stack_size: inventoryVal.maximum_stack_size,
        expected_gross_revenue_per_block: harvestRevenue?.expected_gross_revenue_per_block || sellPrice,
        expected_net_revenue_per_block: harvestRevenue?.expected_net_revenue_per_block || sellPrice,
        replanting_retention: harvestRevenue?.replanting_retention || '1 unit replanted',
        // Backward compatibility
        returnPerHarvest: harvestRevenue?.expected_net_revenue_per_block || sellPrice,
        estProfitPerInventory: inventoryVal.full_inventory_sale_value
      });
    }
  }
  // Sort active crops by full inventory sale value descending
  activeFarmRankings.sort((a, b) => b.full_inventory_sale_value - a.full_inventory_sale_value);

  // 7. Passive AFK Farm Economics (Phase 4)
  const passiveFarmRankings = [];
  const passiveFarmKeys = ['pumpkin', 'bamboo', 'melon_slice', 'cactus', 'kelp', 'sugar_cane'];

  for (const farmKey of passiveFarmKeys) {
    const model = PASSIVE_FARM_MODELS[farmKey];
    if (!model) continue;

    const cropListing = findItem(normalizedListings, model.cropName);
    const plantingListing = findItem(normalizedListings, model.plantingMaterialName);

    if (cropListing && cropListing.sellable && typeof cropListing.player_sell_price === 'number') {
      const sellPrice = cropListing.player_sell_price;
      const plantingCost = (plantingListing && plantingListing.buyable && typeof plantingListing.player_buy_price === 'number') 
        ? plantingListing.player_buy_price 
        : null;

      const farmEcon = calculatePassiveFarmEconomics(farmKey, sellPrice, plantingCost, {
        plantCount: options.plantCount || 100
      });

      passiveFarmRankings.push({
        crop: model.cropName === 'cactus' ? 'Cactus' : (model.cropName === 'pumpkin' ? 'Pumpkin' : (model.cropName === 'bamboo' ? 'Bamboo' : (model.cropName === 'melon_slice' ? 'Melon Slice (Auto Piston/Axe)' : (model.cropName === 'kelp' ? 'Kelp' : 'Sugar Cane')))),
        farm_name: farmEcon.farm_name,
        name: model.cropName,
        canBuy: cropListing.buyable,
        buyPrice: cropListing.player_buy_price,
        sellPrice,
        seedName: plantingListing ? plantingListing.display_name : model.plantingMaterialName,
        seedBuyPrice: plantingCost,
        // Detailed metrics
        plant_count: farmEcon.plant_count,
        estimated_collected_items_per_hour: farmEcon.estimated_collected_items_per_hour,
        gross_sales_revenue_per_hour: farmEcon.gross_sales_revenue_per_hour,
        recurring_operating_costs_per_hour: farmEcon.recurring_operating_costs_per_hour,
        net_profit_per_hour: farmEcon.net_profit_per_hour,
        initial_planting_capital: farmEcon.initial_planting_capital,
        payback_period_hours: farmEcon.payback_period_hours,
        confidence_level: farmEcon.confidence_level,
        assumptions: farmEcon.assumptions,
        difficulty: 'Zero player interaction (AFK)',
        // Backward compatibility
        estHourlyProfitPer100Plots: farmEcon.net_profit_per_hour
      });
    }
  }
  // Sort passive farms by net profit per hour descending
  passiveFarmRankings.sort((a, b) => b.net_profit_per_hour - a.net_profit_per_hour);

  // 8. Spawner Break-Even Analysis (Phase 5)
  const spawnerAnalysis = [];
  for (const spawner of SPAWNER_DATA) {
    const foundSpawner = normalizedListings.find(i => {
      const name = (i.display_name || i.name || '').toLowerCase();
      return name.includes('spawner') && spawner.spawnerKeys.some(k => name.includes(k));
    });

    const foundDrop = findItem(normalizedListings, spawner.dropName);

    if (foundSpawner && foundDrop && foundSpawner.buyable && foundDrop.sellable) {
      const spawnerCost = foundSpawner.player_buy_price;
      const dropSellPrice = foundDrop.player_sell_price;
      const hourlyDropRevenue = spawner.dropsPerHour * dropSellPrice;
      const hoursToBreakEven = hourlyDropRevenue > 0 ? (spawnerCost / hourlyDropRevenue) : Infinity;

      spawnerAnalysis.push({
        mob: spawner.mob,
        spawnerCost,
        dropName: foundDrop.display_name || foundDrop.name,
        dropSellPrice,
        hourlyRevenue: hourlyDropRevenue,
        hoursToBreakEven: Number(hoursToBreakEven.toFixed(1)),
        returnOnCapitalPerHourPct: spawnerCost > 0 ? Number(((hourlyDropRevenue / spawnerCost) * 100).toFixed(2)) : 0
      });
    }
  }
  spawnerAnalysis.sort((a, b) => a.hoursToBreakEven - b.hoursToBreakEven);

  // 9. Check Melon Block vs Melon Slice availability
  const melonBlockFound = findItem(normalizedListings, 'melon');
  const melonSliceFound = findItem(normalizedListings, 'melon_slice');
  const melonClarification = (!melonBlockFound && melonSliceFound) ? {
    sliceSellPrice: melonSliceFound.player_sell_price,
    sliceBuyPrice: melonSliceFound.buyable ? melonSliceFound.player_buy_price : null,
    message: 'Whole Melon Blocks are NOT sold or bought by the shop. The shop only trades Melon Slices and Melon Seeds. Breaking a melon block (via piston or axe) produces slices that sell to the shop.'
  } : null;

  return {
    scrapedAt: catalogData.scrapedAt || new Date().toISOString(),
    server: catalogData.server || 'the server',
    totalItemsScanned: reconciliation.total_listings,
    reconciliation,
    unique_items_count: reconciliation.unique_canonical_items,
    sellableCount: reconciliation.sellable_listings,
    buyableCount: reconciliation.buyable_listings,
    unbuyableCount: reconciliation.unbuyable_listings,
    unsellableCount: reconciliation.unsellable_listings,
    profitableSellableCount: reconciliation.profitable_sellable_listings,
    zeroPayoutSellableCount: reconciliation.zero_payout_sellable_listings,

    // Rankings & Analyses
    topSellItems: topUniqueSellItems,
    arbitrageOpportunities: arbitrageAudit.confirmed_arbitrage,
    unverifiedOpportunities: arbitrageAudit.unverified_opportunities,
    transactionExploits: arbitrageAudit.transaction_exploits,
    passiveFarmRankings,
    activeFarmRankings,
    spawnerAnalysis,
    melonClarification
  };
}

/**
 * Generates an LLM-ready strategic prompt containing all 12 auditable sections (Phase 9)
 */
export function generateAiPrompt(catalogData, analysis) {
  const server = analysis.server || catalogData?.server || 'the server';
  const recon = analysis.reconciliation || {};

  let prompt = `You are a Minecraft Economy Master and min-max strategist. Analyze the following verified shop data collected from ${server} and create the ultimate step-by-step roadmap to become the richest player on this server.\n\n`;

  prompt += `### 1. Data Collection & Catalog Invariants:\n`;
  prompt += `- Source Server: ${server}\n`;
  prompt += `- Collection Timestamp: ${analysis.scrapedAt || 'Recent'}\n`;
  prompt += `- Total Shop Listings: ${recon.total_listings || analysis.totalItemsScanned}\n`;
  prompt += `- Unique Canonical Minecraft Items: ${recon.unique_canonical_items || analysis.unique_items_count}\n`;
  prompt += `- Purchase Classification: ${recon.buyable_listings} buyable + ${recon.unbuyable_listings} unbuyable = ${recon.total_listings} total listings (Reconciled: ${recon.purchase_reconciles ? 'YES' : 'NO'})\n`;
  prompt += `- Sale Classification: ${recon.sellable_listings} sellable (${recon.profitable_sellable_listings} paying >$0, ${recon.zero_payout_sellable_listings} paying $0.00) + ${recon.unsellable_listings} unsellable = ${recon.total_listings} total listings (Reconciled: ${recon.sale_reconciles ? 'YES' : 'NO'})\n`;
  if (recon.warnings && recon.warnings.length > 0) {
    for (const w of recon.warnings) {
      prompt += `  * Warning: ${w}\n`;
    }
  }
  prompt += `\n`;

  prompt += `### 2. Transaction Definitions (Unambiguous Perspective):\n`;
  prompt += `- Player Buy Price: The price the player pays to acquire the item from the shop.\n`;
  prompt += `- Player Sell Price: The price the shop pays to the player upon selling.\n\n`;

  if (analysis.melonClarification) {
    prompt += `### 3. Item Economics Clarification (Melon Block vs Melon Slice):\n`;
    prompt += `- ${analysis.melonClarification.message}\n`;
    prompt += `- **Melon Slice**: Player Sell Price: $${analysis.melonClarification.sliceSellPrice.toFixed(2)}${analysis.melonClarification.sliceBuyPrice ? ` | Player Buy Price: $${analysis.melonClarification.sliceBuyPrice.toFixed(2)}` : ' | Cannot be bought'}\n`;
    prompt += `- **Melon Block**: Not traded in shop (Cannot be bought, Cannot be sold directly)\n\n`;
  }

  if (analysis.transactionExploits && analysis.transactionExploits.length > 0) {
    prompt += `### ⚠️ DIRECT TRANSACTION EXPLOITS (Pricing Inversions):\n`;
    for (const exp of analysis.transactionExploits) {
      prompt += `- **${exp.title}**: Buy for $${exp.player_buy_price.toFixed(2)} -> Sell back for $${exp.player_sell_price.toFixed(2)} (Instant profit: +$${exp.profit_per_unit.toFixed(2)}/item, +${exp.profit_margin_pct}% margin)\n`;
    }
    prompt += `\n`;
  }

  if (analysis.arbitrageOpportunities && analysis.arbitrageOpportunities.length > 0) {
    prompt += `### 🚨 DISCOVERED CRAFTING ARBITRAGE (CONFIRMED PROFITABLE):\n`;
    for (const arb of analysis.arbitrageOpportunities) {
      prompt += `- **${arb.title}**: Cost $${arb.total_acquisition_cost.toFixed(2)} to acquire inputs -> Sell ${arb.crafted_count}x ${arb.crafted_item} for $${arb.total_sale_revenue.toFixed(2)} (Net Profit: +$${arb.net_profit_per_cycle.toFixed(2)} per cycle, +${arb.profit_margin_pct}% margin)\n`;
    }
    prompt += `\n`;
  } else {
    prompt += `### Crafting Arbitrage:\n- Evaluated 60+ vanilla conversion and unpacking recipes against all shop listings: No direct profitable crafting loops exist (shop margins prevent infinite loops on standard recipes).\n\n`;
  }

  if (analysis.passiveFarmRankings && analysis.passiveFarmRankings.length > 0) {
    prompt += `### 🌾 Passive AFK Farm Rankings (Fully automated with zero player movement):\n`;
    for (const farm of analysis.passiveFarmRankings) {
      const buyStr = farm.canBuy && farm.buyPrice !== null ? `Player Buy / Shop Buy: $${farm.buyPrice.toFixed(2)}` : `Player Buy / Shop Buy: Cannot buy directly`;
      const seedStr = farm.seedBuyPrice !== null ? ` | Planting Material: $${farm.seedBuyPrice.toFixed(2)} (${farm.seedName})` : '';
      const paybackStr = farm.payback_period_hours !== null ? ` | Establishment Payback: ${farm.payback_period_hours} hrs` : '';
      prompt += `- **${farm.crop}** (100 plants): Player Sell: $${farm.sellPrice.toFixed(2)} | Gross Sales: $${farm.gross_sales_revenue_per_hour.toFixed(2)}/hr | Net Profit: $${farm.net_profit_per_hour.toFixed(2)}/hr | ${buyStr}${seedStr}${paybackStr} [Confidence: ${farm.confidence_level}]\n`;
    }
    prompt += `\n`;
  }

  if (analysis.activeFarmRankings && analysis.activeFarmRankings.length > 0) {
    prompt += `### 🚜 Active Harvest Crop Economics (Manual harvesting & replanting):\n`;
    for (const crop of analysis.activeFarmRankings) {
      const buyStr = crop.canBuy && crop.buyPrice !== null ? `Player Buy / Shop Buy: $${crop.buyPrice.toFixed(2)}` : `Player Buy / Shop Buy: Cannot buy directly`;
      const seedStr = crop.seedBuyPrice !== null ? ` | Planting Material: $${crop.seedBuyPrice.toFixed(2)}` : '';
      prompt += `- **${crop.crop}**: Player Sell: $${crop.sellPrice.toFixed(2)} | Full 36-slot Inventory Value: $${crop.full_inventory_sale_value.toLocaleString()} | Expected Gross / block: $${crop.expected_gross_revenue_per_block.toFixed(2)} | Expected Net / block: $${crop.expected_net_revenue_per_block.toFixed(2)} (${crop.replanting_retention}) | ${buyStr}${seedStr}\n`;
    }
    prompt += `\n`;
  }

  if (analysis.spawnerAnalysis && analysis.spawnerAnalysis.length > 0) {
    prompt += `### ⚡ Spawner Investment ROI (Ranked by fastest break-even):\n`;
    for (const sp of analysis.spawnerAnalysis) {
      prompt += `- **${sp.mob} Spawner**: Cost $${sp.spawnerCost.toLocaleString()} | Drops ${sp.dropName} @ $${sp.dropSellPrice}/ea | Hourly Revenue: ~$${sp.hourlyRevenue.toFixed(2)}/hr | Payback Period: **${sp.hoursToBreakEven} hours** (${sp.returnOnCapitalPerHourPct}%/hr ROC)\n`;
    }
    prompt += `\n`;
  }

  if (analysis.topSellItems && analysis.topSellItems.length > 0) {
    prompt += `### 💎 Top 10 Highest-Value Unique Sellable Items (Deduplicated):\n`;
    for (const itm of analysis.topSellItems) {
      prompt += `- **${itm.name}**: Sells for $${itm.player_sell_price.toFixed(2)}${itm.player_buy_price ? ` (Buys at $${itm.player_buy_price.toFixed(2)})` : ''} [Appears in ${itm.listing_count} listing(s): ${itm.categories.join(', ')}]\n`;
    }
    prompt += `\n`;
  }

  prompt += `Based on these exact, auditable economics, provide:\n`;
  prompt += `1. **Phase 1: Zero Capital Start ($0 to $50,000)** - Quickest starter grind to get seed capital.\n`;
  prompt += `2. **Phase 2: The AFK Factory ($50,000 to $500,000)** - How to set up the AFK bot with the best passive farms above.\n`;
  prompt += `3. **Phase 3: The Industrial Empire ($500,000+)** - Best spawner investments or bulk operations to dominate the economy.\n`;
  prompt += `4. **Strategic Summary** - Transparent progression path with zero false assumptions.\n`;
  prompt += `Be concise, strategic, and direct.`;

  return prompt;
}

/**
 * Generates clean, transparent, auditable Markdown report from analysis (Phase 9)
 */
export function generateMarkdownReport(analysis, aiResponse = null) {
  const recon = analysis.reconciliation || {};
  let md = `# 💰 Server Economy & Wealth Masterplan\n\n`;

  // 1. Audit & Invariant Summary
  md += `## 📊 1. Data Collection & Reconciliation Invariants\n`;
  md += `| Metric | Count | Details |\n`;
  md += `|---|---|---|\n`;
  md += `| **Total Shop Listings** | **${recon.total_listings || analysis.totalItemsScanned}** | Total items collected from shop GUI menus |\n`;
  md += `| **Unique Canonical Minecraft Items** | **${recon.unique_canonical_items || analysis.unique_items_count}** | Distinct Minecraft item IDs (${(recon.total_listings || 0) - (recon.unique_canonical_items || 0)} duplicate listings across categories) |\n`;
  md += `| **Buyable Listings** | **${recon.buyable_listings}** | Shop allows player purchase |\n`;
  md += `| **Unbuyable Listings** | **${recon.unbuyable_listings}** | Shop does not sell to player |\n`;
  md += `| **Purchase Reconciled** | **${recon.purchase_reconciles ? '✅ PASS' : '❌ FAIL'}** | \`${recon.equations?.purchase}\` |\n`;
  md += `| **Sellable Listings** | **${recon.sellable_listings}** | Shop accepts item (${recon.profitable_sellable_listings} paying >$0, ${recon.zero_payout_sellable_listings} paying $0.00) |\n`;
  md += `| **Unsellable Listings** | **${recon.unsellable_listings}** | Shop does not buy item |\n`;
  md += `| **Sale Reconciled** | **${recon.sale_reconciles ? '✅ PASS' : '❌ FAIL'}** | \`${recon.equations?.sale}\` |\n\n`;

  if (recon.warnings && recon.warnings.length > 0) {
    md += `> [!NOTE]\n> **Catalog Validation Warnings**:\n`;
    for (const w of recon.warnings) {
      md += `> - ${w}\n`;
    }
    md += `\n`;
  }

  // 2. Melon Clarification
  if (analysis.melonClarification) {
    md += `> [!IMPORTANT]\n`;
    md += `> **Melon Block vs Melon Slice Shop Economics**:\n`;
    md += `> ${analysis.melonClarification.message}\n`;
    md += `> - **Melon Slice**: Player Sell: \$${analysis.melonClarification.sliceSellPrice.toFixed(2)}${analysis.melonClarification.sliceBuyPrice ? ` | Player Buy: \$${analysis.melonClarification.sliceBuyPrice.toFixed(2)}` : ''}\n`;
    md += `> - **Melon Block**: Not traded directly in shop\n\n`;
  }

  // 3. Direct Exploits & Arbitrage
  if (analysis.transactionExploits && analysis.transactionExploits.length > 0) {
    md += `## ⚠️ Direct Transaction Exploits (Pricing Inversions)\n\n`;
    md += `| Item | Player Buy Price | Player Sell Price | Profit / Item | Margin |\n`;
    md += `|---|---|---|---|---|\n`;
    for (const exp of analysis.transactionExploits) {
      md += `| **${exp.display_name}** | \$${exp.player_buy_price.toFixed(2)} | \$${exp.player_sell_price.toFixed(2)} | **+\$${exp.profit_per_unit.toFixed(2)}** | +${exp.profit_margin_pct}% |\n`;
    }
    md += `\n`;
  }

  if (analysis.arbitrageOpportunities && analysis.arbitrageOpportunities.length > 0) {
    md += `> [!CAUTION]\n> **INFINITE MONEY ARBITRAGE DETECTED!**\n> You can buy ingredients directly from /shop, craft them, and sell them back for an instant profit loop.\n\n`;
    md += `## 🚨 Confirmed Profitable Crafting Arbitrage\n\n`;
    md += `| Recipe | Total Acquisition Cost | Gross Sell Revenue | Net Profit / Cycle | Margin |\n`;
    md += `|---|---|---|---|---|\n`;
    for (const arb of analysis.arbitrageOpportunities) {
      md += `| **${arb.title}** | \$${arb.total_acquisition_cost.toFixed(2)} | \$${arb.total_sale_revenue.toFixed(2)} | **+\$${arb.net_profit_per_cycle.toFixed(2)}** | +${arb.profit_margin_pct}% |\n`;
    }
    md += `\n`;
  }

  // 4. Passive Farm Rankings
  md += `## 🌾 Best Passive AFK Farms (Bot AFK 24/7)\n`;
  md += `Calculations based on 100 plants, default random tick speed (3), and 90% automated collection efficiency:\n\n`;
  md += `| Farm | Player Sell Price | Shop Buy Price | Seed Buy Price | Gross Revenue / hr | Net Profit / hr | Establishment Payback |\n`;
  md += `|---|---|---|---|---|---|---|\n`;
  for (const farm of analysis.passiveFarmRankings) {
    const buyDisplay = farm.canBuy && farm.buyPrice !== null ? `\$${farm.buyPrice.toFixed(2)}` : 'Cannot buy';
    const seedCostStr = farm.seedBuyPrice !== null ? `\$${farm.seedBuyPrice.toFixed(2)}` : 'N/A';
    const paybackStr = farm.payback_period_hours !== null ? `**${farm.payback_period_hours} hrs**` : 'N/A';
    md += `| **${farm.crop}** | \$${farm.sellPrice.toFixed(2)} | ${buyDisplay} | ${seedCostStr} | \$${farm.gross_sales_revenue_per_hour.toFixed(2)}/hr | **\$${farm.net_profit_per_hour.toFixed(2)}/hr** | ${paybackStr} |\n`;
  }
  md += `\n`;

  // 5. Active Crop Rankings
  if (analysis.activeFarmRankings && analysis.activeFarmRankings.length > 0) {
    md += `## 🚜 Active Harvest Crop Economics (Manual Replanting)\n`;
    md += `Full inventory represents a standard 36-slot player inventory of max stack size (2,304 units for 64-stack crops):\n\n`;
    md += `| Crop | Player Sell Price | Shop Buy Price | Seed Buy Price | Full 36-Slot Inv Value | Gross Drop / Block | Net Revenue / Block |\n`;
    md += `|---|---|---|---|---|---|---|\n`;
    for (const crop of analysis.activeFarmRankings) {
      const buyDisplay = crop.canBuy && crop.buyPrice !== null ? `\$${crop.buyPrice.toFixed(2)}` : 'Cannot buy';
      const seedCostStr = crop.seedBuyPrice !== null ? `\$${crop.seedBuyPrice.toFixed(2)}` : 'Cannot buy';
      md += `| **${crop.crop}** | \$${crop.sellPrice.toFixed(2)} | ${buyDisplay} | ${seedCostStr} | **\$${crop.full_inventory_sale_value.toLocaleString()}** | \$${crop.expected_gross_revenue_per_block.toFixed(2)} | \$${crop.expected_net_revenue_per_block.toFixed(2)} |\n`;
    }
    md += `\n`;
  }

  // 6. Spawner Break-Even Analysis
  if (analysis.spawnerAnalysis && analysis.spawnerAnalysis.length > 0) {
    md += `## ⚡ Spawner Investment ROI\n`;
    md += `Ranking of spawners based on fastest payback period:\n\n`;
    md += `| Spawner | Purchase Price | Drop Sells For | Hourly Revenue | Break-Even Payback | Return on Capital |\n`;
    md += `|---|---|---|---|---|---|\n`;
    for (const sp of analysis.spawnerAnalysis) {
      md += `| **${sp.mob}** | \$${sp.spawnerCost.toLocaleString()} | \$${sp.dropSellPrice.toFixed(2)} (${sp.dropName}) | \$${sp.hourlyRevenue.toFixed(2)}/hr | **${sp.hoursToBreakEven} hrs** | ${sp.returnOnCapitalPerHourPct}%/hr |\n`;
    }
    md += `\n`;
  }

  // 7. Top 10 Unique Items by Sale Price
  if (analysis.topSellItems && analysis.topSellItems.length > 0) {
    md += `## 💎 Top 10 Unique Items by Player Sale Price (Deduplicated)\n\n`;
    md += `| Item | Best Player Sell Price | Best Player Buy Price | Total Listings | Found in Categories |\n`;
    md += `|---|---|---|---|---|\n`;
    for (const itm of analysis.topSellItems) {
      const buyStr = itm.player_buy_price !== null ? `\$${itm.player_buy_price.toFixed(2)}` : 'N/A';
      md += `| **${itm.name}** | **\$${itm.player_sell_price.toFixed(2)}** | ${buyStr} | ${itm.listing_count} | ${itm.categories.join(', ')} |\n`;
    }
    md += `\n`;
  }

  // 8. Strategic AI Wealth Roadmap
  if (aiResponse) {
    const aiText = typeof aiResponse === 'object' ? (aiResponse.text || JSON.stringify(aiResponse, null, 2)) : String(aiResponse);
    md += `## 🧠 Strategic AI Wealth Roadmap\n\n`;
    md += `${aiText}\n\n`;
  }

  return md;
}
