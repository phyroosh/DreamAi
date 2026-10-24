// Remote backend connection support for Bot-Hosting.net or custom VPS
const savedBackend = (localStorage.getItem('dreamai_backend_url') || '').trim();
const socket = savedBackend ? io(savedBackend) : io();

// DOM
const elStatus = document.getElementById('status-pill');
const btnDisconnect = document.getElementById('btn-disconnect');
const panelTelemetry = document.getElementById('panel-telemetry');

const inpBackendUrl = document.getElementById('inp-backend-url');
const btnSaveBackend = document.getElementById('btn-save-backend');
const btnResetBackend = document.getElementById('btn-reset-backend');

if (inpBackendUrl) {
  inpBackendUrl.value = savedBackend;
}
if (btnSaveBackend) {
  btnSaveBackend.onclick = () => {
    const val = (inpBackendUrl?.value || '').trim();
    if (val) {
      localStorage.setItem('dreamai_backend_url', val);
    } else {
      localStorage.removeItem('dreamai_backend_url');
    }
    window.location.reload();
  };
}
if (btnResetBackend) {
  btnResetBackend.onclick = () => {
    localStorage.removeItem('dreamai_backend_url');
    window.location.reload();
  };
}

const valHealth = document.getElementById('val-health');
const valFood = document.getElementById('val-food');
const valPos = document.getElementById('val-pos');
const valUptime = document.getElementById('val-uptime');
const valXp = document.getElementById('val-xp');
const valWeather = document.getElementById('val-weather');
const valTime = document.getElementById('val-time');
const valGamemode = document.getElementById('val-gamemode');

const panelServerInfo = document.getElementById('panel-serverinfo');
const infoIp = document.getElementById('info-ip');
const infoVer = document.getElementById('info-ver');
const infoBrand = document.getElementById('info-brand');
const infoDim = document.getElementById('info-dim');
const infoDiff = document.getElementById('info-diff');
const inpSeed = document.getElementById('inp-seed');
const btnSaveSeed = document.getElementById('btn-save-seed');

const panelInventory = document.getElementById('panel-inventory');
const invArmor = document.getElementById('inv-armor');
const invItems = document.getElementById('inv-items');
const btnOpenInvSidebar = document.getElementById('btn-open-inv-sidebar');

// Manual Control Deck
const manualControlDeck = document.getElementById('manual-control-deck');
const btnLeftClick = document.getElementById('btn-left-click');
const btnHoldLeft = document.getElementById('btn-hold-left');
const labelHoldLeft = document.getElementById('label-hold-left');
const btnRightClick = document.getElementById('btn-right-click');
const btnHoldRight = document.getElementById('btn-hold-right');
const labelHoldRight = document.getElementById('label-hold-right');
const btnEatFood = document.getElementById('btn-eat-food');
const btnDropHeld = document.getElementById('btn-drop-held');
const btnOpenInventory = document.getElementById('btn-open-inventory');
const hotbarActiveName = document.getElementById('hotbar-active-name');
const hotbarStrip = document.getElementById('hotbar-strip');

// D-Pad & Movement Controls
const dpadContainer = document.getElementById('dpad-container');
const moveButtons = document.querySelectorAll('[data-move]');
const inpAfterLoginCmd = document.getElementById('inp-after-login-cmd');
const btnSaveBotCmd = document.getElementById('btn-save-bot-cmd');
const chatQuickActions = document.getElementById('chat-quick-actions');

// Quick Commands & Manager
const quickCmdList = document.getElementById('quick-cmd-list');
const btnManageQuickCmds = document.getElementById('btn-manage-quick-cmds');
const modalQuickCommands = document.getElementById('modal-quick-commands');
const btnCloseQuickCmds = document.getElementById('btn-close-quick-cmds');
const btnDoneQuickCmds = document.getElementById('btn-done-quick-cmds');
const formQuickCmd = document.getElementById('form-quick-cmd');
const inpQcId = document.getElementById('inp-qc-id');
const inpQcCmd = document.getElementById('inp-qc-cmd');
const inpQcLabel = document.getElementById('inp-qc-label');
const selQcColor = document.getElementById('sel-qc-color');
const qcFormTitle = document.getElementById('qc-form-title');
const btnSaveQc = document.getElementById('btn-save-qc');
const btnCancelQcEdit = document.getElementById('btn-cancel-qc-edit');
const btnResetQuickCmds = document.getElementById('btn-reset-quick-cmds');
const quickCmdsManageList = document.getElementById('quick-cmds-manage-list');
const countQuickCmds = document.getElementById('count-quick-cmds');

let currentQuickCommands = [];

// Full Inventory Modal
const modalInventory = document.getElementById('modal-inventory');
const btnCloseInventory = document.getElementById('btn-close-inventory');
const mcMainGrid = document.getElementById('mc-main-grid');
const mcHotbarGrid = document.getElementById('mc-hotbar-grid');
const invSelectedText = document.getElementById('inv-selected-text');
const btnSlotEquip = document.getElementById('btn-slot-equip');
const btnSlotConsume = document.getElementById('btn-slot-consume');
const btnSlotDrop1 = document.getElementById('btn-slot-drop1');
const btnSlotDropAll = document.getElementById('btn-slot-dropall');
const btnSlotDeselect = document.getElementById('btn-slot-deselect');

let currentInventory = null;
let selectedSlot = null;
let isHoldingRightClick = false;
let isHoldingLeftClick = false;

const panelPlayers = document.getElementById('panel-players');
const listPlayers = document.getElementById('list-players');
const badgePlayers = document.getElementById('badge-players');

const formConnect = document.getElementById('form-connect');
const inpHost = document.getElementById('inp-host');
const inpPort = document.getElementById('inp-port');
const inpUser = document.getElementById('inp-username');
const inpPass = document.getElementById('inp-password');
const inpVersion = document.getElementById('inp-version');
const inpAutoLogin = document.getElementById('inp-autologin');

const btnBookmark = document.getElementById('btn-bookmark');
const serverList = document.getElementById('saved-servers-list');

const terminal = document.getElementById('terminal');
const formChat = document.getElementById('form-chat');
const inpChat = document.getElementById('inp-chat');
const tabs = document.querySelectorAll('.tab');
const btnClear = document.getElementById('btn-clear');

const modalSettings = document.getElementById('modal-settings');
const btnSettings = document.getElementById('btn-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');

const chkAntiAfk = document.getElementById('chk-antiafk');
const afkOpts = document.getElementById('antiafk-options');
const chkWalk = document.getElementById('chk-walk');
const chkAutoEat = document.getElementById('chk-autoeat');
const chkAutoJoin = document.getElementById('chk-autojoin');
const chkSwing = document.getElementById('chk-swing');
const chkLook = document.getElementById('chk-look');
const chkJump = document.getElementById('chk-jump');
const chkSneak = document.getElementById('chk-sneak');
const chkStep = document.getElementById('chk-step');
const inpInterval = document.getElementById('inp-interval');
const valInterval = document.getElementById('val-interval');
const inpViewDistance = document.getElementById('inp-viewdistance');
const valViewDistance = document.getElementById('val-viewdistance');
const selAiModel = document.getElementById('sel-aimodel');
const inpPermittedUsers = document.getElementById('inp-permitted-users');
const btnSaveUsers = document.getElementById('btn-save-users');
const saveIndicator = document.getElementById('save-indicator');
const afkSaveIndicator = document.getElementById('afk-save-indicator');
const modalAllowedUsers = document.getElementById('modal-allowed-users');

const homeAllowedUsers = document.getElementById('home-allowed-users');
const formHomeUser = document.getElementById('form-home-user');
const inpHomeUser = document.getElementById('inp-home-user');

let currentFilter = 'all';
let uptimeSec = 0;
let uptimeInterval = null;

// Multi-bot pool state & DOM elements
let activeBots = [];
let activeBotId = null;

const botTabsContainer = document.getElementById('bot-tabs-container');
const btnAddBotModal = document.getElementById('btn-add-bot-modal');
const btnConnectAll = document.getElementById('btn-connect-all');
const btnDisconnectAll = document.getElementById('btn-disconnect-all');

const modalAddBot = document.getElementById('modal-add-bot');
const btnCloseAddBot = document.getElementById('btn-close-add-bot');
const btnCancelAddBot = document.getElementById('btn-cancel-add-bot');
const formAddBot = document.getElementById('form-add-bot');
const inpAddUsername = document.getElementById('inp-add-username');
const inpAddHost = document.getElementById('inp-add-host');
const inpAddPort = document.getElementById('inp-add-port');
const inpAddPassword = document.getElementById('inp-add-password');
const inpAddVersion = document.getElementById('inp-add-version');

function getBotDotClass(state, isReconnecting) {
  if (isReconnecting || ['INITIALIZING', 'CONNECTING', 'RECONNECTING'].includes(state)) {
    return 'transitioning';
  }
  if (['JOINED', 'WAITING_FOR_TPA', 'ACCEPTING_TPA', 'VERIFYING_TELEPORT', 'AFK', 'SPAWNED'].includes(state)) {
    return 'online';
  }
  if (state === 'ERROR') {
    return 'error';
  }
  return 'offline';
}

