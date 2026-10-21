/**
 * Economy and Arbitrage Analyzer
 * Analyzes scraped Minecraft shop catalogs to find:
 * - Infinite crafting arbitrage (crafting loops with profit)
 * - Passive AFK farm ROI (Cactus, Sugar Cane, Bamboo, Pumpkins)
 * - Active crop farming profits
 * - Spawner break-even timelines
 * - Full AI-powered Wealth Roadmap
 */

// Common crafting recipes: inputs -> { resultCount, inputs: { itemName: count } }
const RECIPES = [
  // Wood recipes
  { name: 'Logs to Planks', result: 'planks', resultCount: 4, inputs: [{ name: 'log', count: 1 }] },
  { name: 'Planks to Sticks', result: 'stick', resultCount: 4, inputs: [{ name: 'planks', count: 2 }] },
  { name: 'Planks to Bowls', result: 'bowl', resultCount: 4, inputs: [{ name: 'planks', count: 3 }] },
  { name: 'Planks to Ladders', result: 'ladder', resultCount: 3, inputs: [{ name: 'stick', count: 7 }] },
  { name: 'Planks to Chests', result: 'chest', resultCount: 1, inputs: [{ name: 'planks', count: 8 }] },
  { name: 'Planks to Signs', result: 'sign', resultCount: 3, inputs: [{ name: 'planks', count: 6 }, { name: 'stick', count: 1 }] },
  
  // Farming & Food
  { name: 'Sugar Cane to Paper', result: 'paper', resultCount: 3, inputs: [{ name: 'sugar_cane', count: 3 }] },
  { name: 'Paper + Leather to Books', result: 'book', resultCount: 1, inputs: [{ name: 'paper', count: 3 }, { name: 'leather', count: 1 }] },
  { name: 'Sugar Cane to Sugar', result: 'sugar', resultCount: 1, inputs: [{ name: 'sugar_cane', count: 1 }] },
  { name: 'Wheat to Bread', result: 'bread', resultCount: 1, inputs: [{ name: 'wheat', count: 3 }] },
  { name: 'Wheat to Hay Bale', result: 'hay_block', resultCount: 1, inputs: [{ name: 'wheat', count: 9 }] },
  { name: 'Hay Bale to Wheat', result: 'wheat', resultCount: 9, inputs: [{ name: 'hay_block', count: 1 }] },
  { name: 'Bone to Bone Meal', result: 'bone_meal', resultCount: 3, inputs: [{ name: 'bone', count: 1 }] },

  // Ores & Metals
  { name: 'Iron Ingot to Iron Block', result: 'iron_block', resultCount: 1, inputs: [{ name: 'iron_ingot', count: 9 }] },
  { name: 'Iron Block to Iron Ingot', result: 'iron_ingot', resultCount: 9, inputs: [{ name: 'iron_block', count: 1 }] },
  { name: 'Gold Ingot to Gold Block', result: 'gold_block', resultCount: 1, inputs: [{ name: 'gold_ingot', count: 9 }] },
  { name: 'Gold Block to Gold Ingot', result: 'gold_ingot', resultCount: 9, inputs: [{ name: 'gold_block', count: 1 }] },
  { name: 'Diamond to Diamond Block', result: 'diamond_block', resultCount: 1, inputs: [{ name: 'diamond', count: 9 }] },
  { name: 'Diamond Block to Diamond', result: 'diamond', resultCount: 9, inputs: [{ name: 'diamond_block', count: 1 }] },
  { name: 'Iron to Iron Bars', result: 'iron_bars', resultCount: 16, inputs: [{ name: 'iron_ingot', count: 6 }] },
  { name: 'Iron to Bucket', result: 'bucket', resultCount: 1, inputs: [{ name: 'iron_ingot', count: 3 }] },
  { name: 'Iron to Shears', result: 'shears', resultCount: 1, inputs: [{ name: 'iron_ingot', count: 2 }] },
  { name: 'Iron to Iron Trapdoor', result: 'iron_trapdoor', resultCount: 1, inputs: [{ name: 'iron_ingot', count: 4 }] },

  // Minerals & Blocks
  { name: 'Glowstone Dust to Block', result: 'glowstone', resultCount: 1, inputs: [{ name: 'glowstone_dust', count: 4 }] },
  { name: 'Quartz to Quartz Block', result: 'quartz_block', resultCount: 1, inputs: [{ name: 'quartz', count: 4 }] },
  { name: 'Sand to Sandstone', result: 'sandstone', resultCount: 1, inputs: [{ name: 'sand', count: 4 }] },
  { name: 'Clay to Clay Block', result: 'clay', resultCount: 1, inputs: [{ name: 'clay_ball', count: 4 }] },
  { name: 'Wool to Carpet', result: 'carpet', resultCount: 3, inputs: [{ name: 'wool', count: 2 }] }
];

