import nbt from 'prismarine-nbt';

/**
 * Recursively extracts plain text from Minecraft strings, JSON strings, or chat component objects
 */
export function extractRawText(obj) {
  if (obj === null || obj === undefined) return '';

  if (typeof obj === 'string') {
    const trimmed = obj.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        return extractRawText(parsed);
      } catch {
        // Not valid JSON, keep as raw string
      }
    }
    return obj;
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return String(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(extractRawText).filter(Boolean).join('');
  }

  if (typeof obj === 'object') {
    let result = '';
    if (obj.text) result += extractRawText(obj.text);
    if (obj.value) result += extractRawText(obj.value);
    if (obj.extra) result += extractRawText(obj.extra);
    if (obj.translate) {
      if (!String(obj.translate).startsWith('chat.type.')) {
        result += `[${obj.translate}] `;
      }
    }
    if (obj.with) result += extractRawText(obj.with);
    return result || '';
  }

  return '';
}

export const extractChatComponentText = extractRawText;

/**
 * Strips Minecraft formatting codes (§ and &) and normalizes whitespace
 */
export function stripFormatting(input) {
  if (input === null || input === undefined) return '';
  const rawText = extractRawText(input);
  return rawText
    .replace(/[§&][0-9a-fk-orA-FK-OR]/g, '') // Minecraft color & format codes
    .replace(/\u00A7[0-9a-fk-orA-FK-OR]/g, '')
    .trim();
}

/**
 * Extracts clean display name from an item across Minecraft 1.8 to 1.21.4+
 */
export function extractDisplayName(item) {
  if (!item) return '';

  // 1. Check customName getter / property
  if (item.customName) {
    const txt = stripFormatting(item.customName);
    if (txt) return txt;
  }

  // 2. Check 1.20.5+ / 1.21.4 componentMap
  if (item.componentMap?.has('custom_name')) {
    const txt = stripFormatting(item.componentMap.get('custom_name')?.data);
    if (txt) return txt;
  }
  if (item.componentMap?.has('item_name')) {
    const txt = stripFormatting(item.componentMap.get('item_name')?.data);
    if (txt) return txt;
  }

  // 3. Check components array
  if (Array.isArray(item.components)) {
    const nameComp = item.components.find(c => c && (c.type === 'custom_name' || c.name === 'custom_name' || c.type === 'minecraft:custom_name'));
    if (nameComp?.data) {
      const txt = stripFormatting(nameComp.data);
      if (txt) return txt;
    }
  }

  // 4. Fallback to NBT display Name
  if (item.nbt) {
    try {
      const simplified = nbt.simplify(item.nbt);
      if (simplified?.display?.Name) {
        const txt = stripFormatting(simplified.display.Name);
        if (txt) return txt;
      }
    } catch {}

    try {
      const rawName = item.nbt?.value?.display?.value?.Name?.value;
      if (rawName) {
        const txt = stripFormatting(rawName);
        if (txt) return txt;
      }
    } catch {}
  }

  return stripFormatting(item.displayName || item.name || '');
}

/**
 * Extracts lore array from an item across Minecraft 1.8 to 1.21.4+
 */
