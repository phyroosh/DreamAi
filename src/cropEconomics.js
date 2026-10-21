/**
 * Crop & Inventory Economics Engine
 * 
 * Provides rigorously documented calculations for:
 * - Full-inventory sale values with item-specific max stack sizes
 * - Expected gross vs net crop harvest yields accounting for replanting retention
 * - Passive AFK farm hourly production, gross revenue, net profit, establishment costs, and payback periods
 */

// Stack sizes for non-64 stack items in Minecraft Java Edition
const SPECIAL_STACK_SIZES = {
  // Stacks of 16
  ender_pearl: 16,
  snowball: 16,
  egg: 16,
  honey_bottle: 16,
  bucket: 16,
  sign: 16,
  oak_sign: 16,
  spruce_sign: 16,
  birch_sign: 16,
  jungle_sign: 16,
  acacia_sign: 16,
  dark_oak_sign: 16,
  mangrove_sign: 16,
  cherry_sign: 16,
  bamboo_sign: 16,
  crimson_sign: 16,
  warped_sign: 16,
  hanging_sign: 16,
  banner: 16,
  armor_stand: 16,

  // Stacks of 1 (Unstackable)
  potion: 1,
  splash_potion: 1,
  lingering_potion: 1,
  water_bucket: 1,
  lava_bucket: 1,
  milk_bucket: 1,
  mushroom_stew: 1,
  rabbit_stew: 1,
  beetroot_soup: 1,
  suspicious_stew: 1,
  totem_of_undying: 1,
  shulker_box: 1,
  white_shulker_box: 1,
  orange_shulker_box: 1,
  magenta_shulker_box: 1,
  light_blue_shulker_box: 1,
  yellow_shulker_box: 1,
  lime_shulker_box: 1,
  pink_shulker_box: 1,
  gray_shulker_box: 1,
  light_gray_shulker_box: 1,
  cyan_shulker_box: 1,
  purple_shulker_box: 1,
  blue_shulker_box: 1,
  brown_shulker_box: 1,
  green_shulker_box: 1,
  red_shulker_box: 1,
  black_shulker_box: 1,
  minecart: 1,
  chest_minecart: 1,
  furnace_minecart: 1,
  tnt_minecart: 1,
  hopper_minecart: 1,
  boat: 1,
  oak_boat: 1,
  birch_boat: 1,
  spruce_boat: 1,
  jungle_boat: 1,
  acacia_boat: 1,
  dark_oak_boat: 1,
  mangrove_boat: 1,
  cherry_boat: 1,
  bamboo_raft: 1
};

/**
 * Returns the maximum stack size for a given item identifier
 */
export function getItemMaxStackSize(itemId = '') {
  const cleanId = String(itemId).toLowerCase().replace(/^minecraft:/, '').trim();

  // Check explicit table
  if (SPECIAL_STACK_SIZES[cleanId] !== undefined) {
    return SPECIAL_STACK_SIZES[cleanId];
  }

  // Check tools, weapons, and armor (unstackable)
  if (
    cleanId.endsWith('_sword') ||
    cleanId.endsWith('_pickaxe') ||
    cleanId.endsWith('_axe') ||
    cleanId.endsWith('_shovel') ||
    cleanId.endsWith('_hoe') ||
    cleanId.endsWith('_helmet') ||
    cleanId.endsWith('_chestplate') ||
    cleanId.endsWith('_leggings') ||
    cleanId.endsWith('_boots') ||
    cleanId === 'shield' ||
    cleanId === 'elytra' ||
    cleanId === 'bow' ||
    cleanId === 'crossbow' ||
    cleanId === 'trident' ||
    cleanId === 'shears' ||
    cleanId === 'fishing_rod' ||
    cleanId === 'flint_and_steel'
  ) {
    return 1;
  }

  // Check signs and banners
  if (cleanId.endsWith('_sign') || cleanId.endsWith('_banner')) {
    return 16;
  }

  // Default Java Edition stack size
  return 64;
}

/**
 * Calculates the exact sale value of a full player inventory of a specified item
 * 
 * Formula:
 * full_inventory_quantity = available_inventory_slots * maximum_stack_size
 * full_inventory_sale_value = full_inventory_quantity * player_sell_price
 * 
 * @param {Object} item Listing object or object with name & player_sell_price
 * @param {Object} [options={}] Configuration options (inventorySlots, customStackSize)
 * @returns {Object} Calculated inventory metrics
 */