// Spawner drops and average hourly drops per spawner in a standard grinder
const SPAWNER_DATA = [
  { mob: 'Iron Golem', spawnerKeys: ['iron_golem', 'iron golem'], dropName: 'iron_ingot', dropsPerHour: 360 },
  { mob: 'Blaze', spawnerKeys: ['blaze'], dropName: 'blaze_rod', dropsPerHour: 450 },
  { mob: 'Creeper', spawnerKeys: ['creeper'], dropName: 'gunpowder', dropsPerHour: 400 },
  { mob: 'Skeleton', spawnerKeys: ['skeleton'], dropName: 'bone', dropsPerHour: 400 },
  { mob: 'Zombie', spawnerKeys: ['zombie'], dropName: 'rotten_flesh', dropsPerHour: 400 },
  { mob: 'Enderman', spawnerKeys: ['enderman'], dropName: 'ender_pearl', dropsPerHour: 350 },
  { mob: 'Witch', spawnerKeys: ['witch'], dropName: 'redstone', dropsPerHour: 250 }
];

// Passive crops (zero player interaction after building)
const PASSIVE_CROPS = [
  { name: 'cactus', displayName: 'Cactus', defaultGrowthPerHourPer100: 100 },
  { name: 'sugar_cane', displayName: 'Sugar Cane', defaultGrowthPerHourPer100: 100 },
  { name: 'pumpkin', displayName: 'Pumpkin', defaultGrowthPerHourPer100: 150 },
  { name: 'melon_slice', displayName: 'Melon Slice', defaultGrowthPerHourPer100: 600 },
  { name: 'melon', displayName: 'Melon Block', defaultGrowthPerHourPer100: 150 },
  { name: 'bamboo', displayName: 'Bamboo', defaultGrowthPerHourPer100: 300 },
  { name: 'kelp', displayName: 'Kelp', defaultGrowthPerHourPer100: 250 }
];

// Active harvest crops (requires planting/replanting)
const ACTIVE_CROPS = [
  { name: 'wheat', displayName: 'Wheat', yieldPerHarvest: 1.0 },
  { name: 'potato', displayName: 'Potato', yieldPerHarvest: 2.5 },
  { name: 'baked_potato', displayName: 'Baked Potato', yieldPerHarvest: 2.5 },
  { name: 'carrot', displayName: 'Carrot', yieldPerHarvest: 2.5 },
  { name: 'beetroot', displayName: 'Beetroot', yieldPerHarvest: 1.0 },
  { name: 'nether_wart', displayName: 'Nether Wart', yieldPerHarvest: 2.5 }
];

/**
 * Finds matching items in catalog by flexible name matching
 */
function findItem(catalogItems, query) {
  const q = query.toLowerCase().replace(/_/g, ' ').trim();
  return catalogItems.find(item => {
    const itemName = (item.name || '').toLowerCase().replace(/_/g, ' ');
    const displayName = (item.displayName || '').toLowerCase().replace(/_/g, ' ');
    return (
      itemName === q ||
      displayName === q ||
      itemName.endsWith(` ${q}`) ||
      displayName.endsWith(` ${q}`) ||
      itemName.includes(q) ||
      displayName.includes(q)
    );
  });
}

/**
 * Runs deterministic economic calculations on a catalog of shop items
 */
