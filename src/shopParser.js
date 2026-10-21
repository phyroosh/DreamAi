import nbt from 'prismarine-nbt';

/**
 * Strips Minecraft formatting codes (§ and &) and normalizes whitespace
 */
export function stripFormatting(text) {
  if (!text) return '';
  if (typeof text !== 'string') text = String(text);
  
  // Try parsing JSON chat component if formatted as JSON
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text);
      text = extractChatComponentText(parsed);
    } catch {
      // Not JSON, continue with normal string
    }
  }

  return text
    .replace(/[§&][0-9a-fk-orA-FK-OR]/g, '') // Minecraft color & format codes
    .replace(/\u00A7[0-9a-fk-orA-FK-OR]/g, '')
    .trim();
}

/**
 * Recursively extracts plain text from Minecraft JSON text components
 */
export function extractChatComponentText(component) {
  if (!component) return '';
  if (typeof component === 'string') return component;
  if (typeof component === 'number') return String(component);

  let result = component.text || '';
  if (Array.isArray(component.extra)) {
    for (const extra of component.extra) {
      result += extractChatComponentText(extra);
    }
  }
  return result;
}

/**
 * Extracts lore array from a prismarine-item
 */
export function extractLore(item) {
  if (!item) return [];

  // 1. Direct customLore property if provided by prismarine-item
  if (item.customLore) {
    if (Array.isArray(item.customLore)) {
      return item.customLore.map(line => stripFormatting(line)).filter(Boolean);
    }
    if (typeof item.customLore === 'string') {
      return [stripFormatting(item.customLore)].filter(Boolean);
    }
  }

  // 2. Extract from NBT compound
  if (item.nbt) {
    try {
      const simplified = nbt.simplify(item.nbt);
      const display = simplified?.display;
      if (display?.Lore && Array.isArray(display.Lore)) {
        return display.Lore.map(line => stripFormatting(line)).filter(Boolean);
      }
    } catch {
      // Fallback to checking raw nbt if simplify fails
    }

    try {
      const rawLore = item.nbt?.value?.display?.value?.Lore?.value?.value;
      if (Array.isArray(rawLore)) {
        return rawLore.map(line => stripFormatting(line)).filter(Boolean);
      }
    } catch {
      // ignore
    }
  }

  return [];
}

/**
 * Extracts clean display name from an item
 */
export function extractDisplayName(item) {
  if (!item) return '';

  if (item.customName) {
    return stripFormatting(item.customName);
  }

  if (item.nbt) {
    try {
      const simplified = nbt.simplify(item.nbt);
      if (simplified?.display?.Name) {
        return stripFormatting(simplified.display.Name);
      }
    } catch {
      // ignore
    }
  }

  return stripFormatting(item.displayName || item.name || '');
}

/**
 * Parses numeric price from a string snippet (e.g. "$1,250.50", "500 Coins", "1.5k")
 */
function parsePriceValue(str) {
  if (!str) return null;
  const clean = str.replace(/[$,€£]/g, '').trim().toLowerCase();

  // Multiplier abbreviations (k, m)
  if (clean.endsWith('k')) {
    const val = parseFloat(clean.slice(0, -1).replace(/,/g, ''));
    return Number.isFinite(val) ? val * 1000 : null;
  }
  if (clean.endsWith('m')) {
    const val = parseFloat(clean.slice(0, -1).replace(/,/g, ''));
    return Number.isFinite(val) ? val * 1000000 : null;
  }

  const val = parseFloat(clean.replace(/,/g, ''));
  return Number.isFinite(val) ? val : null;
}

/**
 * Parses buy and sell prices from lore lines
 */
