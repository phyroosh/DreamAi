/**
 * Real-Time Web Search for DreamAi
 * Fetches live web results from DuckDuckGo and Wikipedia without requiring API keys.
 */

/**
 * Checks if a message looks like a question or search that benefits from real-time web info.
 */
export function isWebQuery(message) {
  if (!message || typeof message !== 'string') return false;
  const lower = message.trim().toLowerCase();

  // Minecraft specific action commands don't need web search
  const mcActions = ['walk', 'jump', 'look', 'swing', 'eat', 'drop', 'tp', 'home', 'spawn', 'crouch', 'sneak'];
  if (mcActions.some(action => lower.includes(action)) && lower.length < 35) {
    return false;
  }

  // Pure arithmetic doesn't need web search
  if (/^[0-9+\-*/().,%\s\w]+$/.test(lower) && /[+\-*/^%]/.test(lower) && !/[a-z]{4,}/.test(lower)) {
    return false;
  }

  // Search keywords
  const searchTriggers = [
    'search', 'google', 'browse', 'internet', 'who is', 'who won', 'who was',
    'what is the capital', 'what happened', 'latest news', 'current', 'weather in',
    'release date', 'when was', 'when did', 'history of', 'how many people',
    'population of', 'tell me about', 'wikipedia', 'define', 'meaning of'
  ];

  if (searchTriggers.some(trigger => lower.includes(trigger))) {
    return true;
  }

  // General questions ending with '?' that have substantive query words
  if (lower.includes('?') && lower.length > 15) {
    return true;
  }

  return false;
}

/**
 * Cleans the user's message to extract a concise search query
 */
export function extractSearchQuery(rawMessage) {
  let q = rawMessage
    .replace(/\b(?:hey|hi|hello|dream|gpt|bot|ai|please|can you|tell me|search for|search|google|look up|what is|whats|who is)\b/gi, ' ')
    .replace(/[?!,.:;()"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return q || rawMessage.trim();
}

/**
 * Searches DuckDuckGo HTML
 */
async function searchDuckDuckGo(query) {
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 3500);

    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    clearTimeout(timeout);

    if (!res.ok) return [];

    const html = await res.text();
    const snippets = [];
    const regex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let match;

    while ((match = regex.exec(html)) !== null && snippets.length < 3) {
      const text = match[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
      if (text && text.length > 20) {
        snippets.push(text);
      }
    }
    return snippets;
  } catch (err) {
    return [];
  }
}

/**
 * Searches Wikipedia API
 */
async function searchWikipedia(query) {
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 3000);

    const res = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'DreamAiMinecraftBot/1.0 (contact: phyroosh@github.com)' }
    });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const data = await res.json();
    const list = data.query?.search || [];

    return list.slice(0, 2).map(item => {
      const cleanSnippet = (item.snippet || '')
        .replace(/<[^>]+>/g, '')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, '&')
        .trim();
      return `${item.title}: ${cleanSnippet}`;
    }).filter(s => s.length > 20);
  } catch (err) {
    return [];
  }
}

/**
 * Executes a multi-source live web search and returns formatted context
 */
export async function searchWeb(rawQuery) {
  const query = extractSearchQuery(rawQuery);
  if (!query || query.length < 3) return null;

  try {
    const [ddgResults, wikiResults] = await Promise.all([
      searchDuckDuckGo(query),
      searchWikipedia(query)
    ]);

    const combined = [...ddgResults, ...wikiResults];
    if (combined.length === 0) return null;

    // Deduplicate and take top 3
    const unique = [];
    const seen = new Set();
    for (const s of combined) {
      const key = s.slice(0, 40).toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(s);
      }
      if (unique.length >= 3) break;
    }

    return unique.map(u => `- ${u}`).join('\n');
  } catch (err) {
    return null;
  }
}