export function analyzeEconomy(catalogData) {
  const items = catalogData.items || (catalogData.categories || []).flatMap(c => c.items || []);
  
  // 1. Highest Sell Value Items
  const sellableItems = items
    .filter(i => i && i.canSell && typeof i.sellPrice === 'number' && i.sellPrice > 0)
    .sort((a, b) => b.sellPrice - a.sellPrice);

  // 2. Best Margin Items (Highest Sell / Buy ratio)
  const marginItems = items
    .filter(i => i && i.canSell && i.canBuy && i.buyPrice > 0 && i.sellPrice > 0)
    .map(i => ({
      ...i,
      ratio: i.sellPrice / i.buyPrice,
      marginPct: ((i.sellPrice - i.buyPrice) / i.buyPrice) * 100
    }))
    .sort((a, b) => b.ratio - a.ratio);

  // 3. Crafting Arbitrage Analysis (Infinite Money Loops)
  const arbitrageOpportunities = [];
  for (const recipe of RECIPES) {
    let canPerform = true;
    let totalCost = 0;
    const ingredientDetails = [];

    for (const input of recipe.inputs) {
      const foundInput = findItem(items, input.name);
      if (!foundInput || !foundInput.canBuy || typeof foundInput.buyPrice !== 'number') {
        canPerform = false;
        break;
      }
      const cost = foundInput.buyPrice * input.count;
      totalCost += cost;
      ingredientDetails.push({
        item: foundInput.displayName || foundInput.name,
        count: input.count,
        unitBuyPrice: foundInput.buyPrice,
        subtotal: cost
      });
    }

    if (!canPerform) continue;

    const foundOutput = findItem(items, recipe.result);
    if (!foundOutput || !foundOutput.canSell || typeof foundOutput.sellPrice !== 'number') {
      continue;
    }

    const totalRevenue = foundOutput.sellPrice * recipe.resultCount;
    const netProfit = totalRevenue - totalCost;
    const profitMarginPct = totalCost > 0 ? (netProfit / totalCost) * 100 : 0;

    if (netProfit > 0) {
      arbitrageOpportunities.push({
        recipeName: recipe.name,
        craftedItem: foundOutput.displayName || foundOutput.name,
        craftedCount: recipe.resultCount,
        unitSellPrice: foundOutput.sellPrice,
        totalCost,
        totalRevenue,
        netProfitPerCraft: netProfit,
        profitMarginPct,
        ingredients: ingredientDetails
      });
    }
  }

  // Sort arbitrage opportunities by highest net profit per craft
  arbitrageOpportunities.sort((a, b) => b.netProfitPerCraft - a.netProfitPerCraft);

  // 4. Passive AFK Crops Ranking
  const passiveFarmRankings = [];
  for (const crop of PASSIVE_CROPS) {
    const found = findItem(items, crop.name);
    if (found && found.canSell && typeof found.sellPrice === 'number') {
      const hourlyProfitPer100 = crop.defaultGrowthPerHourPer100 * found.sellPrice;
      passiveFarmRankings.push({
        crop: crop.displayName,
        name: crop.name,
        sellPrice: found.sellPrice,
        estHourlyProfitPer100Plots: hourlyProfitPer100,
        difficulty: 'Zero player interaction (AFK)'
      });
    }
  }
  passiveFarmRankings.sort((a, b) => b.estHourlyProfitPer100Plots - a.estHourlyProfitPer100Plots);

  // 5. Active Farming Ranking
  const activeFarmRankings = [];
  for (const crop of ACTIVE_CROPS) {
    const found = findItem(items, crop.name);
    if (found && found.canSell && typeof found.sellPrice === 'number') {
      const returnPerHarvest = crop.yieldPerHarvest * found.sellPrice;
      activeFarmRankings.push({
        crop: crop.displayName,
        name: crop.name,
        sellPrice: found.sellPrice,
        returnPerHarvest,
        estProfitPerInventory: returnPerHarvest * 2304 // full inventory of 36 stacks
      });
    }
  }
  activeFarmRankings.sort((a, b) => b.returnPerHarvest - a.returnPerHarvest);

  // 6. Spawner Break-Even Analysis
  const spawnerAnalysis = [];
  for (const spawner of SPAWNER_DATA) {
    // Find spawner in catalog
    const foundSpawner = items.find(i => {
      const name = (i.displayName || i.name || '').toLowerCase();
      return (
        name.includes('spawner') &&
        spawner.spawnerKeys.some(k => name.includes(k))
      );
    });

    const foundDrop = findItem(items, spawner.dropName);

    if (foundSpawner && foundDrop && foundSpawner.canBuy && foundDrop.canSell) {
      const spawnerCost = foundSpawner.buyPrice;
      const dropSellPrice = foundDrop.sellPrice;
      const hourlyDropRevenue = spawner.dropsPerHour * dropSellPrice;
      const hoursToBreakEven = hourlyDropRevenue > 0 ? (spawnerCost / hourlyDropRevenue) : Infinity;

      spawnerAnalysis.push({
        mob: spawner.mob,
        spawnerCost,
        dropName: foundDrop.displayName || foundDrop.name,
        dropSellPrice,
        hourlyRevenue: hourlyDropRevenue,
        hoursToBreakEven: Number(hoursToBreakEven.toFixed(1))
      });
    }
  }
  spawnerAnalysis.sort((a, b) => a.hoursToBreakEven - b.hoursToBreakEven);

  return {
    totalItemsScanned: items.length,
    sellableCount: sellableItems.length,
    arbitrageOpportunities,
    passiveFarmRankings,
    activeFarmRankings,
    spawnerAnalysis,
    topSellItems: sellableItems.slice(0, 10).map(i => ({
      name: i.displayName || i.name,
      sellPrice: i.sellPrice,
      buyPrice: i.buyPrice
    })),
    bestMarginItems: marginItems.slice(0, 10)
  };
}

