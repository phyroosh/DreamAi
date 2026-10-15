import dotenv from 'dotenv';
import { analyzeMathInMessage, processCalcTags } from './mathEngine.js';
import { isWebQuery, searchWeb } from './webSearch.js';

dotenv.config();

const MODEL_FALLBACKS = [
  'nvidia/nemotron-3-super-120b-a12b',
  'nvidia/nemotron-3-ultra-550b-a55b',
  'meta/llama-3.2-11b-vision-instruct'
];

export class AiChatHandler {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.NVIDIA_API_KEY || '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';
    // Upgrade default to the 120B Super Reasoning model
    this.model = options.model || process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-super-120b-a12b';
    this.targetUser = (options.targetUser || process.env.AI_TARGET_USER || 'Phyroosh').trim().toLowerCase();
    
    // Support multiple trigger keywords (e.g. GPT and Dream)
    const rawTriggers = options.triggerWords || process.env.AI_TRIGGER_WORDS || process.env.AI_TRIGGER_WORD || 'GPT,Dream';
    this.triggerWords = Array.isArray(rawTriggers) 
      ? rawTriggers.map(w => w.trim().toLowerCase()) 
      : rawTriggers.split(',').map(w => w.trim().toLowerCase()).filter(Boolean);

    this.apiUrl = 'https://integrate.api.nvidia.com/v1/chat/completions';
    
