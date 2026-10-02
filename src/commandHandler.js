export class ActionExecutor {
  constructor(botManager) {
    this.botManager = botManager;
  }

  /**
   * Executes a list of server slash commands (e.g. /tpaccept, /spawn)
   */
  async executeCommands(commands, sender) {
    const bot = this.botManager.bot;
    if (!bot || !commands || commands.length === 0) return;

    for (const cmd of commands) {
      const cleanCmd = cmd.trim();
      if (!cleanCmd) continue;
      
      // Ensure leading slash for server commands
      const formatted = cleanCmd.startsWith('/') ? cleanCmd : `/${cleanCmd}`;
      bot.chat(formatted);
      
      this.botManager.emit('log', { type: 'action', text: `[Command Executed] "${formatted}" ordered by ${sender}` });
      this.botManager.emit('chat', {
        sender: bot.username,
        text: formatted,
        time: new Date().toLocaleTimeString(),
        isMe: true
      });
    }
  }

  /**
   * Executes a list of physical bot actions (e.g. jump, look_at_player, swing_arm)
   */
  async executeActions(actions, sender) {
    const bot = this.botManager.bot;
    if (!bot || !actions || actions.length === 0) return;

    for (const action of actions) {
      switch (action.toLowerCase()) {
        case 'jump':
          bot.setControlState('jump', true);
          setTimeout(() => {
            if (this.botManager.bot) this.botManager.bot.setControlState('jump', false);
          }, 350);
          this.botManager.emit('log', { type: 'action', text: `[Action] Jumped on order from ${sender}` });
          break;

        case 'look_at_player':
        case 'look':
          this.lookAtPlayer(sender);
          break;

        case 'swing_arm':
        case 'swing':
          bot.swingArm('right');
          this.botManager.emit('log', { type: 'action', text: `[Action] Swung arm on order from ${sender}` });
          break;

        case 'sneak':
        case 'crouch':
          bot.setControlState('sneak', true);
          setTimeout(() => {
            if (this.botManager.bot) this.botManager.bot.setControlState('sneak', false);
          }, 1500);
          this.botManager.emit('log', { type: 'action', text: `[Action] Sneaked on order from ${sender}` });
          break;

        case 'drop_item':
        case 'drop':
          this.dropItems(false, sender);
          break;

        case 'drop_all':
          this.dropItems(true, sender);
          break;

        default:
          console.log(`Unknown action: ${action}`);
      }
    }
  }

  lookAtPlayer(sender) {
    const bot = this.botManager.bot;
    if (!bot) return;

    const player = Object.values(bot.players).find(
      p => p.username && p.username.toLowerCase() === sender.toLowerCase()
    );
    
    if (player && player.entity) {
      const targetPos = player.entity.position.offset(0, 1.6, 0);
      bot.lookAt(targetPos, true);
      this.botManager.emit('log', { type: 'action', text: `[Action] Turned to look at ${sender}` });
    } else {
      this.botManager.emit('log', { type: 'warn', text: `[Action] Player ${sender} is not within line of sight.` });
    }
  }

  async dropItems(dropAll, sender) {
    const bot = this.botManager.bot;
    if (!bot) return;

    try {
      if (dropAll) {
        const items = bot.inventory.items();
        for (const item of items) {
          await bot.tossStack(item);
        }
        this.botManager.emit('log', { type: 'action', text: `[Action] Dropped all inventory items for ${sender}` });
      } else {
        const held = bot.heldItem;
        if (held) {
          await bot.tossStack(held);
          this.botManager.emit('log', { type: 'action', text: `[Action] Dropped held item for ${sender}` });
        } else {
          const first = bot.inventory.items()[0];
          if (first) {
            await bot.tossStack(first);
            this.botManager.emit('log', { type: 'action', text: `[Action] Tossed an item for ${sender}` });
          }
        }
      }
    } catch (err) {
      console.warn('Drop action error:', err.message);
    }
  }
}