/**
 * Generates an LLM-ready prompt summarizing the economy findings
 */
export function generateAiPrompt(catalogData, analysis) {
  const server = catalogData.server || 'the server';
  
  let prompt = `You are a Minecraft Economy Master and min-max strategist. Analyze the following shop data collected from ${server} and create the ultimate step-by-step roadmap to become the richest player on this server.\n\n`;

  prompt += `### Scanned Economy Overview:\n`;
  prompt += `- Total items in shop: ${analysis.totalItemsScanned}\n`;
  prompt += `- Sellable items: ${analysis.sellableCount}\n\n`;

  if (analysis.arbitrageOpportunities.length > 0) {
    prompt += `### 🚨 DISCOVERED CRAFTING ARBITRAGE (Infinite Money Exploits):\n`;
    for (const arb of analysis.arbitrageOpportunities) {
      prompt += `- **${arb.recipeName}**: Cost $${arb.totalCost.toFixed(2)} to buy ingredients -> Sell ${arb.craftedCount}x ${arb.craftedItem} for $${arb.totalRevenue.toFixed(2)} (Net Profit: +$${arb.netProfitPerCraft.toFixed(2)} per craft, +${arb.profitMarginPct.toFixed(1)}% margin!)\n`;
    }
    prompt += `\n`;
  } else {
    prompt += `### Crafting Arbitrage:\n- No direct infinite crafting loops found in default recipes (shop prices are balanced for basic crafting).\n\n`;
  }

  if (analysis.passiveFarmRankings.length > 0) {
    prompt += `### 🌾 Passive AFK Farm Rankings (Bot AFK farming with zero player actions):\n`;
    for (const crop of analysis.passiveFarmRankings) {
      prompt += `- **${crop.crop}**: Sell price $${crop.sellPrice.toFixed(2)} | Est. Profit: $${crop.estHourlyProfitPer100Plots.toFixed(2)}/hr per 100 plants\n`;
    }
    prompt += `\n`;
  }

  if (analysis.activeFarmRankings.length > 0) {
    prompt += `### 🚜 Active Crop Rankings (Manual harvesting/replanting):\n`;
    for (const crop of analysis.activeFarmRankings) {
      prompt += `- **${crop.crop}**: Sell price $${crop.sellPrice.toFixed(2)} | Return per harvest: $${crop.returnPerHarvest.toFixed(2)} | Full inventory sell: ~$${crop.estProfitPerInventory.toFixed(2)}\n`;
    }
    prompt += `\n`;
  }

  if (analysis.spawnerAnalysis.length > 0) {
    prompt += `### ⚡ Spawner Investment ROI:\n`;
    for (const sp of analysis.spawnerAnalysis) {
      prompt += `- **${sp.mob} Spawner**: Cost $${sp.spawnerCost.toLocaleString()} | Drops ${sp.dropName} @ $${sp.dropSellPrice}/ea | Revenue: ~$${sp.hourlyRevenue.toFixed(2)}/hr | Payback Period: **${sp.hoursToBreakEven} hours**\n`;
    }
    prompt += `\n`;
  }

  if (analysis.topSellItems.length > 0) {
    prompt += `### 💎 Top 10 Highest Value Sell Items:\n`;
    for (const itm of analysis.topSellItems) {
      prompt += `- ${itm.name}: Sells for $${itm.sellPrice.toFixed(2)}${itm.buyPrice ? ` (Buys at $${itm.buyPrice.toFixed(2)})` : ''}\n`;
    }
    prompt += `\n`;
  }

  prompt += `\nBased on these exact economics, provide:\n`;
  prompt += `1. **Phase 1: The Fast Start ($0 to $50,000)** - Quickest starter grind to get seed capital.\n`;
  prompt += `2. **Phase 2: The AFK Factory ($50,000 to $500,000)** - How to set up the AFK bot with the best passive farms discovered above.\n`;
  prompt += `3. **Phase 3: The Industrial Empire ($500,000+)** - Best spawner investments or bulk operations to dominate the economy.\n`;
  prompt += `4. **Key Exploits & Hidden Gems** - Specific pricing anomalies or arbitrage found above.\n`;
  prompt += `Be concise, strategic, and direct.`;

  return prompt;
}