export function calculateFullInventorySaleValue(item, options = {}) {
  const slots = typeof options.inventorySlots === 'number' && options.inventorySlots > 0 
    ? options.inventorySlots 
    : 36; // Default standard Java Edition inventory (9 hotbar + 27 main inventory)

  const itemName = item.canonical_id || item.name || '';
  const maxStackSize = typeof options.customStackSize === 'number' && options.customStackSize > 0
    ? options.customStackSize
    : getItemMaxStackSize(itemName);

  const sellPrice = typeof item.player_sell_price === 'number' 
    ? item.player_sell_price 
    : (typeof item.sellPrice === 'number' ? item.sellPrice : 0);

  const fullInventoryQuantity = slots * maxStackSize;
  const fullInventorySaleValue = Number((fullInventoryQuantity * sellPrice).toFixed(2));

  return {
    item_id: itemName,
    available_inventory_slots: slots,
    maximum_stack_size: maxStackSize,
    full_inventory_quantity: fullInventoryQuantity,
    player_sell_price: sellPrice,
    full_inventory_sale_value: fullInventorySaleValue
  };
}

/**
 * Crop drop mechanics data based on Minecraft Java Edition vanilla standards
 */
export const CROP_HARVEST_DATA = {
  wheat: {
    displayName: 'Wheat',
    seedName: 'wheat_seeds',
    seedDisplayName: 'Wheat Seeds',
    expectedGrossCropYield: 1.0,      // 1 mature wheat guaranteed
    replantingRetainedCrop: 0,        // Uses seed to replant, not crop
    replantingRetainedSeed: 1.0,      // 1 seed must be replanted
    expectedGrossSeedYield: 2.71,     // Average 1 + (3 * 0.57) = 2.71 seeds without Fortune
    expectedNetSellableCrop: 1.0,     // 1.0 wheat to sell
    expectedNetSellableSeed: 1.71,    // 2.71 - 1.0 replanted = 1.71 seeds to sell
    destructionType: 'break_and_replant'
  },
  potato: {
    displayName: 'Potato',
    seedName: 'potato',
    seedDisplayName: 'Potato (used as planting material)',
    expectedGrossCropYield: 2.5,      // 1-4 potatoes (average 2.5)
    replantingRetainedCrop: 1.0,      // 1 potato must be replanted
    replantingRetainedSeed: 0,
    expectedGrossSeedYield: 0,
    expectedNetSellableCrop: 1.5,     // 2.5 - 1.0 = 1.5 net potatoes
    expectedNetSellableSeed: 0,
    destructionType: 'break_and_replant'
  },
  carrot: {
    displayName: 'Carrot',
    seedName: 'carrot',
    seedDisplayName: 'Carrot (used as planting material)',
    expectedGrossCropYield: 3.0,      // 1-5 carrots (average 3.0)
    replantingRetainedCrop: 1.0,      // 1 carrot must be replanted
    replantingRetainedSeed: 0,
    expectedGrossSeedYield: 0,
    expectedNetSellableCrop: 2.0,     // 3.0 - 1.0 = 2.0 net carrots
    expectedNetSellableSeed: 0,
    destructionType: 'break_and_replant'
  },
  beetroot: {
    displayName: 'Beetroot',
    seedName: 'beetroot_seeds',
    seedDisplayName: 'Beetroot Seeds',
    expectedGrossCropYield: 1.0,      // 1 beetroot guaranteed
    replantingRetainedCrop: 0,
    replantingRetainedSeed: 1.0,      // 1 seed must be replanted
    expectedGrossSeedYield: 2.0,      // 1-4 seeds (average 2.0)
    expectedNetSellableCrop: 1.0,
    expectedNetSellableSeed: 1.0,     // 2.0 - 1.0 = 1.0 net seed
    destructionType: 'break_and_replant'
  },
  nether_wart: {
    displayName: 'Nether Wart',
    seedName: 'nether_wart',
    seedDisplayName: 'Nether Wart (used as planting material)',
    expectedGrossCropYield: 3.0,      // 2-4 nether wart (average 3.0)
    replantingRetainedCrop: 1.0,      // 1 wart must be replanted
    replantingRetainedSeed: 0,
    expectedGrossSeedYield: 0,
    expectedNetSellableCrop: 2.0,     // 3.0 - 1.0 = 2.0 net nether wart
    expectedNetSellableSeed: 0,
    destructionType: 'break_and_replant'
  }
};