function renderBotTabs() {
  if (!botTabsContainer) return;
  botTabsContainer.innerHTML = '';

  if (!activeBots || activeBots.length === 0) {
    botTabsContainer.innerHTML = '<span style="font-size:11px; color:var(--text-muted);">No bots configured</span>';
    return;
  }

  activeBots.forEach((bot) => {
    const isCur = bot.id === activeBotId;
    const tab = document.createElement('div');
    tab.className = `bot-tab ${isCur ? 'active' : ''}`;
    tab.dataset.botId = bot.id;

    const dotClass = getBotDotClass(bot.state, bot.isReconnecting);

    tab.innerHTML = `
      <span class="bot-status-dot ${dotClass}" title="${bot.state}"></span>
      <span class="bot-tab-name">${bot.name || bot.username}</span>
      ${activeBots.length > 1 ? `<span class="bot-tab-delete" title="Remove bot from pool">✕</span>` : ''}
    `;

    // Click tab to focus bot
    tab.onclick = (e) => {
      if (e.target.classList.contains('bot-tab-delete')) return;
      selectActiveBot(bot.id);
    };

    // Delete bot
    const delBtn = tab.querySelector('.bot-tab-delete');
    if (delBtn) {
      delBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm(`Remove bot "${bot.name || bot.username}" from the pool?`)) {
          fetch(`/api/bots/${bot.id}`, { method: 'DELETE' })
            .then(res => res.json())
            .then(data => {
              if (data.bots) {
                activeBots = data.bots;
                if (activeBotId === bot.id) {
                  activeBotId = activeBots[0]?.id || null;
                }
                renderBotTabs();
              }
            })
            .catch(err => console.error('Failed to remove bot:', err));
        }
      };
    }

    botTabsContainer.appendChild(tab);
  });
}

function selectActiveBot(botId) {
  if (!botId) return;
  activeBotId = botId;
  socket.emit('bots:set_active', botId);
  renderBotTabs();

  // Populate quick connect form with selected bot info
  const targetBot = activeBots.find(b => b.id === botId);
  if (targetBot) {
    if (inpUser) inpUser.value = targetBot.username || targetBot.name || 'Aaswaam';
    if (targetBot.server) {
      if (inpHost && targetBot.server.host) inpHost.value = targetBot.server.host;
      if (inpPort && targetBot.server.port) inpPort.value = targetBot.server.port;
    }
    if (inpAfterLoginCmd) {
      inpAfterLoginCmd.value = targetBot.afterLoginCommand || '/home 1';
    }
  }

  // Fetch status and inventory for the newly selected bot
  fetch(`/api/bots/${botId}/status`)
    .then(r => r.json())
    .then(st => {
      if (st && st.state) updateStatusUI(st);
    })
    .catch(() => {});

  fetch(`/api/bots/${botId}/inventory`)
    .then(r => r.json())
    .then(inv => {
      if (inv) updateInventoryUI(inv);
    })
    .catch(() => {});
}

// Helpers
const fmtTime = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;

const appendLog = (senderTag, text, type, category = 'system', customTime = null, botName = null) => {
  const row = document.createElement('div');
  row.className = `log-row`;
  row.dataset.type = category;
  
  if (currentFilter !== 'all' && currentFilter !== category) row.style.display = 'none';

  const time = customTime || new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });
  
  let tagClass = 't-sys';
  if (type === 'chat') tagClass = 't-chat';
  if (type === 'player') tagClass = 't-player';
  if (type === 'bot') tagClass = 't-bot';
  if (type === 'action') tagClass = 't-act';
  if (type === 'error' || type === 'warn') tagClass = 't-err';

  const botBadge = botName ? `<span class="bot-badge-tag ${botName.toLowerCase().includes('monalisa') ? 'monalisa' : ''}">[${botName}]</span>` : '';

  row.innerHTML = `
    <span class="log-time">[${time}]</span>
    ${botBadge}
    <span class="log-tag ${tagClass}">${senderTag}</span>
    <span class="log-msg">${text}</span>
  `;
  terminal.appendChild(row);
  terminal.scrollTop = terminal.scrollHeight;
};

// Allowed Users UI Renderer
function renderAllowedUsers(users = []) {
  const guestList = (users || []).filter(u => u && u.toLowerCase() !== 'phyrooss' && u.toLowerCase() !== 'phyroosh');

  // 1. Render on Home Page Sidebar
  if (homeAllowedUsers) {
    if (guestList.length === 0) {
      homeAllowedUsers.innerHTML = `<div class="empty-text">No guest users added.<br>Only <strong>phyrooss</strong> has permission.</div>`;
    } else {
      homeAllowedUsers.innerHTML = '';
      guestList.forEach(u => {
        const item = document.createElement('div');
        item.className = 'user-list-item';
        item.innerHTML = `
          <div class="user-item-info">
            <span class="user-item-icon">👤</span>
            <span class="user-item-name">${u}</span>
          </div>
          <button class="btn-del-user" data-user="${u}" title="Remove permission">🗑️</button>
        `;
        homeAllowedUsers.appendChild(item);
      });
    }
  }

  // 2. Render inside Settings Modal
  if (modalAllowedUsers) {
    if (guestList.length === 0) {
      modalAllowedUsers.innerHTML = `<span style="font-size:11px; color:var(--text-muted);">None (only phyrooss has permission)</span>`;
    } else {
      modalAllowedUsers.innerHTML = '';
      guestList.forEach(u => {
        const chip = document.createElement('div');
        chip.className = 'user-chip';
        chip.innerHTML = `
          <span>${u}</span>
          <button class="chip-del" data-user="${u}" title="Remove">✕</button>
        `;
        modalAllowedUsers.appendChild(chip);
      });
    }
  }
}

// Settings Modal
btnSettings.onclick = () => modalSettings.showModal();
btnCloseSettings.onclick = () => modalSettings.close();

const syncSettings = () => {
  if (afkOpts) {
    afkOpts.style.opacity = chkAntiAfk.checked ? '1' : '0.5';
    afkOpts.style.pointerEvents = chkAntiAfk.checked ? 'auto' : 'none';
  }
  
  const hasAnyMovement = !!(
    (chkWalk && chkWalk.checked) ||
    chkSwing.checked ||
    chkLook.checked ||
    chkJump.checked ||
    (chkStep && chkStep.checked) ||
    chkSneak.checked
  );

  const payload = {
    aiModel: selAiModel ? selAiModel.value : 'nvidia/nemotron-3-super-120b-a12b',
    antiAfkEnabled: chkAntiAfk.checked,
    antiAfkMode: hasAnyMovement ? 'active' : 'still',
    antiAfkIntervalSec: parseInt(inpInterval.value) || 8,
    viewDistance: inpViewDistance ? parseInt(inpViewDistance.value, 10) || 32 : 32,
    autoEat: chkAutoEat ? chkAutoEat.checked : true,
    autoJoinSmp: chkAutoJoin ? chkAutoJoin.checked : true,
    antiAfkActions: {
      walkAround: chkWalk ? chkWalk.checked : true,
      swingArm: chkSwing.checked,
      lookAround: chkLook.checked,
      jump: chkJump.checked,
      microStep: chkStep ? chkStep.checked : false,
      sneak: chkSneak.checked
    }
  };

  socket.emit('settings:update', payload);

  fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(() => {});

  const showIndicator = (el) => {
    if (!el) return;
    el.style.opacity = '1';
    clearTimeout(el._timeout);
    el._timeout = setTimeout(() => { el.style.opacity = '0'; }, 1500);
  };

  showIndicator(afkSaveIndicator);
  showIndicator(saveIndicator);
};

if (selAiModel) selAiModel.onchange = syncSettings;
chkAntiAfk.onchange = syncSettings;
if (chkWalk) chkWalk.onchange = syncSettings;
if (chkAutoEat) chkAutoEat.onchange = syncSettings;
if (chkAutoJoin) chkAutoJoin.onchange = syncSettings;
chkSwing.onchange = syncSettings;
chkLook.onchange = syncSettings;
if (chkStep) chkStep.onchange = syncSettings;
chkJump.onchange = syncSettings;
chkSneak.onchange = syncSettings;
inpInterval.oninput = () => { valInterval.textContent = inpInterval.value; };
inpInterval.onchange = syncSettings;
if (inpViewDistance) {
  inpViewDistance.oninput = () => {
    if (valViewDistance) valViewDistance.textContent = inpViewDistance.value;
  };
  inpViewDistance.onchange = syncSettings;
}

// Handle Adding Users from Home Page Form
if (formHomeUser) {
  formHomeUser.onsubmit = (e) => {
    e.preventDefault();
    const val = inpHomeUser.value.trim();
    if (!val) return;
    socket.emit('permitted:add', val);
    inpHomeUser.value = '';
  };
}

// Handle Adding Users from Settings Modal
if (btnSaveUsers) {
  btnSaveUsers.onclick = (e) => {
    e.preventDefault();
    const val = inpPermittedUsers.value.trim();
    if (val) {
      socket.emit('permitted:add', val);
      inpPermittedUsers.value = '';
    }
    saveIndicator.style.opacity = '1';
    setTimeout(() => { saveIndicator.style.opacity = '0'; }, 2000);
  };
}

if (inpPermittedUsers) {
  inpPermittedUsers.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnSaveUsers.click();
    }
  });
}

// Handle Deleting Users (Delegated to document for home list & modal chips)
document.addEventListener('click', (e) => {
  const delBtn = e.target.closest('.btn-del-user') || e.target.closest('.chip-del');
  if (delBtn) {
    const user = delBtn.dataset.user;
    if (user) {
      socket.emit('permitted:remove', user);
    }
  }
});