/**
 * Generates clean Markdown report from analysis
 */
export function generateMarkdownReport(analysis, aiResponse = null) {
  let md = `# 💰 Server Economy & Wealth Masterplan\n\n`;

  if (analysis.arbitrageOpportunities.length > 0) {
    md += `> [!CAUTION]\n> **INFINITE MONEY ARBITRAGE DETECTED!**\n> You can buy ingredients directly from /shop, craft them, and sell them back for an instant profit loop.\n\n`;
    md += `| Crafting Recipe | Buy Cost | Sell Revenue | Net Profit / Craft | Margin |\n`;
    md += `|---|---|---|---|---|\n`;
    for (const arb of analysis.arbitrageOpportunities) {
      md += `| **${arb.recipeName}** | \$${arb.totalCost.toFixed(2)} | \$${arb.totalRevenue.toFixed(2)} | **+\$${arb.netProfitPerCraft.toFixed(2)}** | +${arb.profitMarginPct.toFixed(1)}% |\n`;
    }
    md += `\n`;
  }

  md += `## 🌾 Best Passive AFK Farms\n`;
  md += `These farms generate income 24/7 while your bot stays AFK in your base without touching any controls:\n\n`;
  md += `| Crop | Sell Price | Est. Profit / hr (100 blocks) | Strategy |\n`;
  md += `|---|---|---|---|\n`;
  for (const crop of analysis.passiveFarmRankings) {
    md += `| **${crop.crop}** | \$${crop.sellPrice.toFixed(2)} | \$${crop.estHourlyProfitPer100Plots.toFixed(2)}/hr | Build stacked zero-interaction auto farm |\n`;
  }
  md += `\n`;

  if (analysis.spawnerAnalysis.length > 0) {
    md += `## ⚡ Spawner Investment ROI\n`;
    md += `Ranking of spawners based on fastest break-even time:\n\n`;
    md += `| Spawner | Purchase Price | Drop Sells For | Hourly Revenue | Break-Even Time |\n`;
    md += `|---|---|---|---|---|\n`;
    for (const sp of analysis.spawnerAnalysis) {
      md += `| **${sp.mob}** | \$${sp.spawnerCost.toLocaleString()} | \$${sp.dropSellPrice.toFixed(2)} (${sp.dropName}) | \$${sp.hourlyRevenue.toFixed(2)}/hr | **${sp.hoursToBreakEven} hrs** |\n`;
    }
    md += `\n`;
  }

  if (aiResponse) {
    md += `## 🧠 Strategic AI Wealth Roadmap\n\n`;
    md += `${aiResponse}\n\n`;
  }

  return md;
}
