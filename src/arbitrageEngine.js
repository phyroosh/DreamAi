/**
 * Systematic Arbitrage & Economic Conversion Engine
 * 
 * Evaluates the complete collected price dataset across:
 * 1. Direct buy/sell discrepancies (player_sell_price > player_buy_price)
 * 2. Standard Crafting conversions (combining ingredients into higher-value goods)
 * 3. Decompression & Unpacking (converting compressed blocks into sellable components)
 * 4. Smelting & Furnace processing (ores/logs/sand to ingots/charcoal/glass with fuel cost)
 * 5. Agricultural & Renewable item transformations
 * 6. Multi-hop directed graph conversions (e.g. Logs -> Planks -> Sticks -> Ladders)
 * 
 * Enforces strict transaction eligibility:
 * - Reject opportunities where any required input is unbuyable or missing price.
 * - Reject opportunities where the final output is unsellable or missing price.
 * - Distinguish confirmed arbitrage, unverified opportunities, and transaction exploits.
 */

// Fuel cost model: 1 Coal/Charcoal smelts 8 items = 0.125 coal per item smelted
const COAL_PER_SMELT = 0.125;

// Comprehensive transformation recipes
export const CONVERSION_RECIPES = [
  // 1. Decompression & Unpacking (Single-block reverse crafting)
  { id: 'unpack_iron_block', name: 'Iron Block to Iron Ingots', category: 'unpacking', inputs: [{ id: 'iron_block', count: 1 }], output: { id: 'iron_ingot', count: 9 }, isVanilla: true },
  { id: 'unpack_gold_block', name: 'Gold Block to Gold Ingots', category: 'unpacking', inputs: [{ id: 'gold_block', count: 1 }], output: { id: 'gold_ingot', count: 9 }, isVanilla: true },
  { id: 'unpack_diamond_block', name: 'Diamond Block to Diamonds', category: 'unpacking', inputs: [{ id: 'diamond_block', count: 1 }], output: { id: 'diamond', count: 9 }, isVanilla: true },
  { id: 'unpack_emerald_block', name: 'Emerald Block to Emeralds', category: 'unpacking', inputs: [{ id: 'emerald_block', count: 1 }], output: { id: 'emerald', count: 9 }, isVanilla: true },
  { id: 'unpack_coal_block', name: 'Coal Block to Coal', category: 'unpacking', inputs: [{ id: 'coal_block', count: 1 }], output: { id: 'coal', count: 9 }, isVanilla: true },
  { id: 'unpack_redstone_block', name: 'Redstone Block to Redstone', category: 'unpacking', inputs: [{ id: 'redstone_block', count: 1 }], output: { id: 'redstone', count: 9 }, isVanilla: true },
  { id: 'unpack_lapis_block', name: 'Lapis Block to Lapis Lazuli', category: 'unpacking', inputs: [{ id: 'lapis_block', count: 1 }], output: { id: 'lapis_lazuli', count: 9 }, isVanilla: true },
  { id: 'unpack_copper_block', name: 'Copper Block to Copper Ingots', category: 'unpacking', inputs: [{ id: 'copper_block', count: 1 }], output: { id: 'copper_ingot', count: 9 }, isVanilla: true },
  { id: 'unpack_netherite_block', name: 'Netherite Block to Netherite Ingots', category: 'unpacking', inputs: [{ id: 'netherite_block', count: 1 }], output: { id: 'netherite_ingot', count: 9 }, isVanilla: true },
  { id: 'unpack_hay_block', name: 'Hay Bale to Wheat', category: 'unpacking', inputs: [{ id: 'hay_block', count: 1 }], output: { id: 'wheat', count: 9 }, isVanilla: true },
  { id: 'unpack_melon_block', name: 'Melon Block to Melon Slices', category: 'unpacking', inputs: [{ id: 'melon', count: 1 }], output: { id: 'melon_slice', count: 9 }, isVanilla: true },
  { id: 'unpack_bone_block', name: 'Bone Block to Bone Meal', category: 'unpacking', inputs: [{ id: 'bone_block', count: 1 }], output: { id: 'bone_meal', count: 9 }, isVanilla: true },
  { id: 'bone_to_bone_meal', name: 'Bone to Bone Meal', category: 'unpacking', inputs: [{ id: 'bone', count: 1 }], output: { id: 'bone_meal', count: 3 }, isVanilla: true },
  { id: 'unpack_slime_block', name: 'Slime Block to Slimeballs', category: 'unpacking', inputs: [{ id: 'slime_block', count: 1 }], output: { id: 'slime_ball', count: 9 }, isVanilla: true },
  { id: 'unpack_iron_ingot', name: 'Iron Ingot to Iron Nuggets', category: 'unpacking', inputs: [{ id: 'iron_ingot', count: 1 }], output: { id: 'iron_nugget', count: 9 }, isVanilla: true },
  { id: 'unpack_gold_ingot', name: 'Gold Ingot to Gold Nuggets', category: 'unpacking', inputs: [{ id: 'gold_ingot', count: 1 }], output: { id: 'gold_nugget', count: 9 }, isVanilla: true },

  // 2. Compacting / Compression (Compacting components into blocks)
  { id: 'compact_iron_block', name: 'Iron Ingots to Iron Block', category: 'compacting', inputs: [{ id: 'iron_ingot', count: 9 }], output: { id: 'iron_block', count: 1 }, isVanilla: true },
  { id: 'compact_gold_block', name: 'Gold Ingots to Gold Block', category: 'compacting', inputs: [{ id: 'gold_ingot', count: 9 }], output: { id: 'gold_block', count: 1 }, isVanilla: true },
  { id: 'compact_diamond_block', name: 'Diamonds to Diamond Block', category: 'compacting', inputs: [{ id: 'diamond', count: 9 }], output: { id: 'diamond_block', count: 1 }, isVanilla: true },
  { id: 'compact_emerald_block', name: 'Emeralds to Emerald Block', category: 'compacting', inputs: [{ id: 'emerald', count: 9 }], output: { id: 'emerald_block', count: 1 }, isVanilla: true },
  { id: 'compact_coal_block', name: 'Coal to Coal Block', category: 'compacting', inputs: [{ id: 'coal', count: 9 }], output: { id: 'coal_block', count: 1 }, isVanilla: true },
  { id: 'compact_redstone_block', name: 'Redstone to Redstone Block', category: 'compacting', inputs: [{ id: 'redstone', count: 9 }], output: { id: 'redstone_block', count: 1 }, isVanilla: true },
  { id: 'compact_lapis_block', name: 'Lapis Lazuli to Lapis Block', category: 'compacting', inputs: [{ id: 'lapis_lazuli', count: 9 }], output: { id: 'lapis_block', count: 1 }, isVanilla: true },
  { id: 'compact_copper_block', name: 'Copper Ingots to Copper Block', category: 'compacting', inputs: [{ id: 'copper_ingot', count: 9 }], output: { id: 'copper_block', count: 1 }, isVanilla: true },
  { id: 'compact_iron_nuggets', name: 'Iron Nuggets to Iron Ingot', category: 'compacting', inputs: [{ id: 'iron_nugget', count: 9 }], output: { id: 'iron_ingot', count: 1 }, isVanilla: true },
  { id: 'compact_gold_nuggets', name: 'Gold Nuggets to Gold Ingot', category: 'compacting', inputs: [{ id: 'gold_nugget', count: 9 }], output: { id: 'gold_ingot', count: 1 }, isVanilla: true },
  { id: 'compact_hay_block', name: 'Wheat to Hay Bale', category: 'compacting', inputs: [{ id: 'wheat', count: 9 }], output: { id: 'hay_block', count: 1 }, isVanilla: true },
  { id: 'compact_melon_block', name: 'Melon Slices to Melon Block', category: 'compacting', inputs: [{ id: 'melon_slice', count: 9 }], output: { id: 'melon', count: 1 }, isVanilla: true },
  { id: 'compact_glowstone', name: 'Glowstone Dust to Glowstone Block', category: 'compacting', inputs: [{ id: 'glowstone_dust', count: 4 }], output: { id: 'glowstone', count: 1 }, isVanilla: true },
  { id: 'compact_quartz_block', name: 'Quartz to Quartz Block', category: 'compacting', inputs: [{ id: 'quartz', count: 4 }], output: { id: 'quartz_block', count: 1 }, isVanilla: true },
  { id: 'compact_sandstone', name: 'Sand to Sandstone', category: 'compacting', inputs: [{ id: 'sand', count: 4 }], output: { id: 'sandstone', count: 1 }, isVanilla: true },
  { id: 'compact_clay_block', name: 'Clay Balls to Clay Block', category: 'compacting', inputs: [{ id: 'clay_ball', count: 4 }], output: { id: 'clay', count: 1 }, isVanilla: true },

  // 3. Wood transformations
  { id: 'log_to_planks', name: 'Logs to Planks', category: 'wood', inputs: [{ id: 'log', count: 1 }], output: { id: 'planks', count: 4 }, isVanilla: true },
  { id: 'planks_to_sticks', name: 'Planks to Sticks', category: 'wood', inputs: [{ id: 'planks', count: 2 }], output: { id: 'stick', count: 4 }, isVanilla: true },
  { id: 'planks_to_bowls', name: 'Planks to Bowls', category: 'wood', inputs: [{ id: 'planks', count: 3 }], output: { id: 'bowl', count: 4 }, isVanilla: true },
  { id: 'planks_to_chests', name: 'Planks to Chest', category: 'wood', inputs: [{ id: 'planks', count: 8 }], output: { id: 'chest', count: 1 }, isVanilla: true },
  { id: 'planks_to_signs', name: 'Planks to Signs', category: 'wood', inputs: [{ id: 'planks', count: 6 }, { id: 'stick', count: 1 }], output: { id: 'sign', count: 3 }, isVanilla: true },
  { id: 'sticks_to_ladders', name: 'Sticks to Ladders', category: 'wood', inputs: [{ id: 'stick', count: 7 }], output: { id: 'ladder', count: 3 }, isVanilla: true },

  // 4. Metal & Stone Crafting
  { id: 'iron_to_bars', name: 'Iron Ingots to Iron Bars', category: 'metal', inputs: [{ id: 'iron_ingot', count: 6 }], output: { id: 'iron_bars', count: 16 }, isVanilla: true },
  { id: 'iron_to_bucket', name: 'Iron Ingots to Bucket', category: 'metal', inputs: [{ id: 'iron_ingot', count: 3 }], output: { id: 'bucket', count: 1 }, isVanilla: true },
  { id: 'iron_to_shears', name: 'Iron Ingots to Shears', category: 'metal', inputs: [{ id: 'iron_ingot', count: 2 }], output: { id: 'shears', count: 1 }, isVanilla: true },
  { id: 'iron_to_trapdoor', name: 'Iron Ingots to Iron Trapdoor', category: 'metal', inputs: [{ id: 'iron_ingot', count: 4 }], output: { id: 'iron_trapdoor', count: 1 }, isVanilla: true },
  { id: 'iron_to_doors', name: 'Iron Ingots to Iron Doors', category: 'metal', inputs: [{ id: 'iron_ingot', count: 6 }], output: { id: 'iron_door', count: 3 }, isVanilla: true },
  { id: 'iron_to_minecart', name: 'Iron Ingots to Minecart', category: 'metal', inputs: [{ id: 'iron_ingot', count: 5 }], output: { id: 'minecart', count: 1 }, isVanilla: true },
  { id: 'gold_to_pressure_plate', name: 'Gold Ingots to Light Pressure Plate', category: 'metal', inputs: [{ id: 'gold_ingot', count: 2 }], output: { id: 'light_weighted_pressure_plate', count: 1 }, isVanilla: true },
  { id: 'iron_to_pressure_plate', name: 'Iron Ingots to Heavy Pressure Plate', category: 'metal', inputs: [{ id: 'iron_ingot', count: 2 }], output: { id: 'heavy_weighted_pressure_plate', count: 1 }, isVanilla: true },

  // 5. Paper, Books & Farming
  { id: 'cane_to_paper', name: 'Sugar Cane to Paper', category: 'farming', inputs: [{ id: 'sugar_cane', count: 3 }], output: { id: 'paper', count: 3 }, isVanilla: true },
  { id: 'cane_to_sugar', name: 'Sugar Cane to Sugar', category: 'farming', inputs: [{ id: 'sugar_cane', count: 1 }], output: { id: 'sugar', count: 1 }, isVanilla: true },
  { id: 'paper_to_book', name: 'Paper + Leather to Books', category: 'farming', inputs: [{ id: 'paper', count: 3 }, { id: 'leather', count: 1 }], output: { id: 'book', count: 1 }, isVanilla: true },
  { id: 'books_to_shelf', name: 'Books + Planks to Bookshelf', category: 'farming', inputs: [{ id: 'book', count: 3 }, { id: 'planks', count: 6 }], output: { id: 'bookshelf', count: 1 }, isVanilla: true },
  { id: 'wheat_to_bread', name: 'Wheat to Bread', category: 'farming', inputs: [{ id: 'wheat', count: 3 }], output: { id: 'bread', count: 1 }, isVanilla: true },
  { id: 'wool_to_carpet', name: 'Wool to Carpet', category: 'farming', inputs: [{ id: 'wool', count: 2 }], output: { id: 'carpet', count: 3 }, isVanilla: true },
  { id: 'string_to_wool', name: 'String to Wool', category: 'farming', inputs: [{ id: 'string', count: 4 }], output: { id: 'white_wool', count: 1 }, isVanilla: true },

  // 6. Smelting & Furnace Processing (requires fuel)
  { id: 'smelt_cobblestone', name: 'Smelt Cobblestone to Stone', category: 'smelting', inputs: [{ id: 'cobblestone', count: 1 }], fuelItem: 'coal', fuelRatio: COAL_PER_SMELT, output: { id: 'stone', count: 1 }, isVanilla: true },
  { id: 'smelt_sand', name: 'Smelt Sand to Glass', category: 'smelting', inputs: [{ id: 'sand', count: 1 }], fuelItem: 'coal', fuelRatio: COAL_PER_SMELT, output: { id: 'glass', count: 1 }, isVanilla: true },
  { id: 'smelt_clay', name: 'Smelt Clay Ball to Brick', category: 'smelting', inputs: [{ id: 'clay_ball', count: 1 }], fuelItem: 'coal', fuelRatio: COAL_PER_SMELT, output: { id: 'brick', count: 1 }, isVanilla: true },
  { id: 'smelt_raw_iron', name: 'Smelt Raw Iron to Iron Ingot', category: 'smelting', inputs: [{ id: 'raw_iron', count: 1 }], fuelItem: 'coal', fuelRatio: COAL_PER_SMELT, output: { id: 'iron_ingot', count: 1 }, isVanilla: true },
  { id: 'smelt_raw_gold', name: 'Smelt Raw Gold to Gold Ingot', category: 'smelting', inputs: [{ id: 'raw_gold', count: 1 }], fuelItem: 'coal', fuelRatio: COAL_PER_SMELT, output: { id: 'gold_ingot', count: 1 }, isVanilla: true },
  { id: 'smelt_raw_copper', name: 'Smelt Raw Copper to Copper Ingot', category: 'smelting', inputs: [{ id: 'raw_copper', count: 1 }], fuelItem: 'coal', fuelRatio: COAL_PER_SMELT, output: { id: 'copper_ingot', count: 1 }, isVanilla: true },
  { id: 'smelt_log_to_charcoal', name: 'Smelt Log to Charcoal', category: 'smelting', inputs: [{ id: 'log', count: 1 }], fuelItem: 'coal', fuelRatio: COAL_PER_SMELT, output: { id: 'charcoal', count: 1 }, isVanilla: true },
  { id: 'smelt_cactus', name: 'Smelt Cactus to Green Dye', category: 'smelting', inputs: [{ id: 'cactus', count: 1 }], fuelItem: 'coal', fuelRatio: COAL_PER_SMELT, output: { id: 'green_dye', count: 1 }, isVanilla: true },
  { id: 'smelt_potato', name: 'Smelt Potato to Baked Potato', category: 'smelting', inputs: [{ id: 'potato', count: 1 }], fuelItem: 'coal', fuelRatio: COAL_PER_SMELT, output: { id: 'baked_potato', count: 1 }, isVanilla: true }
];