// Item Emoji mapper
function getItemEmoji(name = '') {
  const n = (name || '').toLowerCase();
  if (n.includes('sword') || n.includes('axe') || n.includes('trident') || n.includes('mace')) return '⚔️';
  if (n.includes('bow') || n.includes('arrow')) return '🏹';
  if (n.includes('shield')) return '🛡️';
  if (n.includes('helmet') || n.includes('cap')) return '🪖';
  if (n.includes('chestplate') || n.includes('tunic')) return '👕';
  if (n.includes('leggings') || n.includes('pants')) return '👖';
  if (n.includes('boots') || n.includes('shoes')) return '👢';
  if (n.includes('pickaxe') || n.includes('shovel') || n.includes('hoe')) return '⛏️';
  if (n.includes('golden_apple') || n.includes('gapple')) return '🍏';
  if (n.includes('beef') || n.includes('pork') || n.includes('mutton') || n.includes('steak') || n.includes('meat') || n.includes('chicken') || n.includes('fish') || n.includes('bread') || n.includes('apple') || n.includes('carrot') || n.includes('potato') || n.includes('cookie') || n.includes('melon') || n.includes('pie') || n.includes('stew') || n.includes('berry')) return '🍖';
  if (n.includes('potion')) return '🧪';
  if (n.includes('totem')) return '🪬';
  if (n.includes('diamond')) return '💎';
  if (n.includes('emerald')) return '❇️';
  if (n.includes('gold') || n.includes('ingot')) return '🪙';
  if (n.includes('nether_star') || n.includes('star')) return '⭐';
  if (n.includes('ender_pearl') || n.includes('eye_of_ender')) return '🔮';
  if (n.includes('block') || n.includes('stone') || n.includes('dirt') || n.includes('cobble') || n.includes('plank') || n.includes('wood') || n.includes('log') || n.includes('sand')) return '🧱';
  return '📦';
}

function getItemForSlot(slotNum) {
  if (!currentInventory) return null;
  const s = parseInt(slotNum, 10);
  if (s === 5) return currentInventory.armor?.helmet || null;
  if (s === 6) return currentInventory.armor?.chestplate || null;
  if (s === 7) return currentInventory.armor?.leggings || null;
  if (s === 8) return currentInventory.armor?.boots || null;
  if (s === 45) return currentInventory.offhand || null;
  if (s >= 36 && s <= 44) {
    return currentInventory.hotbar?.[s - 36]?.item || null;
  }
  if (s >= 9 && s <= 35) {
    const found = currentInventory.main?.find(m => m.slot === s);
    if (found) return found.item;
  }
  return currentInventory.items?.find(i => i.slot === s) || null;
}

function renderHotbarStrip() {
  if (!hotbarStrip) return;
  if (!currentInventory || !currentInventory.hotbar) {
    hotbarStrip.innerHTML = '';
    return;
  }

  const activeIdx = Number(currentInventory.quickBarSlot) || 0;
  let html = '';
  for (let i = 0; i < 9; i++) {
    const slotNum = 36 + i;
    const slotObj = currentInventory.hotbar[i];
    const item = slotObj?.item;
    const isActive = i === activeIdx;
    const title = item ? `${item.displayName || item.name} (x${item.count}) [Slot ${i+1}]` : `Slot ${i+1} (Empty Hand)`;
    const label = item ? `${getItemEmoji(item.name)} ${item.displayName || item.name}` : '—';
    const countBadge = item && item.count > 1 ? `<span class="slot-count-badge">${item.count}</span>` : '';

    html += `
      <div class="hotbar-slot-box ${isActive ? 'active' : ''}" data-hotbar-index="${i}" data-slot="${slotNum}" title="${title}">
        <span class="slot-num-badge">${i + 1}</span>
        <span class="slot-item-label">${label}</span>
        ${countBadge}
      </div>
    `;
  }
  hotbarStrip.innerHTML = html;

    hotbarStrip.querySelectorAll('.hotbar-slot-box').forEach(el => {
    el.onclick = () => {
      const idx = parseInt(el.dataset.hotbarIndex, 10);
      socket.emit('bot:set_hotbar', { botId: activeBotId, slot: idx });
    };
  });

  const activeItem = currentInventory.hotbar[activeIdx]?.item;
  if (hotbarActiveName) {
    hotbarActiveName.textContent = activeItem
      ? `Slot ${activeIdx + 1}: ${activeItem.displayName || activeItem.name} (x${activeItem.count})`
      : `Slot ${activeIdx + 1}: Empty (Hand)`;
  }
}

function updateSlotActions() {
  if (!invSelectedText) return;
  if (selectedSlot === null) {
    invSelectedText.textContent = 'None (Click a slot to select, swap, or manage)';
    if (btnSlotEquip) btnSlotEquip.disabled = true;
    if (btnSlotConsume) btnSlotConsume.disabled = true;
    if (btnSlotDrop1) btnSlotDrop1.disabled = true;
    if (btnSlotDropAll) btnSlotDropAll.disabled = true;
    if (btnSlotDeselect) btnSlotDeselect.disabled = true;
  } else {
    const item = getItemForSlot(selectedSlot);
    if (item) {
      invSelectedText.textContent = `Slot ${selectedSlot}: ${item.displayName || item.name} (x${item.count})`;
      if (btnSlotEquip) btnSlotEquip.disabled = false;
      if (btnSlotConsume) btnSlotConsume.disabled = false;
      if (btnSlotDrop1) btnSlotDrop1.disabled = false;
      if (btnSlotDropAll) btnSlotDropAll.disabled = false;
    } else {
      invSelectedText.textContent = `Slot ${selectedSlot}: Empty (Click another slot to move items here)`;
      if (btnSlotEquip) btnSlotEquip.disabled = true;
      if (btnSlotConsume) btnSlotConsume.disabled = true;
      if (btnSlotDrop1) btnSlotDrop1.disabled = true;
      if (btnSlotDropAll) btnSlotDropAll.disabled = true;
    }
    if (btnSlotDeselect) btnSlotDeselect.disabled = false;
  }
}

function onSlotClicked(slotNum) {
  const s = parseInt(slotNum, 10);
  if (selectedSlot === null) {
    selectedSlot = s;
    renderFullInventoryModal();
    updateSlotActions();
  } else if (selectedSlot === s) {
    selectedSlot = null;
    renderFullInventoryModal();
    updateSlotActions();
  } else {
    // Swap items between selectedSlot and target s
    const src = selectedSlot;
    const dst = s;
    selectedSlot = null;
    socket.emit('bot:inventory_action', {
      botId: activeBotId,
      action: 'swap',
      sourceSlot: src,
      destSlot: dst
    });
    renderFullInventoryModal();
    updateSlotActions();
  }
}

function renderFullInventoryModal() {
  if (!modalInventory) return;

  // 1. Armor & Offhand
  [5, 6, 7, 8, 45].forEach(s => {
    const el = document.querySelector(`.mc-slot[data-slot="${s}"]`);
    if (!el) return;
    const item = getItemForSlot(s);
    const isSelected = selectedSlot === s;
    el.className = `mc-slot ${s === 45 ? 'offhand-slot-box' : 'armor-slot-box'} ${isSelected ? 'selected' : ''}`;
    if (item) {
      el.innerHTML = `
        <span class="mc-slot-num">${s}</span>
        <div class="mc-slot-content">
          <span class="mc-slot-icon">${getItemEmoji(item.name)}</span>
          <span class="mc-slot-name-label">${item.displayName || item.name}</span>
        </div>
        ${item.count > 1 ? `<span class="mc-slot-count">${item.count}</span>` : ''}
      `;
    } else {
      const placeholders = { 5: '🪖', 6: '👕', 7: '👖', 8: '👢', 45: '🛡️' };
      el.innerHTML = `<span class="mc-slot-num">${s}</span><span class="mc-slot-empty">${placeholders[s]}</span>`;
    }
    el.onclick = () => onSlotClicked(s);
  });

  // 2. Main 27-slot inventory (9-35)
  if (mcMainGrid) {
    let mainHtml = '';
    for (let s = 9; s <= 35; s++) {
      const item = getItemForSlot(s);
      const isSelected = selectedSlot === s;
      const title = item ? `${item.displayName || item.name} (x${item.count}) [Slot ${s}]` : `Slot ${s} (Empty)`;
      mainHtml += `
        <div class="mc-slot ${isSelected ? 'selected' : ''}" data-slot="${s}" title="${title}">
          <span class="mc-slot-num">${s}</span>
          ${item ? `
            <div class="mc-slot-content">
              <span class="mc-slot-icon">${getItemEmoji(item.name)}</span>
              <span class="mc-slot-name-label">${item.displayName || item.name}</span>
            </div>
            ${item.count > 1 ? `<span class="mc-slot-count">${item.count}</span>` : ''}
          ` : `<span class="mc-slot-empty">·</span>`}
        </div>
      `;
    }
    mcMainGrid.innerHTML = mainHtml;
    mcMainGrid.querySelectorAll('.mc-slot').forEach(el => {
      const s = parseInt(el.dataset.slot, 10);
      el.onclick = () => onSlotClicked(s);
    });
  }

  // 3. Hotbar 9-slot inventory (36-44)
  if (mcHotbarGrid) {
    const activeHotbarIdx = Number(currentInventory?.quickBarSlot) || 0;
    let hotbarHtml = '';
    for (let s = 36; s <= 44; s++) {
      const i = s - 36;
      const item = getItemForSlot(s);
      const isSelected = selectedSlot === s;
      const isActive = i === activeHotbarIdx;
      const title = item ? `${item.displayName || item.name} (x${item.count}) [Slot ${s} / Hotbar ${i + 1}]` : `Hotbar ${i + 1} [Slot ${s}] (Empty)`;
      hotbarHtml += `
        <div class="mc-slot ${isSelected ? 'selected' : ''} ${isActive ? 'active-hotbar' : ''}" data-slot="${s}" data-hotbar-index="${i}" title="${title}">
          <span class="mc-slot-num">${i + 1}</span>
          ${item ? `
            <div class="mc-slot-content">
              <span class="mc-slot-icon">${getItemEmoji(item.name)}</span>
              <span class="mc-slot-name-label">${item.displayName || item.name}</span>
            </div>
            ${item.count > 1 ? `<span class="mc-slot-count">${item.count}</span>` : ''}
          ` : `<span class="mc-slot-empty">·</span>`}
        </div>
      `;
    }
    mcHotbarGrid.innerHTML = hotbarHtml;
    mcHotbarGrid.querySelectorAll('.mc-slot').forEach(el => {
      const s = parseInt(el.dataset.slot, 10);
      el.onclick = () => onSlotClicked(s);
    });
  }

  updateSlotActions();
}