/**
 * Calculates expected gross and net harvest revenues per crop block
 */
export function calculateExpectedHarvestRevenue(cropKey, cropSellPrice, seedSellPrice = null) {
  const cropData = CROP_HARVEST_DATA[cropKey];
  if (!cropData) return null;

  const cropPrice = typeof cropSellPrice === 'number' ? cropSellPrice : 0;
  const seedPrice = typeof seedSellPrice === 'number' ? seedSellPrice : 0;

  // Expected gross revenue = total items dropped * sale price
  const expectedGrossCropRevenue = cropData.expectedGrossCropYield * cropPrice;
  const expectedGrossSeedRevenue = cropData.expectedGrossSeedYield * seedPrice;
  const totalExpectedGrossRevenue = Number((expectedGrossCropRevenue + expectedGrossSeedRevenue).toFixed(4));

  // Expected net revenue = (gross drops - replanted items) * sale price
  const expectedNetCropRevenue = cropData.expectedNetSellableCrop * cropPrice;
  const expectedNetSeedRevenue = cropData.expectedNetSellableSeed * seedPrice;
  const totalExpectedNetRevenue = Number((expectedNetCropRevenue + expectedNetSeedRevenue).toFixed(4));

  return {
    crop: cropData.displayName,
    expected_gross_crop_yield: cropData.expectedGrossCropYield,
    expected_net_sellable_crop_yield: cropData.expectedNetSellableCrop,
    replanting_retention: cropData.replantingRetainedCrop > 0 
      ? `${cropData.replantingRetainedCrop} crop item retained for replanting`
      : `${cropData.replantingRetainedSeed} seed retained for replanting`,
    player_crop_sell_price: cropPrice,
    player_seed_sell_price: seedPrice > 0 ? seedPrice : null,
    expected_gross_revenue_per_block: totalExpectedGrossRevenue,
    expected_net_revenue_per_block: totalExpectedNetRevenue
  };
}

/**
 * Passive farm production parameters (Vanilla random tick rate = 3)
 */
export const PASSIVE_FARM_MODELS = {
  pumpkin: {
    displayName: 'Pumpkin Stem Farm',
    cropName: 'pumpkin',
    plantingMaterialName: 'pumpkin_seeds',
    plantingMaterialType: 'seed',
    // 100 stems with hydrated soil produce ~1.5 pumpkins/stem/hr theoretical max
    theoreticalRatePerPlantPerHour: 1.5,
    defaultCollectionEfficiency: 0.90, // 90% collection via hopper minecarts
    requiresReplanting: false,
    recurringCostPerHour: 0
  },
  melon_slice: {
    displayName: 'Melon Auto-Piston Farm (Slices)',
    cropName: 'melon_slice',
    plantingMaterialName: 'melon_seeds',
    plantingMaterialType: 'seed',
    // 1 melon block produces ~4.5 slices on piston break; 1.5 blocks/stem/hr * 4.5 = ~6.75 slices/stem/hr
    theoreticalRatePerPlantPerHour: 6.75,
    defaultCollectionEfficiency: 0.88,
    requiresReplanting: false,
    recurringCostPerHour: 0
  },
  bamboo: {
    displayName: 'Bamboo Flying Machine / Piston Farm',
    cropName: 'bamboo',
    plantingMaterialName: 'bamboo',
    plantingMaterialType: 'plant',
    // Bamboo grows rapidly, ~3 blocks/plant/hr
    theoreticalRatePerPlantPerHour: 3.0,
    defaultCollectionEfficiency: 0.92,
    requiresReplanting: false,
    recurringCostPerHour: 0
  },
  cactus: {
    displayName: 'Cactus Zero-Loss / Block-Break Farm',
    cropName: 'cactus',
    plantingMaterialName: 'cactus',
    plantingMaterialType: 'plant',
    // Cactus takes ~18 mins per block (~3.33/hr). ~15-20% destroyed on adjacent cactus blocks
    theoreticalRatePerPlantPerHour: 3.33,
    defaultCollectionEfficiency: 0.80,
    requiresReplanting: false,
    recurringCostPerHour: 0
  },
  sugar_cane: {
    displayName: 'Sugar Cane Observer Piston Farm',
    cropName: 'sugar_cane',
    plantingMaterialName: 'sugar_cane',
    plantingMaterialType: 'plant',
    // Sugar cane takes ~18 mins per block (~3.33/hr)
    theoreticalRatePerPlantPerHour: 3.33,
    defaultCollectionEfficiency: 0.88,
    requiresReplanting: false,
    recurringCostPerHour: 0
  },
  kelp: {
    displayName: 'Kelp Piston Farm',
    cropName: 'kelp',
    plantingMaterialName: 'kelp',
    plantingMaterialType: 'plant',
    // Kelp grows ~2.5 blocks/plant/hr
    theoreticalRatePerPlantPerHour: 2.5,
    defaultCollectionEfficiency: 0.90,
    requiresReplanting: false,
    recurringCostPerHour: 0
  }
};