    // Conversation history with target player (last 6 turns)
    this.history = [];
    this.isProcessing = false;
    this.recentProcessed = new Set();
  }

  /**
   * Strictly verifies both conditions:
   * 1. Asked by player named 'Phyroosh' or allowed user (case-insensitive)
   * 2. Message mentions 'GPT' or 'Dream' (case-insensitive)
   */
  shouldRespond(sender, message, permittedUsers = []) {
    if (!sender || !message) return false;
    if (!this.apiKey) return false;

    const lowerSender = sender.toLowerCase().trim();
    const isPermitted = permittedUsers.some(u => {
      const p = String(u).trim().toLowerCase();
      return p === lowerSender || lowerSender.includes(p) || p.includes(lowerSender);
    });
    if (!isPermitted) return false;

    const cleanMsg = message.trim().toLowerCase();
    const hasTriggerWord = this.triggerWords.some(word => cleanMsg.includes(word));

    return hasTriggerWord;
  }

  /**
   * Attempts to parse sender and message from diverse Minecraft chat formatting
   */
  parseSenderAndMessage(rawText) {
    if (!rawText) return null;
    const clean = rawText.trim();

    // Pattern 1: Standard vanilla <Username> Message
    const vanillaMatch = clean.match(/^<([a-zA-Z0-9_]{3,16})>\s*(.+)$/);
    if (vanillaMatch) {
      return { sender: vanillaMatch[1], message: vanillaMatch[2] };
    }

    // Pattern 2: [Rank/Prefix] Username: Message or Username: Message
    const colonMatch = clean.match(/^(?:\[[^\]]+\]\s*)?([a-zA-Z0-9_]{3,16})\s*:\s*(.+)$/);
    if (colonMatch) {
      return { sender: colonMatch[1], message: colonMatch[2] };
    }

    // Pattern 3: Custom arrows e.g. Username » Message or Username > Message
    const arrowMatch = clean.match(/^(?:\[[^\]]+\]\s*)?([a-zA-Z0-9_]{3,16})\s*[»>]\s*(.+)$/);
    if (arrowMatch) {
      return { sender: arrowMatch[1], message: arrowMatch[2] };
    }

    // Pattern 4: Whispers: Username whispers to you: Message
    const whisperMatch = clean.match(/^([a-zA-Z0-9_]{3,16})\s*(?:whispers to you|tells you|whispers):?\s*(.+)$/i);
    if (whisperMatch) {
      return { sender: whisperMatch[1], message: whisperMatch[2] };
    }

    return null;
  }

  /**
   * Queries NVIDIA NIM LLM with verified Math Engine, live Internet Search, and ambient awareness
   */
  async getReply(senderName, userMessage, contextInfo = '', recentChatLog = '', onLog = null) {
    if (this.isProcessing) {
      return null;
    }

    const dedupKey = `${senderName}:${userMessage}`;
    if (this.recentProcessed.has(dedupKey)) {
      return null;
    }
    this.recentProcessed.add(dedupKey);
    setTimeout(() => this.recentProcessed.delete(dedupKey), 6000);

    this.isProcessing = true;

    try {
      this.history.push({
        role: 'user',
        content: userMessage
      });

      if (this.history.length > 6) {
        this.history = this.history.slice(-6);
      }

      const cleanSender = String(senderName).trim();
      const effectiveMaster = cleanSender.toLowerCase() === 'harshu' ? 'Phyroosh' : cleanSender;

      // 1. Math Analysis: Compute exact verified numbers
      let mathInsight = null;
      try {
        mathInsight = analyzeMathInMessage(userMessage);
        if (mathInsight && onLog) {
          onLog({ type: 'action', text: `[Math Engine] Verified calculation for "${userMessage}"` });
        }
      } catch (e) {}

      // 2. Real-Time Web Search: Fetch live internet knowledge
      let webInsight = null;
      try {
        if (isWebQuery(userMessage)) {
          if (onLog) {
            onLog({ type: 'system', text: `[Web Search] Searching internet for: "${userMessage}"...` });
          }
          webInsight = await searchWeb(userMessage);
          if (webInsight && onLog) {
            onLog({ type: 'action', text: `[Web Search] Retrieved live internet facts!` });
          }
        }
      } catch (e) {}

      let capabilitiesContext = '';
      if (mathInsight) {
        capabilitiesContext += `\n\n📐 VERIFIED MATHEMATICAL GROUND TRUTH (USE THESE EXACT NUMBERS):\n${mathInsight}`;
      }
      if (webInsight) {
        capabilitiesContext += `\n\n🌐 LIVE REAL-TIME INTERNET SEARCH RESULTS:\n${webInsight}`;
      }

    const systemPrompt = `You are an ultra-intelligent, friendly, and natural Minecraft companion in-game replying to your master player ${effectiveMaster}. You answer to the names GPT and Dream.

CRITICAL IDENTITY RULES:
- Your master's real player name is "${effectiveMaster}".
- "harshu" is ONLY a team name, NOT a person! NEVER call your master "harshu". Always address them as "${effectiveMaster}"!

MATHEMATICAL & SCIENTIFIC PRECISION:
- When calculating math, state the verified values directly and concisely.
- For expressions like 2log2, explain the base clearly: "If base 10, 2log₁₀(2) ≈ 0.602; if base 2, it equals 2; if natural log, ≈ 1.386."
- Never invent confusing formulas like 2^(log2(2)).

REAL-TIME INTERNET ACCESS:
- You have real-time internet search access. Use the provided search results to answer current events, facts, questions, and trivia with 100% accuracy.

WORLD SEED & STRUCTURE COORDINATES (CHUNKBASE):
- If the master asks where to find a structure (Village, Stronghold, Mansion, Ancient City, etc.) or biome, check if the "World Seed" is provided in the bot context.
- If the seed is known, use your deep knowledge of Minecraft world generation to give rough estimates (e.g. Strongholds generate in rings starting at ~1500 blocks away).
- ALWAYS generate a direct Chunkbase link so they can see the exact map: "https://www.chunkbase.com/apps/seed-map#<SEED>"
- Clearly state that you are giving an estimate based on the seed, and they should check the Chunkbase link for exact pinpoint coordinates.

NO FIXED TEMPLATES:
- Speak naturally, casually, and cheerfully like an active player friend on a Minecraft server.
- NEVER use repetitive robotic formulas. Vary your wording naturally every time.
- Keep your speech concise and strictly UNDER 180 CHARACTERS so it cleanly fits in Minecraft chat. No linebreaks, no quotes, no markdown/LaTeX formatting.

STRICT RULES ON COMMANDS & SPEECH:
- NEVER use /tellraw, /title, /me, /say, or admin broadcast commands! You are a normal player without OP permissions!
- When explaining things (math, questions, advice, lore), ALWAYS speak directly in plain text!
- ONLY use [EXEC:/command] when the master explicitly asks for a player command like /tpa, /tpaccept, /spawn, /home, etc.

ACTION & COMMAND TAGS:
Attach these tags to your message whenever ${effectiveMaster} requests an in-game action or server command:
- [EXEC:/command] : Execute any Minecraft server command (e.g. [EXEC:/tpaccept], [EXEC:/tpa ${effectiveMaster}], [EXEC:/spawn])
- [ACTION:walk] : Walk and roam around the chamber / room.
- [ACTION:eat] : Eat food from inventory to restore hunger.
- [ACTION:jump] : Jump in the air.
- [ACTION:look_at_player] : Turn your head directly toward ${effectiveMaster}.
- [ACTION:swing_arm] : Punch or swing your hand.
- [ACTION:sneak] : Crouch or sneak.
- [ACTION:drop_item] : Drop your held item.
- [ACTION:drop_all] : Drop all your inventory items.
- [ACTION:lobby_select] : Right-click lobby item (Nether Star) and click the Grass Block in Server Selector to teleport to the SMP world.
${capabilitiesContext}

RECENT SERVER CHAT LOG:
${recentChatLog || '(No recent chat recorded yet)'}

CURRENT BOT REALITY:
${contextInfo || 'Status: Active and in world'}`;

      const messages = [
        {
          role: 'system',
          content: systemPrompt
        },
        ...this.history
      ];

      // Try candidates in order with automatic fallback
      const candidateModels = [this.model, ...MODEL_FALLBACKS.filter(m => m !== this.model)];
      let data = null;
      let usedModel = this.model;

      for (const candidateModel of candidateModels) {
        try {
          const ctrl = new AbortController();
          const timeout = setTimeout(() => ctrl.abort(), 12000);

          const response = await fetch(this.apiUrl, {
            method: 'POST',
            signal: ctrl.signal,
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: candidateModel,
              messages,
              temperature: 0.2,
              max_tokens: 800
            })
          });
          clearTimeout(timeout);

          if (response.ok) {
            data = await response.json();
            usedModel = candidateModel;
            break;
          }
        } catch (err) {
          // Attempt next fallback model
        }
      }

      if (!data) {
        throw new Error('All model attempts failed or timed out');
      }

      let rawReply = data.choices?.[0]?.message?.content?.trim() || '';

      // If reasoning model left content empty, extract conclusion from reasoning_content
      if (!rawReply && data.choices?.[0]?.message?.reasoning_content) {
        const reasoning = data.choices[0].message.reasoning_content;
        const sentences = reasoning.split(/[.\n]/).filter(s => s.trim().length > 5);
        if (sentences.length > 0) {
          rawReply = sentences[sentences.length - 1].trim();
        }
      }

      // Process any [CALC: ...] tags
      rawReply = processCalcTags(rawReply);

      // Extract all [EXEC:/...] commands
      const commands = [];
      const execMatches = rawReply.matchAll(/\[EXEC:(\/[^\]]+)\]/gi);
      for (const m of execMatches) {
        commands.push(m[1].trim());
      }
      rawReply = rawReply.replace(/\[EXEC:\/[^\]]+\]/gi, '');

      // Extract all [ACTION:...] actions
      const actions = [];
      const actionMatches = rawReply.matchAll(/\[ACTION:([a-zA-Z0-9_]+)\]/gi);
      for (const m of actionMatches) {
        actions.push(m[1].trim());
      }
      rawReply = rawReply.replace(/\[ACTION:[a-zA-Z0-9_]+\]/gi, '');

      // Clean speech text
      let speech = rawReply
        .replace(/[\r\n]+/g, ' ')
        .replace(/[\\$"*`]/g, '')
        .trim();
      speech = speech.replace(/\s+/g, ' ');

      if (speech.length > 210) {
        speech = speech.substring(0, 207) + '...';
      }

      this.history.push({
        role: 'assistant',
        content: speech
      });

      return { text: speech, commands, actions };
    } catch (err) {
      console.error('[AI Chat] Error querying NVIDIA API:', err.message);
      return null;
    } finally {
      this.isProcessing = false;
    }
  }
}