/**
 * Helper to match an item identifier against shop listings strictly
 */
function findShopItem(listings, targetId) {
  const cleanTarget = String(targetId).toLowerCase().replace(/^minecraft:/, '').trim();

  // 1. Exact match on canonical_id or item_id
  const exact = listings.find(i => {
    const id = (i.item_id || i.name || '').toLowerCase().replace(/^minecraft:/, '');
    return id === cleanTarget;
  });
  if (exact) return exact;

  // 2. Generic material families
  if (cleanTarget === 'log') {
    return listings.find(i => {
      const id = (i.item_id || i.name || '').toLowerCase();
      return id.endsWith('_log') || id.endsWith('_wood');
    });
  }
  if (cleanTarget === 'planks') {
    return listings.find(i => {
      const id = (i.item_id || i.name || '').toLowerCase();
      return id.endsWith('_planks');
    });
  }
  if (cleanTarget === 'wool') {
    return listings.find(i => {
      const id = (i.item_id || i.name || '').toLowerCase();
      return id.endsWith('_wool');
    });
  }
  if (cleanTarget === 'carpet') {
    return listings.find(i => {
      const id = (i.item_id || i.name || '').toLowerCase();
      return id.endsWith('_carpet');
    });
  }
  if (cleanTarget === 'coal') {
    return listings.find(i => {
      const id = (i.item_id || i.name || '').toLowerCase();
      return id === 'coal' || id === 'charcoal';
    });
  }

  return null;
}