function updateControlDeckUI() {
  if (currentInventory) {
    if (currentInventory.isHoldingRightClick !== undefined) {
      isHoldingRightClick = !!currentInventory.isHoldingRightClick;
    }
    if (currentInventory.isHoldingLeftClick !== undefined) {
      isHoldingLeftClick = !!currentInventory.isHoldingLeftClick;
    }
  }

  if (btnHoldRight && labelHoldRight) {
    btnHoldRight.classList.toggle('btn-holding-right', isHoldingRightClick);
    labelHoldRight.textContent = isHoldingRightClick ? 'Release Right (Holding...)' : 'Hold Right';
  }

  if (btnHoldLeft && labelHoldLeft) {
    btnHoldLeft.classList.toggle('btn-holding-left', isHoldingLeftClick);
    labelHoldLeft.textContent = isHoldingLeftClick ? 'Release Left (Attacking...)' : 'Hold Left';
  }
}

// Hand Action Listeners
if (btnLeftClick) {
  btnLeftClick.onclick = () => socket.emit('bot:hand_action', { botId: activeBotId, action: 'left_click' });
}
if (btnHoldLeft) {
  btnHoldLeft.onclick = () => {
    if (isHoldingLeftClick) {
      socket.emit('bot:hand_action', { botId: activeBotId, action: 'stop_left_click_hold' });
    } else {
      socket.emit('bot:hand_action', { botId: activeBotId, action: 'start_left_click_hold' });
    }
  };
}
if (btnRightClick) {
  btnRightClick.onclick = () => socket.emit('bot:hand_action', { botId: activeBotId, action: 'right_click' });
}
if (btnHoldRight) {
  btnHoldRight.onclick = () => {
    if (isHoldingRightClick) {
      socket.emit('bot:hand_action', { botId: activeBotId, action: 'stop_right_click_hold' });
    } else {
      socket.emit('bot:hand_action', { botId: activeBotId, action: 'start_right_click_hold' });
    }
  };
}
if (btnEatFood) {
  btnEatFood.onclick = () => socket.emit('bot:hand_action', { botId: activeBotId, action: 'consume' });
}
if (btnDropHeld) {
  btnDropHeld.onclick = () => socket.emit('bot:hand_action', { botId: activeBotId, action: 'drop_held', all: true });
}
if (btnOpenInventory) {
  btnOpenInventory.onclick = () => {
    modalInventory.showModal();
    renderFullInventoryModal();
  };
}
if (btnOpenInvSidebar) {
  btnOpenInvSidebar.onclick = () => {
    modalInventory.showModal();
    renderFullInventoryModal();
  };
}
if (btnCloseInventory) {
  btnCloseInventory.onclick = () => modalInventory.close();
}

// Inventory Modal Actions
if (btnSlotEquip) {
  btnSlotEquip.onclick = () => {
    if (selectedSlot !== null) {
      socket.emit('bot:inventory_action', { botId: activeBotId, action: 'equip', slot: selectedSlot, destination: 'hand' });
    }
  };
}
if (btnSlotConsume) {
  btnSlotConsume.onclick = () => {
    if (selectedSlot !== null) {
      socket.emit('bot:inventory_action', { botId: activeBotId, action: 'equip', slot: selectedSlot, destination: 'hand' });
      setTimeout(() => socket.emit('bot:hand_action', { botId: activeBotId, action: 'consume' }), 200);
    }
  };
}
if (btnSlotDrop1) {
  btnSlotDrop1.onclick = () => {
    if (selectedSlot !== null) {
      socket.emit('bot:inventory_action', { botId: activeBotId, action: 'drop', slot: selectedSlot, count: 1 });
    }
  };
}
if (btnSlotDropAll) {
  btnSlotDropAll.onclick = () => {
    if (selectedSlot !== null) {
      socket.emit('bot:inventory_action', { botId: activeBotId, action: 'drop', slot: selectedSlot });
    }
  };
}
if (btnSlotDeselect) {
  btnSlotDeselect.onclick = () => {
    selectedSlot = null;
    renderFullInventoryModal();
    updateSlotActions();
  };
}

// Movement Controls (D-Pad & Action Buttons)
if (moveButtons && moveButtons.length > 0) {
  moveButtons.forEach((btn) => {
    btn.onclick = () => {
      const move = btn.dataset.move;
      if (!move) return;
      socket.emit('bot:action', { botId: activeBotId, action: move });
      btn.classList.add('active');
      setTimeout(() => btn.classList.remove('active'), 200);
    };
  });
}

