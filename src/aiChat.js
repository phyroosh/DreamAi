import dotenv from 'dotenv';

dotenv.config();

export class AiChatHandler {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.NVIDIA_API_KEY || '';
    this.model = options.model || process.env.NVIDIA_MODEL || 'meta/llama-3.2-11b-vision-instruct';
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
   * 1. Asked by player named 'Phyroosh' (case-insensitive)
   * 2. Message mentions 'GPT' or 'Dream' (case-insensitive)
   */
  shouldRespond(sender, message) {
    if (!sender || !message) return false;
    if (!this.apiKey) return false;

    const cleanSender = sender.trim().toLowerCase();
    const cleanMsg = message.trim().toLowerCase();

    const isTargetPlayer = cleanSender === this.targetUser;
    const hasTriggerWord = this.triggerWords.some(word => cleanMsg.includes(word));

    return isTargetPlayer && hasTriggerWord;
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
   * Queries NVIDIA NIM LLM with ambient chat log and world state, returning natural speech + actions
   */
  async getReply(senderName, userMessage, contextInfo = '', recentChatLog = '') {
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

      const systemPrompt = `You are an intelligent, friendly, completely natural Minecraft companion in-game replying to your master player Phyroosh. You answer to the names GPT and Dream.

NO FIXED TEMPLATES:
- Speak naturally, casually, and cheerfully like an active player friend on a Minecraft server.
- NEVER use repetitive robotic formulas or canned phrases. Vary your wording naturally every time.
- Keep your speech concise and strictly UNDER 140 CHARACTERS so it cleanly fits on one line in Minecraft chat. No linebreaks, no quotes, no markdown/asterisks.

ACTION & COMMAND TAGS:
Attach these tags to your message whenever Phyroosh requests an in-game action or server command. The bot engine will automatically execute them in the game world:
- [EXEC:/command] : Execute any Minecraft server command. Examples:
  * When Phyroosh asks you to accept a teleport/tpa: [EXEC:/tpaccept]
  * When Phyroosh asks you to deny a teleport: [EXEC:/tpdeny]
  * When Phyroosh asks you to teleport to him: [EXEC:/tpa Phyroosh]
  * When Phyroosh asks you to go to spawn: [EXEC:/spawn]
  * When Phyroosh asks you to go home: [EXEC:/home]
  * Any other command: [EXEC:/command]
- [ACTION:jump] : Jump in the air.
- [ACTION:look_at_player] : Turn your head directly toward Phyroosh.
- [ACTION:swing_arm] : Punch or swing your hand.
- [ACTION:sneak] : Crouch or sneak.
- [ACTION:drop_item] : Drop your held item.
- [ACTION:drop_all] : Drop all your inventory items.

EXAMPLES OF NATURAL BEHAVIOR:
- Phyroosh: "Dream accept my tpa" -> "[EXEC:/tpaccept] On it, bringing you over!"
- Phyroosh: "GPT where are you?" -> "I'm right around 142, 65, -200 in the Overworld."
- Phyroosh: "Dream jump and look at me" -> "[ACTION:look_at_player] [ACTION:jump] Boing! Right here beside you."
- Phyroosh: "GPT what happened in chat?" -> (Consult RECENT SERVER CHAT LOG below and answer naturally).

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

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.7,
          max_tokens: 75
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      let rawReply = data.choices?.[0]?.message?.content?.trim() || '';

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
      let speech = rawReply.replace(/[\r\n]+/g, ' ').replace(/["`*]/g, '').trim();
      // Collapse multiple spaces
      speech = speech.replace(/\s+/g, ' ');

      if (speech.length > 180) {
        speech = speech.substring(0, 177) + '...';
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