/**
 * Runs a systematic audit across all possible conversion routes and direct transactions
 * 
 * @param {Array<Object>} listings Normalized shop listings
 * @returns {Object} Systematic arbitrage audit report
 */
export function auditArbitrageOpportunities(listings = []) {
  const confirmedArbitrage = [];
  const unverifiedOpportunities = [];
  const transactionExploits = [];
  const evaluatedRoutesCount = { direct: 0, recipes: 0, rejected: 0 };

  // 1. Audit Direct Buy/Sell Opportunities (Identical Item)
  for (const listing of listings) {
    evaluatedRoutesCount.direct++;
    if (listing.buyable && listing.sellable && listing.player_buy_price !== null && listing.player_sell_price !== null) {
      const buyPrice = listing.player_buy_price;
      const sellPrice = listing.player_sell_price;
      const directProfit = sellPrice - buyPrice;

      if (directProfit > 0) {
        // Direct buy price is LESS than sell price! That is an immediate transaction exploit / pricing flaw
        transactionExploits.push({
          type: 'direct_shop_trade_exploit',
          classification: 'transaction_exploit',
          title: `Direct Trade Inversion: ${listing.display_name}`,
          item_id: listing.item_id,
          display_name: listing.display_name,
          category: listing.category,
          player_buy_price: buyPrice,
          player_sell_price: sellPrice,
          profit_per_unit: directProfit,
          profit_margin_pct: Number(((directProfit / buyPrice) * 100).toFixed(1)),
          capital_required: buyPrice,
          repeatability: 'instant_loop_in_gui',
          bottlenecks: 'Limited by player inventory capacity and server balance / transaction caps',
          steps: [
            `1. Buy 1x ${listing.display_name} from /shop for $${buyPrice.toFixed(2)}`,
            `2. Immediately sell 1x ${listing.display_name} back to /shop for $${sellPrice.toFixed(2)}`,
            `3. Receive instant profit of +$${directProfit.toFixed(2)} per item without leaving GUI`
          ]
        });
      }
    }
  }

  // 2. Audit Recipe Transformations
  // Pre-find fuel price if smelting
  const coalListing = findShopItem(listings, 'coal');
  const fuelUnitCost = (coalListing && coalListing.buyable && coalListing.player_buy_price !== null) 
    ? coalListing.player_buy_price 
    : null;

  for (const recipe of CONVERSION_RECIPES) {
    evaluatedRoutesCount.recipes++;

    // A. Check Output Eligibility
    const foundOutput = findShopItem(listings, recipe.output.id);
    if (!foundOutput || !foundOutput.sellable || foundOutput.player_sell_price === null || foundOutput.player_sell_price <= 0) {
      evaluatedRoutesCount.rejected++;
      continue; // Output cannot be liquidated for money
    }

    // B. Check Input Eligibility
    let canAcquireAllInputs = true;
    let totalAcquisitionCost = 0;
    const inputBreakdown = [];

    for (const input of recipe.inputs) {
      const foundInput = findShopItem(listings, input.id);
      if (!foundInput || !foundInput.buyable || foundInput.player_buy_price === null) {
        canAcquireAllInputs = false;
        break;
      }
      const cost = foundInput.player_buy_price * input.count;
      totalAcquisitionCost += cost;
      inputBreakdown.push({
        id: foundInput.item_id,
        name: foundInput.display_name,
        count: input.count,
        unit_price: foundInput.player_buy_price,
        subtotal: cost
      });
    }

    if (!canAcquireAllInputs) {
      evaluatedRoutesCount.rejected++;
      continue; // At least one required ingredient is not sold by the shop
    }

    // C. Check Fuel Cost if Smelting
    let processingCost = 0;
    let fuelBreakdown = null;
    if (recipe.fuelItem) {
      const fuelRequired = recipe.fuelRatio * (recipe.inputs[0]?.count || 1);
      if (fuelUnitCost !== null) {
        processingCost = fuelRequired * fuelUnitCost;
        fuelBreakdown = {
          fuelItem: 'coal',
          amount: fuelRequired,
          unitCost: fuelUnitCost,
          totalFuelCost: processingCost
        };
      } else {
        // Fuel is required but cannot be bought in shop; mark as unverified opportunity
        processingCost = 0;
      }
    }

    // D. Compute Financial Results
    const totalSaleRevenue = foundOutput.player_sell_price * recipe.output.count;
    const totalExpenses = totalAcquisitionCost + processingCost;
    const netProfitPerCycle = Number((totalSaleRevenue - totalExpenses).toFixed(4));
    const profitMarginPct = totalExpenses > 0 ? Number(((netProfitPerCycle / totalExpenses) * 100).toFixed(2)) : 0;
    const profitPerUnitOutput = Number((netProfitPerCycle / recipe.output.count).toFixed(4));

    if (netProfitPerCycle > 0) {
      const opportunity = {
        recipe_id: recipe.id,
        recipeName: recipe.name,
        title: recipe.name,
        category: recipe.category,
        crafted_item: foundOutput.display_name,
        craftedItem: foundOutput.display_name,
        crafted_count: recipe.output.count,
        craftedCount: recipe.output.count,
        unit_sale_price: foundOutput.player_sell_price,
        unitSellPrice: foundOutput.player_sell_price,
        total_acquisition_cost: totalAcquisitionCost,
        totalCost: totalExpenses,
        processing_costs: processingCost,
        total_sale_revenue: totalSaleRevenue,
        totalRevenue: totalSaleRevenue,
        net_profit_per_cycle: netProfitPerCycle,
        netProfitPerCraft: netProfitPerCycle,
        profit_margin_pct: profitMarginPct,
        profitMarginPct: profitMarginPct,
        profit_per_unit_output: profitPerUnitOutput,
        capital_required: totalExpenses,
        ingredients: inputBreakdown,
        fuel: fuelBreakdown,
        is_vanilla_recipe: recipe.isVanilla,
        classification: (recipe.fuelItem && fuelUnitCost === null) ? 'unverified_opportunity' : 'confirmed_arbitrage',
        steps: [
          ...inputBreakdown.map(i => `Buy ${i.count}x ${i.name} for $${i.subtotal.toFixed(2)}`),
          recipe.category === 'smelting' ? `Smelt in furnace (Fuel cost: $${processingCost.toFixed(2)})` : `Craft ${recipe.output.count}x ${foundOutput.display_name}`,
          `Sell ${recipe.output.count}x ${foundOutput.display_name} for $${totalSaleRevenue.toFixed(2)} (Net profit: +$${netProfitPerCycle.toFixed(2)})`
        ]
      };

      if (opportunity.classification === 'confirmed_arbitrage') {
        confirmedArbitrage.push(opportunity);
      } else {
        unverifiedOpportunities.push(opportunity);
      }
    }
  }

  // Sort by net profit per cycle
  confirmedArbitrage.sort((a, b) => b.net_profit_per_cycle - a.net_profit_per_cycle);
  unverifiedOpportunities.sort((a, b) => b.net_profit_per_cycle - a.net_profit_per_cycle);

  return {
    evaluated_routes: evaluatedRoutesCount,
    confirmed_arbitrage_count: confirmedArbitrage.length,
    confirmed_arbitrage: confirmedArbitrage,
    unverified_opportunities_count: unverifiedOpportunities.length,
    unverified_opportunities: unverifiedOpportunities,
    transaction_exploits_count: transactionExploits.length,
    transaction_exploits: transactionExploits
  };
}