// After Login Command Save Handler
if (btnSaveBotCmd) {
  btnSaveBotCmd.onclick = async () => {
    const cmd = (inpAfterLoginCmd ? inpAfterLoginCmd.value.trim() : '');
    if (!activeBotId) return alert('No bot active to configure');

    // Emit live via socket
    socket.emit('bot:update_config', { botId: activeBotId, afterLoginCommand: cmd });

    // Persist to server storage
    try {
      const res = await fetch(`/api/bots/${activeBotId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ afterLoginCommand: cmd })
      });
      const data = await res.json();
      if (data.bots) {
        activeBots = data.bots;
      }
    } catch (e) {
      console.warn('Failed to save after login command via REST:', e.message);
    }

    // Button feedback
    const originalText = btnSaveBotCmd.innerHTML;
    btnSaveBotCmd.innerHTML = '✅ Saved';
    btnSaveBotCmd.disabled = true;
    setTimeout(() => {
      btnSaveBotCmd.innerHTML = originalText;
      btnSaveBotCmd.disabled = false;
    }, 1500);
  };
}

// ============================================================================
// Quick Commands Management & Execution
// ============================================================================
function executeQuickCommand(cmdItem) {
  let cmd = (cmdItem?.command || '').trim();
  if (!cmd) return;

  // Check if command requires prompt/parameter
  const hasPlaceholder = /<[^>]+>|\{[^}]+\}/.test(cmd);
  const isTargetedCmd = /^\/(tpa|msg|tell|w|pay|tp)\b/i.test(cmd) && !cmd.includes(' ');

  if (hasPlaceholder) {
    const match = cmd.match(/<([^>]+)>|\{([^}]+)\}/);
    const placeholder = match[1] || match[2] || 'value';
    const input = prompt(`Enter ${placeholder} for command: ${cmd}`);
    if (!input || !input.trim()) return;
    cmd = cmd.replace(match[0], input.trim());
  } else if (isTargetedCmd) {
    const target = prompt(`Enter player username for ${cmd}:`, 'phyrooss');
    if (!target || !target.trim()) return;
    cmd = `${cmd} ${target.trim()}`;
  }

  socket.emit('bot:chat', { botId: activeBotId, message: cmd });
}

function renderQuickCommands() {
  if (!quickCmdList) return;
  quickCmdList.innerHTML = '';

  if (!currentQuickCommands || currentQuickCommands.length === 0) {
    quickCmdList.innerHTML = '<span style="font-size:10px; color:var(--text-muted); font-style:italic;">No quick commands. Click ⚙️ Edit to add.</span>';
    return;
  }

  currentQuickCommands.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const colorClass = item.color && item.color !== 'default' ? `btn-qc-${item.color}` : '';
    btn.className = `btn-quick-cmd ${colorClass}`.trim();
    btn.textContent = item.label || item.command;
    btn.title = `Execute: ${item.command}`;
    btn.onclick = () => executeQuickCommand(item);
    quickCmdList.appendChild(btn);
  });
}

function renderQuickCmdsManageList() {
  if (!quickCmdsManageList) return;
  quickCmdsManageList.innerHTML = '';
  if (countQuickCmds) countQuickCmds.textContent = currentQuickCommands.length;

  if (!currentQuickCommands || currentQuickCommands.length === 0) {
    quickCmdsManageList.innerHTML = '<div style="font-size:11px; color:var(--text-muted); text-align:center; padding:12px;">No quick commands yet. Add your first command above!</div>';
    return;
  }

  currentQuickCommands.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'qc-item-row';
    const colorClass = item.color && item.color !== 'default' ? `btn-qc-${item.color}` : '';

    row.innerHTML = `
      <div class="qc-item-info">
        <span class="qc-pill-preview ${colorClass}">${item.label || item.command}</span>
        <span class="qc-cmd-text" title="${item.command}">${item.command}</span>
      </div>
      <div class="qc-item-actions">
        <button type="button" class="btn btn-secondary btn-sm btn-qc-edit-item" style="padding: 3px 7px; font-size: 11px;" title="Edit this command">✏️ Edit</button>
        <button type="button" class="btn btn-danger btn-sm btn-qc-del-item" style="padding: 3px 7px; font-size: 11px;" title="Delete this command">🗑️</button>
      </div>
    `;

    row.querySelector('.btn-qc-edit-item').onclick = () => {
      inpQcId.value = item.id;
      inpQcCmd.value = item.command;
      inpQcLabel.value = item.label || '';
      selQcColor.value = item.color || 'default';
      qcFormTitle.textContent = `✏️ Edit Command: ${item.label || item.command}`;
      btnSaveQc.textContent = '💾 Update Command';
      btnCancelQcEdit.classList.remove('hidden');
      inpQcCmd.focus();
    };

    row.querySelector('.btn-qc-del-item').onclick = () => {
      if (confirm(`Delete quick command "${item.label || item.command}"?`)) {
        currentQuickCommands = currentQuickCommands.filter(c => c.id !== item.id);
        saveQuickCommandsToServer();
      }
    };

    quickCmdsManageList.appendChild(row);
  });
}

async function saveQuickCommandsToServer() {
  renderQuickCommands();
  renderQuickCmdsManageList();

  socket.emit('quick_commands:update', currentQuickCommands);

  try {
    await fetch('/api/quick-commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: currentQuickCommands })
    });
  } catch (err) {
    console.warn('REST save error for quick commands:', err.message);
  }
}

function resetQcForm() {
  if (inpQcId) inpQcId.value = '';
  if (inpQcCmd) inpQcCmd.value = '';
  if (inpQcLabel) inpQcLabel.value = '';
  if (selQcColor) selQcColor.value = 'default';
  if (qcFormTitle) qcFormTitle.textContent = '➕ Add New Quick Command';
  if (btnSaveQc) btnSaveQc.textContent = '➕ Add Command';
  if (btnCancelQcEdit) btnCancelQcEdit.classList.add('hidden');
}

if (formQuickCmd) {
  formQuickCmd.onsubmit = (e) => {
    e.preventDefault();
    const cmd = inpQcCmd.value.trim();
    if (!cmd) return;
    const label = inpQcLabel.value.trim() || cmd;
    const color = selQcColor.value || 'default';
    const existingId = inpQcId.value.trim();

    if (existingId) {
      const target = currentQuickCommands.find(c => c.id === existingId);
      if (target) {
        target.command = cmd;
        target.label = label;
        target.color = color;
      }
    } else {
      const newId = `qc_${Date.now()}`;
      currentQuickCommands.push({ id: newId, command: cmd, label, color });
    }

    resetQcForm();
    saveQuickCommandsToServer();
  };
}

if (btnCancelQcEdit) {
  btnCancelQcEdit.onclick = resetQcForm;
}

if (btnResetQuickCmds) {
  btnResetQuickCmds.onclick = () => {
    if (confirm('Reset quick commands to default buttons?')) {
      currentQuickCommands = [
        { id: 'qc_tpaccept', label: '⚡ /tpaccept', command: '/tpaccept', color: 'green' },
        { id: 'qc_tpadeny', label: '❌ /tpadeny', command: '/tpadeny', color: 'red' },
        { id: 'qc_smp', label: '🌐 /smp', command: '/smp', color: 'default' },
        { id: 'qc_shop', label: '🛒 /shop', command: '/shop', color: 'default' },
        { id: 'qc_spawn', label: '🏠 /spawn', command: '/spawn', color: 'default' },
        { id: 'qc_home', label: '📍 /home', command: '/home', color: 'default' },
        { id: 'qc_tpa', label: '🤝 /tpa', command: '/tpa', color: 'default' }
      ];
      resetQcForm();
      saveQuickCommandsToServer();
    }
  };
}

if (btnManageQuickCmds) {
  btnManageQuickCmds.onclick = () => {
    if (modalQuickCommands) {
      resetQcForm();
      renderQuickCmdsManageList();
      modalQuickCommands.showModal();
    }
  };
}

if (btnCloseQuickCmds) {
  btnCloseQuickCmds.onclick = () => {
    if (modalQuickCommands) modalQuickCommands.close();
  };
}

if (btnDoneQuickCmds) {
  btnDoneQuickCmds.onclick = () => {
    if (modalQuickCommands) modalQuickCommands.close();
  };
}

// Global Keyboard Shortcuts (WASD Movement, Space Jump, Shift Sneak, Keys 1-9 for Hotbar, E for Inv, Q for Drop)
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

  const anyModalOpen = (modalInventory?.open || modalSettings?.open || modalShop?.open || modalAddBot?.open || modalQuickCommands?.open);

  // 1-9 for Hotbar selection
  if (e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    const idx = parseInt(e.key, 10) - 1;
    socket.emit('bot:set_hotbar', { botId: activeBotId, slot: idx });
    return;
  }

  // E for Inventory Modal toggle
  if (e.key === 'e' || e.key === 'E') {
    e.preventDefault();
    if (modalInventory && modalInventory.open) {
      modalInventory.close();
    } else if (modalInventory) {
      modalInventory.showModal();
      renderFullInventoryModal();
    }
    return;
  }

  // Q for Drop Held item
  if (e.key === 'q' || e.key === 'Q') {
    e.preventDefault();
    socket.emit('bot:hand_action', { botId: activeBotId, action: 'drop_held', all: !e.shiftKey });
    return;
  }

  // Escape to close inventory or deselect
  if (e.key === 'Escape') {
    if (selectedSlot !== null) {
      selectedSlot = null;
      renderFullInventoryModal();
      updateSlotActions();
    }
    return;
  }

  // If a modal is open, ignore WASD physical movement controls
  if (anyModalOpen) return;

  const keyLower = e.key.toLowerCase();
  if (keyLower === 'w' || e.key === 'ArrowUp') {
    e.preventDefault();
    socket.emit('bot:action', { botId: activeBotId, action: 'forward' });
    const b = document.getElementById('btn-move-w');
    if (b) { b.classList.add('active'); setTimeout(() => b.classList.remove('active'), 200); }
    return;
  }
  if (keyLower === 's' || e.key === 'ArrowDown') {
    e.preventDefault();
    socket.emit('bot:action', { botId: activeBotId, action: 'back' });
    const b = document.getElementById('btn-move-s');
    if (b) { b.classList.add('active'); setTimeout(() => b.classList.remove('active'), 200); }
    return;
  }
  if (keyLower === 'a' || e.key === 'ArrowLeft') {
    e.preventDefault();
    socket.emit('bot:action', { botId: activeBotId, action: 'left' });
    const b = document.getElementById('btn-move-a');
    if (b) { b.classList.add('active'); setTimeout(() => b.classList.remove('active'), 200); }
    return;
  }
  if (keyLower === 'd' || e.key === 'ArrowRight') {
    e.preventDefault();
    socket.emit('bot:action', { botId: activeBotId, action: 'right' });
    const b = document.getElementById('btn-move-d');
    if (b) { b.classList.add('active'); setTimeout(() => b.classList.remove('active'), 200); }
    return;
  }
  if (e.code === 'Space') {
    e.preventDefault();
    socket.emit('bot:action', { botId: activeBotId, action: 'jump' });
    const b = document.getElementById('btn-move-jump');
    if (b) { b.classList.add('active'); setTimeout(() => b.classList.remove('active'), 200); }
    return;
  }
  if (e.key === 'Shift') {
    e.preventDefault();
    socket.emit('bot:action', { botId: activeBotId, action: 'sneak' });
    const b = document.getElementById('btn-move-sneak');
    if (b) { b.classList.add('active'); setTimeout(() => b.classList.remove('active'), 200); }
    return;
  }
  if (keyLower === 'x') {
    e.preventDefault();
    socket.emit('bot:action', { botId: activeBotId, action: 'stop' });
    const b = document.getElementById('btn-move-stop');
    if (b) { b.classList.add('active'); setTimeout(() => b.classList.remove('active'), 200); }
    return;
  }
});

// Multi-Bot & Single Bot UI Renderers
function updateInventoryUI(inv) {
  if (!inv) return;
  currentInventory = inv;
  renderHotbarStrip();
  if (modalInventory && modalInventory.open) {
    renderFullInventoryModal();
  }
  updateControlDeckUI();
}

function updateStatusUI(st) {
  if (!st) return;
  const targetBot = activeBots.find(b => b.id === (st.botId || activeBotId));
  const botLabel = targetBot?.name || st.botName || st.username || 'Bot';
  elStatus.textContent = `${botLabel}: ${st.state}`;
  elStatus.className = `status-pill ${st.state.toLowerCase()}`;
  
  const isDisconnected = st.state === 'DISCONNECTED' && !st.isReconnecting;
  btnDisconnect.classList.toggle('hidden', isDisconnected);
  
  // Toggle Connect/Leave buttons in the quick connect form
  if (btnConnect && btnLeave) {
    btnConnect.classList.toggle('hidden', !isDisconnected);
    btnLeave.classList.toggle('hidden', isDisconnected);
    if (st.state === 'ERROR' || st.isReconnecting) {
      btnLeave.textContent = '🛑 Cancel Reconnect';
    } else {
      btnLeave.textContent = '🛑 Leave Server';
    }
  }

  const hasTelemetry = ['JOINED', 'WAITING_FOR_TPA', 'ACCEPTING_TPA', 'VERIFYING_TELEPORT', 'AFK', 'SPAWNED', 'CONNECTED'].includes(st.state);
  panelTelemetry.classList.toggle('hidden', !hasTelemetry);
  panelServerInfo.classList.toggle('hidden', !hasTelemetry);
  panelInventory.classList.toggle('hidden', !hasTelemetry);
  panelPlayers.classList.toggle('hidden', !hasTelemetry);
  if (manualControlDeck) manualControlDeck.classList.toggle('hidden', !hasTelemetry);

  if (st.isHoldingRightClick !== undefined) isHoldingRightClick = !!st.isHoldingRightClick;
  if (st.isHoldingLeftClick !== undefined) isHoldingLeftClick = !!st.isHoldingLeftClick;
  if (st.afterLoginCommand !== undefined && inpAfterLoginCmd && document.activeElement !== inpAfterLoginCmd) {
    inpAfterLoginCmd.value = st.afterLoginCommand;
  }
  updateControlDeckUI();

  if (st.health !== undefined) valHealth.textContent = `${st.health}/20`;
  if (st.food !== undefined) valFood.textContent = `${st.food}/20`;
  if (st.position) valPos.textContent = `${st.position.x}, ${st.position.y}, ${st.position.z}`;
  
  // New Expanded Stats
  if (st.experience) valXp.textContent = `${st.experience.level} (${st.experience.progress}%)`;
  if (st.weather) valWeather.textContent = st.weather;
  if (st.timeOfDay) valTime.textContent = st.timeOfDay;
  if (st.gameMode) valGamemode.textContent = st.gameMode.charAt(0).toUpperCase() + st.gameMode.slice(1);

  // Server Info
  if (st.server) infoIp.textContent = `${st.server.host}:${st.server.port}`;
  if (st.mcVersion) infoVer.textContent = st.mcVersion;
  if (st.serverBrand) infoBrand.textContent = st.serverBrand;
  if (st.dimension) infoDim.textContent = st.dimension;
  if (st.difficulty) infoDiff.textContent = st.difficulty;

  // Inventory preview
  if (st.inventory) {
    const { items, armor, heldItem, offhand } = st.inventory;
    
    // Render Armor
    const renderArmor = (name, data) => {
      if (!data) return `<div class="armor-slot" title="Empty ${name}"><span style="opacity:0.2;">${name[0]}</span></div>`;
      return `<div class="armor-slot" data-filled="true" title="${data.displayName}">✓</div>`;
    };
    invArmor.innerHTML = `
      ${renderArmor('Helmet', armor?.helmet)}
      ${renderArmor('Chest', armor?.chestplate)}
      ${renderArmor('Legs', armor?.leggings)}
      ${renderArmor('Boots', armor?.boots)}
    `;

    // Render Items
    let itemsHtml = '';
    
    const renderItem = (label, data) => {
      if (!data) return;
      itemsHtml += `<div class="inv-item">
        <div class="inv-item-name"><span class="inv-icon">🔹</span><span>${label}: ${data.displayName}</span></div>
        <span class="inv-count">${data.count}</span>
      </div>`;
    };

    renderItem('Held', heldItem);
    renderItem('Offhand', offhand);

    (items || []).forEach(i => {
      itemsHtml += `<div class="inv-item">
        <div class="inv-item-name"><span class="inv-icon">📦</span><span>${i.displayName}</span></div>
        <span class="inv-count">x${i.count}</span>
      </div>`;
    });

    if (!itemsHtml) itemsHtml = '<div class="empty-text">Inventory Empty</div>';
    invItems.innerHTML = itemsHtml;

    updateInventoryUI(st.inventory);
  }

  // Players
  if (st.onlinePlayers) {
    badgePlayers.textContent = st.onlinePlayers.length;
    let phtml = '';
    st.onlinePlayers.forEach(p => {
      phtml += `<div class="player-row">
        <span>${p.username}</span>
        <span class="player-ping">${p.ping ?? '?'}ms</span>
      </div>`;
    });
    if (!phtml) phtml = '<div class="empty-text">No players found</div>';
    listPlayers.innerHTML = phtml;
  }
  
  if (['SPAWNED', 'JOINED', 'AFK'].includes(st.state)) {
    if (!uptimeInterval) {
      uptimeSec = st.uptime || 0;
      valUptime.textContent = fmtTime(uptimeSec);
      uptimeInterval = setInterval(() => {
        uptimeSec++;
        valUptime.textContent = fmtTime(uptimeSec);
      }, 1000);
    }
  } else {
    clearInterval(uptimeInterval);
    uptimeInterval = null;
    valUptime.textContent = '00:00';
  }
}

// Multi-Bot Socket Listeners
socket.on('bots:updated', (bots) => {
  activeBots = bots || [];
  if (!activeBotId && activeBots.length > 0) {
    const act = activeBots.find(b => b.isActive) || activeBots[0];
    activeBotId = act?.id;
  }
  renderBotTabs();
});

socket.on('bots:activeChanged', ({ activeBotId: newId }) => {
  activeBotId = newId;
  renderBotTabs();
});

socket.on('bot:inventory', (inv) => {
  if (!inv) return;
  if (!inv.botId || inv.botId === activeBotId) {
    updateInventoryUI(inv);
  }
});

document.querySelectorAll('[data-action]').forEach(btn => {
  btn.onclick = () => socket.emit('bot:action', { botId: activeBotId, action: btn.dataset.action });
});

const btnConnect = document.getElementById('btn-connect');
const btnLeave = document.getElementById('btn-leave');

socket.on('bot:status', (st) => {
  if (!st) return;
  if (st.botId) {
    const b = activeBots.find(x => x.id === st.botId);
    if (b) {
      b.state = st.state;
      b.health = st.health;
      b.food = st.food;
      b.uptime = st.uptime;
      b.isReconnecting = st.isReconnecting;
      renderBotTabs();
    }
  }
  if (!st.botId || st.botId === activeBotId) {
    updateStatusUI(st);
  }
});

// Seed Button
if (btnSaveSeed) {
  btnSaveSeed.onclick = () => {
    const seed = inpSeed.value.trim();
    socket.emit('seed:update', seed);
    btnSaveSeed.textContent = '✓';
    setTimeout(() => btnSaveSeed.textContent = 'Save', 1500);
  };
}

socket.on('bot:chat', (msg) => {
  let senderName = msg.sender || (msg.isMe ? 'BOT' : 'CHAT');
  let type = 'player';
  if (msg.isMe) {
    type = 'bot';
  } else if (senderName === 'SERVER' || senderName === 'ACTIONBAR' || senderName === 'CHAT') {
    type = 'chat';
  }
  const botName = msg.botName || (activeBots.find(b => b.id === msg.botId)?.name);
  appendLog(senderName, msg.text, type, 'chat', msg.time, botName);
});

socket.on('bot:log', (log) => {
  const botName = log.botName || (activeBots.find(b => b.id === log.botId)?.name);
  appendLog(log.type.toUpperCase(), log.text, log.type, log.type === 'action' ? 'system' : log.type, null, botName);
});

socket.on('servers:updated', (srvs) => {
  if (!srvs || srvs.length === 0) {
    serverList.innerHTML = `<div class="empty-text">No saved servers.</div>`;
    return;
  }
  serverList.innerHTML = '';
  srvs.forEach(s => {
    const el = document.createElement('div');
    el.className = 'server-item';
    el.innerHTML = `
      <div class="srv-info">
        <span class="srv-name">${s.host}:${s.port}</span>
        <span class="srv-user">${s.username}</span>
      </div>
      <div class="srv-actions">
        <button class="btn-del" title="Delete">🗑️</button>
      </div>
    `;
    // Click to connect
    el.addEventListener('click', (e) => {
      if(e.target.closest('.btn-del')) return;
      inpHost.value = s.host; inpPort.value = s.port; inpUser.value = s.username;
      inpPass.value = s.loginPassword || ''; inpVersion.value = s.version || '';
      inpAutoLogin.checked = s.autoLogin !== false;
      formConnect.dispatchEvent(new Event('submit'));
    });
    // Delete
    el.querySelector('.btn-del').onclick = () => fetch(`/api/servers/${s.id}`, { method:'DELETE' });
    serverList.appendChild(el);
  });
});

socket.on('bot:settings', (st) => {
  if (!st) return;
  if (selAiModel && st.aiModel) selAiModel.value = st.aiModel;
  if (inpSeed && st.worldSeed !== undefined) inpSeed.value = st.worldSeed;
  chkAntiAfk.checked = !!st.antiAfkEnabled;
  if (chkAutoEat) chkAutoEat.checked = st.autoEat !== false;
  if (chkAutoJoin && st.autoJoinSmp !== undefined) chkAutoJoin.checked = st.autoJoinSmp !== false;
  inpInterval.value = st.antiAfkIntervalSec || 10;
  valInterval.textContent = inpInterval.value;
  if (inpViewDistance && st.viewDistance !== undefined) {
    inpViewDistance.value = st.viewDistance;
    if (valViewDistance) valViewDistance.textContent = st.viewDistance;
  }
  if (st.antiAfkActions) {
    if (chkWalk) chkWalk.checked = st.antiAfkActions.walkAround !== false;
    chkSwing.checked = st.antiAfkActions.swingArm !== false;
    chkLook.checked = st.antiAfkActions.lookAround !== false;
    chkJump.checked = st.antiAfkActions.jump !== false;
    if (chkStep) chkStep.checked = !!st.antiAfkActions.microStep;
    chkSneak.checked = !!st.antiAfkActions.sneak;
  }
  if (afkOpts) {
    afkOpts.style.opacity = chkAntiAfk.checked ? '1' : '0.5';
    afkOpts.style.pointerEvents = chkAntiAfk.checked ? 'auto' : 'none';
  }
  renderAllowedUsers(st.permittedUsers);
  if (st.quickCommands) {
    currentQuickCommands = st.quickCommands;
    renderQuickCommands();
    if (modalQuickCommands && modalQuickCommands.open) {
      renderQuickCmdsManageList();
    }
  }
});

// Initial Quick Commands Load
fetch('/api/settings')
  .then(r => r.json())
  .then(st => {
    if (!st) return;
    if (inpViewDistance && st.viewDistance !== undefined) {
      inpViewDistance.value = st.viewDistance;
      if (valViewDistance) valViewDistance.textContent = st.viewDistance;
    }
    if (st.quickCommands) {
      currentQuickCommands = st.quickCommands;
      renderQuickCommands();
    }
  })
  .catch(() => {});

// UI Actions
inpHost.addEventListener('input', () => {
  const val = inpHost.value.trim();
  if (val.includes(':')) {
    const parts = val.split(':');
    const h = parts[0].trim();
    const p = parseInt(parts[1], 10);
    if (h && !isNaN(p) && p > 0) {
      inpHost.value = h;
      inpPort.value = p;
    }
  }
});

formConnect.onsubmit = (e) => {
  e.preventDefault();
  let host = inpHost.value.trim();
  let port = parseInt(inpPort.value, 10);

  if (host.includes(':')) {
    const parts = host.split(':');
    host = parts[0].trim();
    const p = parseInt(parts[1], 10);
    if (!isNaN(p) && p > 0) {
      port = p;
      inpPort.value = p;
    }
    inpHost.value = host;
  }

  if (isNaN(port) || port <= 0) {
    port = 25565;
  }

  socket.emit('bot:connect', {
    botId: activeBotId,
    host,
    port,
    username: inpUser.value.trim(),
    version: inpVersion.value.trim(),
    loginPassword: inpPass.value.trim(),
    autoLogin: inpAutoLogin.checked,
    afterLoginCommand: (inpAfterLoginCmd ? inpAfterLoginCmd.value.trim() : '/home 1')
  });
};

btnBookmark.onclick = async () => {
  let host = inpHost.value.trim();
  if(!host) return alert('Enter a host IP first');
  let port = parseInt(inpPort.value, 10);
  if (host.includes(':')) {
    const parts = host.split(':');
    host = parts[0].trim();
    const p = parseInt(parts[1], 10);
    if (!isNaN(p) && p > 0) {
      port = p;
      inpPort.value = p;
    }
    inpHost.value = host;
  }
  if (isNaN(port) || port <= 0) port = 25565;

  await fetch('/api/servers', {
    method: 'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      host, port, username: inpUser.value.trim(),
      version: inpVersion.value.trim(), loginPassword: inpPass.value.trim(), autoLogin: inpAutoLogin.checked
    })
  });
};

btnDisconnect.onclick = () => socket.emit('bot:disconnect', { botId: activeBotId });
if (btnLeave) btnLeave.onclick = () => socket.emit('bot:disconnect', { botId: activeBotId });

// Connect All & Disconnect All Batch Handlers
if (btnConnectAll) {
  btnConnectAll.onclick = async () => {
    btnConnectAll.disabled = true;
    btnConnectAll.textContent = '⏳ Connecting...';
    try {
      await fetch('/api/bots/connect-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
    } catch (e) {
      console.error('Failed to connect all:', e);
    } finally {
      setTimeout(() => {
        btnConnectAll.disabled = false;
        btnConnectAll.textContent = '⚡ Connect All';
      }, 1500);
    }
  };
}

if (btnDisconnectAll) {
  btnDisconnectAll.onclick = async () => {
    btnDisconnectAll.disabled = true;
    btnDisconnectAll.textContent = '⏳ Disconnecting...';
    try {
      await fetch('/api/bots/disconnect-all', { method: 'POST' });
    } catch (e) {
      console.error('Failed to disconnect all:', e);
    } finally {
      setTimeout(() => {
        btnDisconnectAll.disabled = false;
        btnDisconnectAll.textContent = '⏹️ Disconnect All';
      }, 1000);
    }
  };
}

// Add Bot to Pool Modal
if (btnAddBotModal && modalAddBot) {
  btnAddBotModal.onclick = () => {
    modalAddBot.showModal();
    if (inpAddUsername) inpAddUsername.focus();
  };
}
if (btnCloseAddBot && modalAddBot) {
  btnCloseAddBot.onclick = () => modalAddBot.close();
}
if (btnCancelAddBot && modalAddBot) {
  btnCancelAddBot.onclick = () => modalAddBot.close();
}
if (formAddBot) {
  formAddBot.onsubmit = async (e) => {
    e.preventDefault();
    const username = (inpAddUsername?.value || '').trim();
    if (!username) return;
    const host = (inpAddHost?.value || 'paid34.skilloraclouds.com').trim();
    const port = parseInt(inpAddPort?.value || '25593', 10);
    const password = (inpAddPassword?.value || '209801').trim();
    const version = (inpAddVersion?.value || '1.21.4').trim();

    try {
      const res = await fetch('/api/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: username,
          username,
          host,
          port,
          loginPassword: password,
          version
        })
      });
      const data = await res.json();
      if (data.success && data.bots) {
        activeBots = data.bots;
        if (data.bot?.id) {
          activeBotId = data.bot.id;
        }
        renderBotTabs();
        modalAddBot.close();
        formAddBot.reset();
      } else if (data.error) {
        alert(`Error adding bot: ${data.error}`);
      }
    } catch (err) {
      alert(`Failed to add bot: ${err.message}`);
    }
  };
}

formChat.onsubmit = (e) => {
  e.preventDefault();
  const msg = inpChat.value.trim();
  if(!msg) return;
  socket.emit('bot:chat', { botId: activeBotId, message: msg });
  inpChat.value = '';
};

tabs.forEach(t => t.onclick = () => {
  tabs.forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  currentFilter = t.dataset.filter;
  document.querySelectorAll('.log-row').forEach(row => {
    if (currentFilter === 'all') row.style.display = 'flex';
    else row.style.display = row.dataset.type === currentFilter ? 'flex' : 'none';
  });
});

btnClear.onclick = () => { terminal.innerHTML = ''; };

// ============================================================================
// Shop Scraper & AI Wealth Intelligence Engine
// ============================================================================
const modalShop = document.getElementById('modal-shop');
const btnShop = document.getElementById('btn-shop');
const btnCloseShop = document.getElementById('btn-close-shop');
const inpShopCmd = document.getElementById('inp-shop-cmd');
const selShopSpeed = document.getElementById('sel-shop-speed');
const btnStartCrawl = document.getElementById('btn-start-crawl');
const btnStopCrawl = document.getElementById('btn-stop-crawl');
const btnRunAiWealth = document.getElementById('btn-run-ai-wealth');
const btnCopyAiPrompt = document.getElementById('btn-copy-ai-prompt');
const btnExportShopJson = document.getElementById('btn-export-shop-json');

const shopProgressCard = document.getElementById('shop-progress-card');
const shopProgressStage = document.getElementById('shop-progress-stage');
const shopProgressCount = document.getElementById('shop-progress-count');
const shopProgressBar = document.getElementById('shop-progress-bar');
const badgeCatalogCount = document.getElementById('badge-catalog-count');

const shopTabs = document.querySelectorAll('.shop-tab');
const shopViewWealth = document.getElementById('shop-view-wealth');
const shopViewCatalog = document.getElementById('shop-view-catalog');

const sectionArbitrage = document.getElementById('section-arbitrage');
const listPassiveFarms = document.getElementById('list-passive-farms');
const listSpawners = document.getElementById('list-spawners');
const sectionAiRoadmap = document.getElementById('section-ai-roadmap');
const aiRoadmapContent = document.getElementById('ai-roadmap-content');
const btnCopyRoadmap = document.getElementById('btn-copy-roadmap');

const inpCatalogSearch = document.getElementById('inp-catalog-search');
const selCatalogCat = document.getElementById('sel-catalog-cat');
const chkSellableOnly = document.getElementById('chk-sellable-only');
const chkBuyableOnly = document.getElementById('chk-buyable-only');
const catalogTableBody = document.getElementById('catalog-table-body');

let activeCatalog = null;
let activeAnalysis = null;
let isShopCrawling = false;

// Modal Controls
if (btnShop && modalShop) {
  btnShop.onclick = () => {
    modalShop.showModal();
    if (!activeCatalog) {
      fetchLatestCatalog();
    }
  };
}

if (btnCloseShop && modalShop) {
  btnCloseShop.onclick = () => modalShop.close();
}

// Tab Switching
shopTabs.forEach(tab => {
  tab.onclick = () => {
    shopTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    if (target === 'wealth') {
      shopViewWealth.classList.remove('hidden');
      shopViewCatalog.classList.add('hidden');
    } else {
      shopViewWealth.classList.add('hidden');
      shopViewCatalog.classList.remove('hidden');
    }
  };
});

// Fetch Latest Catalog from Server
async function fetchLatestCatalog() {
  try {
    const res = await fetch('/api/shop/catalog');
    if (res.ok) {
      const data = await res.json();
      activeCatalog = data.catalog;
      activeAnalysis = data.analysis;
      renderShopData();
    }
  } catch (err) {
    console.warn('Could not fetch existing shop catalog:', err);
  }
}

// Start Crawl
if (btnStartCrawl) {
  btnStartCrawl.onclick = () => {
    const cmd = (inpShopCmd?.value || '/shop').trim();
    const delay = parseInt(selShopSpeed?.value || '1000', 10);
    
    isShopCrawling = true;
    btnStartCrawl.classList.add('hidden');
    btnStopCrawl.classList.remove('hidden');
    shopProgressCard.classList.remove('hidden');
    shopProgressStage.textContent = `Starting crawl with ${cmd}...`;
    shopProgressBar.style.width = '5%';
    shopProgressCount.textContent = '0 items found';

    socket.emit('shop:crawl', { botId: activeBotId, command: cmd, delay });
  };
}

// Stop Crawl
if (btnStopCrawl) {
  btnStopCrawl.onclick = () => {
    socket.emit('shop:stop', { botId: activeBotId });
    btnStopCrawl.textContent = 'Stopping...';
  };
}

// Socket Crawl Events
socket.on('shop:progress', (data) => {
  isShopCrawling = true;
  shopProgressCard.classList.remove('hidden');
  btnStartCrawl.classList.add('hidden');
  btnStopCrawl.classList.remove('hidden');
  btnStopCrawl.textContent = '⏹ Stop';

  shopProgressStage.textContent = `${data.stage}: ${data.detail || ''}`;
  shopProgressBar.style.width = `${Math.min(100, Math.max(5, data.percent || 0))}%`;
  shopProgressCount.textContent = `${data.itemsFound || 0} items found`;
});

socket.on('shop:complete', (catalog) => {
  isShopCrawling = false;
  btnStartCrawl.classList.remove('hidden');
  btnStopCrawl.classList.add('hidden');
  shopProgressBar.style.width = '100%';
  shopProgressStage.textContent = `✅ Crawl completed! ${catalog.totalItems} items scanned.`;

  setTimeout(() => {
    shopProgressCard.classList.add('hidden');
  }, 4000);

  activeCatalog = catalog;
  fetchLatestCatalog();
});

socket.on('shop:stopped', () => {
  isShopCrawling = false;
  btnStartCrawl.classList.remove('hidden');
  btnStopCrawl.classList.add('hidden');
  shopProgressCard.classList.add('hidden');
});

socket.on('shop:error', (data) => {
  isShopCrawling = false;
  btnStartCrawl.classList.remove('hidden');
  btnStopCrawl.classList.add('hidden');
  shopProgressStage.textContent = `⚠️ Error: ${data.message}`;
  shopProgressBar.style.background = '#ef4444';
});

socket.on('shop:catalog', (catalog) => {
  activeCatalog = catalog;
  fetchLatestCatalog();
});

// Render Catalog & Wealth Analytics
function renderShopData() {
  if (!activeCatalog || !activeAnalysis) return;

  const total = activeCatalog.totalItems || activeCatalog.items?.length || 0;
  if (badgeCatalogCount) badgeCatalogCount.textContent = total;

  // 1. Render Arbitrage / Exploit Alert
  if (sectionArbitrage) {
    if (activeAnalysis.arbitrageOpportunities && activeAnalysis.arbitrageOpportunities.length > 0) {
      let arbHtml = `
        <div class="arbitrage-card">
          <div class="arbitrage-title">
            <span>🚨</span>
            <span>INFINITE MONEY ARBITRAGE DETECTED! (${activeAnalysis.arbitrageOpportunities.length} recipes)</span>
          </div>
          <p style="font-size:11px; margin:0; color:var(--text-muted);">
            You can buy raw ingredients from /shop, craft these items, and sell them back for pure infinite profit loops:
          </p>
          <div style="display:flex; flex-direction:column; gap:6px;">
      `;

      for (const arb of activeAnalysis.arbitrageOpportunities) {
        arbHtml += `
          <div class="arbitrage-item-row">
            <div>
              <strong>${arb.recipeName}</strong>: Buy ingredients for <span style="color:#60a5fa;">$${arb.totalCost.toFixed(2)}</span> 
              ➜ Sell ${arb.craftedCount}x ${arb.craftedItem} for <span style="color:#34d399;">$${arb.totalRevenue.toFixed(2)}</span>
            </div>
            <div class="arbitrage-badge">
              +${arb.profitMarginPct.toFixed(0)}% (+$${arb.netProfitPerCraft.toFixed(2)} / craft)
            </div>
          </div>
        `;
      }

      arbHtml += `</div></div>`;
      sectionArbitrage.innerHTML = arbHtml;
      sectionArbitrage.classList.remove('hidden');
    } else {
      sectionArbitrage.innerHTML = `
        <div style="background:var(--bg-surface); border:1px solid var(--border); border-radius:var(--rad); padding:8px 12px; font-size:11px; color:var(--text-muted); display:flex; align-items:center; gap:8px;">
          <span>⚖️</span>
          <span><strong>Balanced Crafting Economy:</strong> No direct infinite crafting loops found in base items. Wealth will be driven by passive AFK farming and spawners below!</span>
        </div>
      `;
      sectionArbitrage.classList.remove('hidden');
    }
  }

  // 2. Render Passive AFK Farms
  if (listPassiveFarms) {
    if (activeAnalysis.passiveFarmRankings && activeAnalysis.passiveFarmRankings.length > 0) {
      listPassiveFarms.innerHTML = activeAnalysis.passiveFarmRankings.map((crop, idx) => `
        <div class="analytics-row">
          <div class="analytics-name">
            <span style="color:${idx === 0 ? '#fbbf24' : 'var(--text-muted)'}; font-weight:700;">#${idx + 1}</span>
            <span>${crop.crop}</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="color:var(--text-muted); font-size:10px;">Sells @ $${crop.sellPrice.toFixed(2)}</span>
            <span class="analytics-val">~$${crop.estHourlyProfitPer100Plots.toFixed(0)}/hr</span>
          </div>
        </div>
      `).join('');
    } else {
      listPassiveFarms.innerHTML = `<div class="empty-text">No passive crops found in catalog.</div>`;
    }
  }

  // 3. Render Spawners
  if (listSpawners) {
    if (activeAnalysis.spawnerAnalysis && activeAnalysis.spawnerAnalysis.length > 0) {
      listSpawners.innerHTML = activeAnalysis.spawnerAnalysis.map((sp, idx) => `
        <div class="analytics-row">
          <div class="analytics-name">
            <span style="color:${idx === 0 ? '#fbbf24' : 'var(--text-muted)'}; font-weight:700;">#${idx + 1}</span>
            <span>${sp.mob} Spawner</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="color:var(--text-muted); font-size:10px;">Cost: $${sp.spawnerCost.toLocaleString()}</span>
            <span class="analytics-val">${sp.hoursToBreakEven} hrs payback</span>
          </div>
        </div>
      `).join('');
    } else {
      listSpawners.innerHTML = `<div class="empty-text">No spawner prices detected in catalog.</div>`;
    }
  }

  // 4. Populate Category Select
  if (selCatalogCat) {
    const currentVal = selCatalogCat.value;
    const cats = new Set(['all']);
    (activeCatalog.categories || []).forEach(c => {
      if (c && c.name) cats.add(c.name);
    });

    selCatalogCat.innerHTML = Array.from(cats).map(c => `
      <option value="${c}">${c === 'all' ? 'All Categories' : c}</option>
    `).join('');
    selCatalogCat.value = cats.has(currentVal) ? currentVal : 'all';
  }

  // 5. Render Table
  renderCatalogTable();
}

// Render Table with Filters
function renderCatalogTable() {
  if (!catalogTableBody || !activeCatalog) return;

  const searchQuery = (inpCatalogSearch?.value || '').toLowerCase().trim();
  const selectedCat = selCatalogCat?.value || 'all';
  const sellableOnly = chkSellableOnly?.checked || false;
  const buyableOnly = chkBuyableOnly?.checked || false;

  let items = activeCatalog.items || [];
  if (activeCatalog.categories && items.length === 0) {
    items = activeCatalog.categories.flatMap(c => c.items || []);
  }

  const filtered = items.filter(item => {
    if (!item) return false;
    const name = (item.displayName || item.name || '').toLowerCase();
    if (searchQuery && !name.includes(searchQuery)) return false;
    if (sellableOnly && !item.canSell) return false;
    if (buyableOnly && !item.canBuy) return false;
    if (selectedCat !== 'all') {
      const matchCat = (activeCatalog.categories || []).find(c => c.name === selectedCat);
      if (matchCat && !(matchCat.items || []).some(ci => ci.slot === item.slot && ci.name === item.name)) {
        return false;
      }
    }
    return true;
  });

  if (filtered.length === 0) {
    catalogTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--text-muted);">No items matched the current filter.</td></tr>`;
    return;
  }

  catalogTableBody.innerHTML = filtered.map(item => {
    const buyStr = item.canBuy && typeof item.buyPrice === 'number' ? `$${item.buyPrice.toFixed(2)}` : '<span style="color:var(--text-muted);">N/A</span>';
    const sellStr = item.canSell && typeof item.sellPrice === 'number' ? `$${item.sellPrice.toFixed(2)}` : '<span style="color:var(--text-muted);">N/A</span>';
    
    let ratioStr = '<span style="color:var(--text-muted);">--</span>';
    if (item.canBuy && item.canSell && item.buyPrice > 0 && item.sellPrice > 0) {
      const ratio = (item.sellPrice / item.buyPrice) * 100;
      const color = ratio >= 50 ? '#34d399' : '#fbbf24';
      ratioStr = `<span class="catalog-ratio-badge" style="color:${color};">${ratio.toFixed(0)}% return</span>`;
    }

    const catName = (activeCatalog.categories || []).find(c => (c.items || []).some(ci => ci.slot === item.slot && ci.name === item.name))?.name || 'General';

    return `
      <tr>
        <td style="font-weight:600;">${item.displayName || item.name}</td>
        <td style="color:var(--text-muted); font-size:10px;">${catName}</td>
        <td class="catalog-price-buy">${buyStr}</td>
        <td class="catalog-price-sell">${sellStr}</td>
        <td>${ratioStr}</td>
      </tr>
    `;
  }).join('');
}

// Table Filter Event Listeners
if (inpCatalogSearch) inpCatalogSearch.oninput = renderCatalogTable;
if (selCatalogCat) selCatalogCat.onchange = renderCatalogTable;
if (chkSellableOnly) chkSellableOnly.onchange = renderCatalogTable;
if (chkBuyableOnly) chkBuyableOnly.onchange = renderCatalogTable;

// Run AI Wealth Plan
if (btnRunAiWealth) {
  btnRunAiWealth.onclick = async () => {
    btnRunAiWealth.disabled = true;
    btnRunAiWealth.textContent = '🧠 Analyzing with AI...';

    try {
      const res = await fetch('/api/shop/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate plan');

      sectionAiRoadmap.classList.remove('hidden');
      aiRoadmapContent.textContent = data.markdownReport || data.aiStrategy || 'Analysis complete.';
      
      // Auto-switch to wealth view
      shopTabs[0].click();
      sectionAiRoadmap.scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
      alert(`AI Strategy error: ${err.message}`);
    } finally {
      btnRunAiWealth.disabled = false;
      btnRunAiWealth.textContent = '🧠 AI Wealth Plan';
    }
  };
}

// Copy AI Prompt (for pasting into ChatGPT/Claude)
if (btnCopyAiPrompt) {
  btnCopyAiPrompt.onclick = async () => {
    try {
      const res = await fetch('/api/shop/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      const promptToCopy = data.aiPrompt || data.markdownReport;
      if (promptToCopy) {
        await navigator.clipboard.writeText(promptToCopy);
        const prevText = btnCopyAiPrompt.textContent;
        btnCopyAiPrompt.textContent = '✅ Copied!';
        setTimeout(() => { btnCopyAiPrompt.textContent = prevText; }, 2000);
      }
    } catch (err) {
      alert('Could not copy prompt: ' + err.message);
    }
  };
}

// Copy Roadmap Text
if (btnCopyRoadmap) {
  btnCopyRoadmap.onclick = async () => {
    const text = aiRoadmapContent?.textContent;
    if (text) {
      await navigator.clipboard.writeText(text);
      btnCopyRoadmap.textContent = '✅ Copied!';
      setTimeout(() => { btnCopyRoadmap.textContent = 'Copy Report'; }, 2000);
    }
  };
}

// Export Catalog JSON
if (btnExportShopJson) {
  btnExportShopJson.onclick = () => {
    window.open('/api/shop/export', '_blank');
  };
}