export function extractLore(item) {
  if (!item) return [];

  const rawLines = [];

  // 1. Direct customLore property if provided by prismarine-item
  if (item.customLore) {
    if (Array.isArray(item.customLore)) {
      rawLines.push(...item.customLore);
    } else {
      rawLines.push(item.customLore);
    }
  }

  // 2. Component map in 1.20.5+ / 1.21.4
  if (item.componentMap?.has('lore')) {
    const loreData = item.componentMap.get('lore')?.data;
    if (Array.isArray(loreData)) {
      rawLines.push(...loreData);
    } else if (loreData) {
      rawLines.push(loreData);
    }
  }

  // 3. Components array check
  if (Array.isArray(item.components)) {
    const loreComp = item.components.find(c => c && (c.type === 'lore' || c.name === 'lore' || c.type === 'minecraft:lore'));
    if (loreComp?.data) {
      if (Array.isArray(loreComp.data)) {
        rawLines.push(...loreComp.data);
      } else {
        rawLines.push(loreComp.data);
      }
    }
  }

  // 4. Extract from NBT compound
  if (item.nbt) {
    try {
      const simplified = nbt.simplify(item.nbt);
      const display = simplified?.display;
      if (display?.Lore && Array.isArray(display.Lore)) {
        rawLines.push(...display.Lore);
      }
    } catch {}

    try {
      const rawLore = item.nbt?.value?.display?.value?.Lore?.value?.value;
      if (Array.isArray(rawLore)) {
        rawLines.push(...rawLore);
      }
    } catch {}
  }

  // Strip formatting from every line and deduplicate
  const cleaned = [];
  const seen = new Set();
  for (const raw of rawLines) {
    const txt = stripFormatting(raw);
    if (txt && !seen.has(txt)) {
      seen.add(txt);
      cleaned.push(txt);
    }
  }

  return cleaned;
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
  let isTradeItem = false;

  // Clean all lines from colors and formatting codes
  const loreLines = (Array.isArray(rawLoreLines) ? rawLoreLines : [rawLoreLines])
    .map(l => stripFormatting(l))
    .filter(Boolean);

  const fullText = loreLines.join('\n');

  // Check if lore contains explicit trade/price indications
  const tradeIndications = /buy\s*price|sell\s*price|purchase\s*price|cannot be bought|cannot be sold|not for sale|not sellable|unsellable|unbuyable|not purchasable|(?:left|right)[\s\-]*click to (?:buy|sell)|shift\s*\+?\s*right\s*click to sell/i;
  if (tradeIndications.test(fullText)) {
    isTradeItem = true;
  }

  // Section tracking: 'buy', 'sell', 'usage', 'other'
  let currentSection = null;

  for (let i = 0; i < loreLines.length; i++) {
    const cleanLine = loreLines[i];
    const lower = cleanLine.toLowerCase();

    // Section header detection
    if (/^(?:buy|cost|purchase)(?:\s*price)?[:\-]?$/i.test(cleanLine.trim())) {
      currentSection = 'buy';
      isTradeItem = true;
      continue;
    }
    if (/^(?:sell|payout)(?:\s*price)?[:\-]?$/i.test(cleanLine.trim())) {
      currentSection = 'sell';
      isTradeItem = true;
      continue;
    }
    if (/^(?:usage|click|info|description|requirements|lore)[:\-]?$/i.test(cleanLine.trim())) {
      currentSection = 'other';
      continue;
    }

    // Check if line is within BUY section
    if (currentSection === 'buy') {
      if (/cannot be bought|not for sale|unbuyable|cannot buy|not purchasable|\bn\/?a\b|none|disabled/i.test(lower)) {
        buyPrice = null;
        canBuy = false;
        isTradeItem = true;
      } else {
        const match = cleanLine.match(/[$€£]\s*([0-9,]+(?:\.[0-9]+)?[km]?)/i) ||
                      cleanLine.match(/^[■•\-*\s]*[$€£]?\s*([0-9,]+(?:\.[0-9]+)?[km]?)/i);
        if (match) {
          const val = parsePriceValue(match[1]);
          if (val !== null) {
            buyPrice = val;
            canBuy = true;
            isTradeItem = true;
          }
        }
      }
      continue;
    }

    // Check if line is within SELL section
    if (currentSection === 'sell') {
      if (/cannot be sold|not sellable|unsellable|cannot sell|\bn\/?a\b|none|disabled|not for sale/i.test(lower)) {
        sellPrice = null;
        canSell = false;
        isTradeItem = true;
      } else {
        const match = cleanLine.match(/[$€£]\s*([0-9,]+(?:\.[0-9]+)?[km]?)/i) ||
                      cleanLine.match(/^[■•\-*\s]*[$€£]?\s*([0-9,]+(?:\.[0-9]+)?[km]?)/i);
        if (match) {
          const val = parsePriceValue(match[1]);
          if (val !== null) {
            sellPrice = val;
            canSell = true;
            isTradeItem = true;
          }
        }
      }
      continue;
    }

    // Single-line or Inline Buy checks (e.g. "Buy: $10.00", "Buy: Cannot be bought", "Buy 64x: $640")
    if (lower.includes('buy') || lower.includes('cost') || lower.includes('purchase')) {
      isTradeItem = true;
      if (/cannot be bought|not for sale|unbuyable|cannot buy|not purchasable|\bn\/?a\b|none|disabled/i.test(lower)) {
        buyPrice = null;
        canBuy = false;
      } else {
        // Same-line buy 64x pattern: "Buy 64x: $640" or "Buy 64 for: $640"
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
          // Standard single item buy on same line: "Buy: $10.00", "Buy 1: $10", "Buy Price: $10"
          const singleMatch = cleanLine.match(/(?:buy|cost|purchase)(?:\s*(?:price|1x|1|each|per\s*item))?\s*[:\-]?\s*[$€£]?\s*([0-9,]+(?:\.[0-9]+)?[km]?)/i);
          if (singleMatch) {
            const val = parsePriceValue(singleMatch[1]);
            if (val !== null) {
              buyPrice = val;
              canBuy = true;
            }
          }
        }

        // Multi-line peek if same line didn't contain price and wasn't explicit unbuyable
        if (buyPrice === null && i + 1 < loreLines.length) {
          const nextLine = loreLines[i + 1];
          if (!/^(?:sell|usage|click|lore|description)/i.test(nextLine)) {
            if (/cannot be bought|not for sale|unbuyable|cannot buy|\bn\/?a\b/i.test(nextLine)) {
              buyPrice = null;
              canBuy = false;
            } else {
              const nextMatch = nextLine.match(/[$€£]\s*([0-9,]+(?:\.[0-9]+)?[km]?)/i) ||
                                nextLine.match(/^[■•\-*\s]*[$€£]?\s*([0-9,]+(?:\.[0-9]+)?[km]?)/i);
              if (nextMatch) {
                const val = parsePriceValue(nextMatch[1]);
                if (val !== null) {
                  buyPrice = val;
                  canBuy = true;
                }
              }
            }
          }
        }
      }
    }

    // Single-line or Inline Sell checks (e.g. "Sell: $2.50", "Sell: Cannot be sold", "Sell 64x: $160")
    if (lower.includes('sell') || lower.includes('payout')) {
      isTradeItem = true;
      if (/cannot be sold|not sellable|unsellable|cannot sell|\bn\/?a\b|none|disabled|not for sale/i.test(lower)) {
        sellPrice = null;
        canSell = false;
      } else {
        // Same-line sell 64x pattern: "Sell 64x: $160" or "Sell 64 for: $160"
        const stackMatch = cleanLine.match(/sell\s*(?:for\s*)?(\d+)[x\s]+(?:for|:)?\s*[$€£]?\s*([0-9,]+(?:\.[0-9]+)?[km]?)/i);
        if (stackMatch) {
          const qty = parseInt(stackMatch[1], 10);
          const total = parsePriceValue(stackMatch[2]);
          if (qty > 0 && total !== null) {
            sellPrice = total / qty;
            canSell = true;
          }
        } else {
          // Standard single item sell on same line: "Sell: $2.50", "Sell 1: $2.50", "Sell Price: $2.50"
          const singleMatch = cleanLine.match(/(?:sell|payout)(?:\s*(?:price|1x|1|each|per\s*item))?\s*[:\-]?\s*[$€£]?\s*([0-9,]+(?:\.[0-9]+)?[km]?)/i);
          if (singleMatch) {
            const val = parsePriceValue(singleMatch[1]);
            if (val !== null) {
              sellPrice = val;
              canSell = true;
            }
          }
        }

        // Multi-line peek if same line didn't contain price
        if (sellPrice === null && i + 1 < loreLines.length) {
          const nextLine = loreLines[i + 1];
          if (!/^(?:buy|usage|click|lore|description)/i.test(nextLine)) {
            if (/cannot be sold|not sellable|unsellable|cannot sell|\bn\/?a\b/i.test(nextLine)) {
              sellPrice = null;
              canSell = false;
            } else {
              const nextMatch = nextLine.match(/[$€£]\s*([0-9,]+(?:\.[0-9]+)?[km]?)/i) ||
                                nextLine.match(/^[■•\-*\s]*[$€£]?\s*([0-9,]+(?:\.[0-9]+)?[km]?)/i);
              if (nextMatch) {
                const val = parsePriceValue(nextMatch[1]);
                if (val !== null) {
                  sellPrice = val;
                  canSell = true;
                }
              }
            }
          }
        }
      }
    }

    // Standalone unbuyable / unsellable phrases
    if (/cannot be sold|not sellable|unsellable|cannot sell/i.test(lower)) {
      sellPrice = null;
      canSell = false;
      isTradeItem = true;
    }
    if (/cannot be bought|not for sale|unbuyable|cannot buy|not purchasable/i.test(lower)) {
      // If line only mentions bought/buy/purchasable
      if (!lower.includes('sold') && !lower.includes('sell')) {
        buyPrice = null;
        canBuy = false;
        isTradeItem = true;
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
        isTradeItem = true;
      }
    }
  }

  if (canBuy || canSell) {
    isTradeItem = true;
  }

  return {
    buyPrice,
    sellPrice,
    canBuy,
    canSell,
    unit,
    isTradeItem
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

  // 3. Check for shop item prices and trade indicators
  const priceInfo = parsePricesFromLore(lore, displayName);
  if (priceInfo.canBuy || priceInfo.canSell || priceInfo.isTradeItem) {
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
  // In root shop menu, any item that is not a filler or navigation is a category!
  const isCategoryIndicator =
    loreText.includes('click to') ||
    loreText.includes('view') ||
    loreText.includes('browse') ||
    loreText.includes('category') ||
    loreText.includes('section') ||
    loreText.includes('open') ||
    lore.length > 0 ||
    (!lowerName.includes('glass') && displayName && displayName !== ' ');

  return {
    type: isCategoryIndicator ? 'category' : 'unknown',
    slot: slotIndex,
    id: item.type,
    name,
    displayName,
    lore
  };
}