/**
 * Calculates complete passive farm economics:
 * gross_revenue_per_hour = expected_sellable_items_per_hour * player_sell_price
 * net_profit_per_hour = gross_revenue_per_hour - recurring_operating_costs_per_hour
 */
export function calculatePassiveFarmEconomics(farmKey, playerSellPrice, plantingMaterialBuyPrice = null, options = {}) {
  const model = PASSIVE_FARM_MODELS[farmKey];
  if (!model) return null;

  const plantCount = typeof options.plantCount === 'number' && options.plantCount > 0 ? options.plantCount : 100;
  const collectionEfficiency = typeof options.collectionEfficiency === 'number' && options.collectionEfficiency > 0 
    ? options.collectionEfficiency 
    : model.defaultCollectionEfficiency;

  const sellPrice = typeof playerSellPrice === 'number' ? playerSellPrice : 0;
  const plantingCost = typeof plantingMaterialBuyPrice === 'number' ? plantingMaterialBuyPrice : null;

  // Production calculations
  const theoreticalTotalPerHour = plantCount * model.theoreticalRatePerPlantPerHour;
  const expectedCollectedPerHour = Number((theoreticalTotalPerHour * collectionEfficiency).toFixed(2));
  const estimatedLostPerHour = Number((theoreticalTotalPerHour * (1 - collectionEfficiency)).toFixed(2));

  // Revenue & Profit
  const grossRevenuePerHour = Number((expectedCollectedPerHour * sellPrice).toFixed(2));
  const recurringOperatingCostsPerHour = typeof options.recurringCostPerHour === 'number' 
    ? options.recurringCostPerHour 
    : model.recurringCostPerHour;
  const netProfitPerHour = Number((grossRevenuePerHour - recurringOperatingCostsPerHour).toFixed(2));

  // Establishment Capital & Payback Period
  const initialPlantingMaterialCost = plantingCost !== null ? Number((plantCount * plantingCost).toFixed(2)) : null;
  const paybackPeriodHours = (initialPlantingMaterialCost !== null && netProfitPerHour > 0)
    ? Number((initialPlantingMaterialCost / netProfitPerHour).toFixed(1))
    : null;

  return {
    farm_name: model.displayName,
    crop_name: model.cropName,
    plant_count: plantCount,
    theoretical_production_rate_per_hour: Number(theoreticalTotalPerHour.toFixed(2)),
    actual_measured_production_rate: options.measuredRatePerHour || null,
    collection_efficiency_pct: Number((collectionEfficiency * 100).toFixed(1)),
    estimated_collected_items_per_hour: expectedCollectedPerHour,
    estimated_items_lost_per_hour: estimatedLostPerHour,
    player_sell_price: sellPrice,
    gross_sales_revenue_per_hour: grossRevenuePerHour,
    recurring_operating_costs_per_hour: recurringOperatingCostsPerHour,
    net_profit_per_hour: netProfitPerHour,
    planting_material_name: model.plantingMaterialName,
    unit_planting_material_cost: plantingCost,
    initial_planting_capital: initialPlantingMaterialCost,
    payback_period_hours: paybackPeriodHours,
    confidence_level: options.measuredRatePerHour ? 'measured_in_game' : 'theoretical_estimate_unverified',
    assumptions: [
      `Random tick speed assumed at default 3`,
      `Farmland properly hydrated with adjacent water source blocks`,
      `Automated collection efficiency estimated at ${(collectionEfficiency * 100).toFixed(0)}%`,
      `Farm chunk remains loaded and active while bot is online`,
      `Stems/plants fully grown before measuring steady-state hourly harvest`
    ]
  };
}