export function parsePricesFromLore(rawLoreLines = [], displayName = '') {
  let buyPrice = null;
  let sellPrice = null;
  let canBuy = false;
  let canSell = false;
  let unit = 1;

  // Clean all lines from colors and formatting codes
  const loreLines = (Array.isArray(rawLoreLines) ? rawLoreLines : [rawLoreLines])
    .map(l => stripFormatting(l))
    .filter(Boolean);

  const fullText = loreLines.join('\n');

  // Check for unsellable indicators
  const isUnsellable = /cannot be sold|not sellable|unsellable|cannot sell/i.test(fullText);
  // Check for unbuyable indicators
  const isUnbuyable = /cannot be bought|not for sale|unbuyable|cannot buy/i.test(fullText);

  for (const cleanLine of loreLines) {
    const lower = cleanLine.toLowerCase();

    // 1. Check Buy Price Patterns
    // Examples: "Buy: $15.00", "Buy 1 for $10", "Buy 1x: $10", "Price: $50", "Cost: $50"
    if (!isUnbuyable && (lower.includes('buy') || lower.includes('cost') || lower.includes('purchase'))) {
      // Buy 64x pattern: "Buy 64x: $640" or "Buy 64 for: $640"
      const stackMatch = cleanLine.match(/buy\s*(?:for\s*)?(\d+)[x\s]+(?:for|:)?\s*[$€£]?\s*([0-9,]+(?:\.[0-9]+)?[km]?)/i);
      if (stackMatch) {
        const qty = parseInt(stackMatch[1], 10);
        const total = parsePriceValue(stackMatch[2]);
        if (qty > 0 && total !== null) {
          buyPrice = total / qty;
          canBuy = true;
          unit = 1;
        }
      } else {
        // Standard single item buy: "Buy: $10.00", "Buy 1: $10", "Buy Price: $10"
        const singleMatch = cleanLine.match(/(?:buy|cost|purchase)(?:\s*(?:price|1x|1|each|per\s*item))?\s*[:\-]?\s*[$€£]?\s*([0-9,]+(?:\.[0-9]+)?[km]?)/i);
        if (singleMatch) {
          const val = parsePriceValue(singleMatch[1]);
          if (val !== null && buyPrice === null) {
            buyPrice = val;
            canBuy = true;
          }
        }
      }
    }

    // 2. Check Sell Price Patterns
    // Examples: "Sell: $2.50", "Sell 1 for $3", "Sell 1x: $3", "Payout: $2.50"
    if (!isUnsellable && (lower.includes('sell') || lower.includes('payout'))) {
      // Sell 64x pattern: "Sell 64x: $160" or "Sell 64 for: $160"
      const stackMatch = cleanLine.match(/sell\s*(?:for\s*)?(\d+)[x\s]+(?:for|:)?\s*[$€£]?\s*([0-9,]+(?:\.[0-9]+)?[km]?)/i);
      if (stackMatch) {
        const qty = parseInt(stackMatch[1], 10);
        const total = parsePriceValue(stackMatch[2]);
        if (qty > 0 && total !== null) {
          sellPrice = total / qty;
          canSell = true;
        }
      } else {
        // Standard single item sell: "Sell: $2.50", "Sell 1: $2.50", "Sell Price: $2.50"
        const singleMatch = cleanLine.match(/(?:sell|payout)(?:\s*(?:price|1x|1|each|per\s*item))?\s*[:\-]?\s*[$€£]?\s*([0-9,]+(?:\.[0-9]+)?[km]?)/i);
        if (singleMatch) {
          const val = parsePriceValue(singleMatch[1]);
          if (val !== null && sellPrice === null) {
            sellPrice = val;
            canSell = true;
          }
        }
      }
    }
  }

  // Fallback for simple "Price: $X" if no explicit buy/sell label was found
  if (buyPrice === null && sellPrice === null) {
    const genericMatch = fullText.match(/price\s*[:\-]?\s*[$€£]?\s*([0-9,]+(?:\.[0-9]+)?[km]?)/i);
    if (genericMatch) {
      const val = parsePriceValue(genericMatch[1]);
      if (val !== null) {
        buyPrice = val;
        canBuy = true;
      }
    }
  }

  if (isUnsellable) {
    sellPrice = null;
    canSell = false;
  }
  if (isUnbuyable) {
    buyPrice = null;
    canBuy = false;
  }

  return {
    buyPrice,
    sellPrice,
    canBuy,
    canSell,
    unit
  };
}

/**
 * Classifies an item in a chest window
 */
export function classifyItem(item, slotIndex, windowTitle = '') {
  if (!item) {
    return { type: 'empty', slot: slotIndex };
  }

  const displayName = extractDisplayName(item);
  const lore = extractLore(item);
  const name = item.name || '';
  const lowerName = name.toLowerCase();
  const lowerDisplay = displayName.toLowerCase();
  const loreText = lore.join(' ').toLowerCase();

  // 1. Check for decorative fillers (e.g. Stained glass pane with blank name or title)
  if (lowerName.includes('stained_glass_pane') || lowerName.includes('glass_pane')) {
    if (!displayName || displayName === ' ' || !lore.length) {
      return { type: 'filler', slot: slotIndex, name, displayName };
    }
  }

  // 2. Check for navigation controls
  // Back / Return Button
  if (
    lowerDisplay.includes('back') ||
    lowerDisplay.includes('return') ||
    lowerDisplay.includes('previous menu') ||
    lowerDisplay.includes('main menu') ||
    (lowerName === 'barrier' && (lowerDisplay.includes('close') || lowerDisplay.includes('back'))) ||
    (lowerName.includes('door') && lowerDisplay.includes('back')) ||
    (lowerName.includes('bed') && lowerDisplay.includes('back'))
  ) {
    return {
      type: 'navigation',
      action: 'back',
      slot: slotIndex,
      name,
      displayName,
      lore
    };
  }

  // Next Page Button
  if (
    lowerDisplay.includes('next page') ||
    lowerDisplay.includes('next') ||
    lowerDisplay.includes('forward') ||
    (lowerName === 'arrow' && (lowerDisplay.includes('next') || lowerDisplay.includes('page')))
  ) {
    return {
      type: 'navigation',
      action: 'next_page',
      slot: slotIndex,
      name,
      displayName,
      lore
    };
  }

  // Previous Page Button
  if (
    lowerDisplay.includes('previous page') ||
    lowerDisplay.includes('prev page') ||
    (lowerName === 'arrow' && (lowerDisplay.includes('prev') || lowerDisplay.includes('previous')))
  ) {
    return {
      type: 'navigation',
      action: 'prev_page',
      slot: slotIndex,
      name,
      displayName,
      lore
    };
  }

  // Close Button
  if (lowerDisplay.includes('close') || lowerDisplay.includes('exit')) {
    return {
      type: 'navigation',
      action: 'close',
      slot: slotIndex,
      name,
      displayName,
      lore
    };
  }

  // 3. Check for shop item prices
  const priceInfo = parsePricesFromLore(lore, displayName);
  if (priceInfo.canBuy || priceInfo.canSell) {
    return {
      type: 'shop_item',
      slot: slotIndex,
      id: item.type,
      name,
      displayName,
      lore,
      ...priceInfo
    };
  }

  // 4. Check for Category folder (clicking opens category items)
  // Usually in root shop, items like "Farming", "Blocks", "Ores" have lore like "Click to view", "Browse items"
  const isCategoryIndicator =
    loreText.includes('click to') ||
    loreText.includes('view') ||
    loreText.includes('browse') ||
    loreText.includes('category') ||
    loreText.includes('section') ||
    loreText.includes('open') ||
    lore.length > 0;

  return {
    type: isCategoryIndicator ? 'category' : 'unknown',
    slot: slotIndex,
    id: item.type,
    name,
    displayName,
    lore
  };
}
