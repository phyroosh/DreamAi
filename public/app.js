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
const selAiModel = document.getElementById('sel-aimodel');
const inpPermittedUsers = document.getElementById('inp-permitted-users');
const btnSaveUsers = document.getElementById('btn-save-users');
const saveIndicator = document.getElementById('save-indicator');
const modalAllowedUsers = document.getElementById('modal-allowed-users');

const homeAllowedUsers = document.getElementById('home-allowed-users');
const formHomeUser = document.getElementById('form-home-user');
const inpHomeUser = document.getElementById('inp-home-user');

let currentFilter = 'all';
let uptimeSec = 0;
let uptimeInterval = null;

// Helpers
const fmtTime = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;

const appendLog = (senderTag, text, type, category = 'system', customTime = null) => {
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

  row.innerHTML = `
    <span class="log-time">[${time}]</span>
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
  afkOpts.style.opacity = chkAntiAfk.checked ? '1' : '0.5';
  afkOpts.style.pointerEvents = chkAntiAfk.checked ? 'auto' : 'none';
  
  socket.emit('settings:update', {
    aiModel: selAiModel ? selAiModel.value : 'nvidia/nemotron-3-super-120b-a12b',
    antiAfkEnabled: chkAntiAfk.checked,
    antiAfkIntervalSec: parseInt(inpInterval.value),
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
  });
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
      socket.emit('bot:set_hotbar', idx);
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
  btnLeftClick.onclick = () => socket.emit('bot:hand_action', { action: 'left_click' });
}
if (btnHoldLeft) {
  btnHoldLeft.onclick = () => {
    if (isHoldingLeftClick) {
      socket.emit('bot:hand_action', { action: 'stop_left_click_hold' });
    } else {
      socket.emit('bot:hand_action', { action: 'start_left_click_hold' });
    }
  };
}
if (btnRightClick) {
  btnRightClick.onclick = () => socket.emit('bot:hand_action', { action: 'right_click' });
}
if (btnHoldRight) {
  btnHoldRight.onclick = () => {
    if (isHoldingRightClick) {
      socket.emit('bot:hand_action', { action: 'stop_right_click_hold' });
    } else {
      socket.emit('bot:hand_action', { action: 'start_right_click_hold' });
    }
  };
}
if (btnEatFood) {
  btnEatFood.onclick = () => socket.emit('bot:hand_action', { action: 'consume' });
}
if (btnDropHeld) {
  btnDropHeld.onclick = () => socket.emit('bot:hand_action', { action: 'drop_held', all: true });
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
      socket.emit('bot:inventory_action', { action: 'equip', slot: selectedSlot, destination: 'hand' });
    }
  };
}
if (btnSlotConsume) {
  btnSlotConsume.onclick = () => {
    if (selectedSlot !== null) {
      socket.emit('bot:inventory_action', { action: 'equip', slot: selectedSlot, destination: 'hand' });
      setTimeout(() => socket.emit('bot:hand_action', { action: 'consume' }), 200);
    }
  };
}
if (btnSlotDrop1) {
  btnSlotDrop1.onclick = () => {
    if (selectedSlot !== null) {
      socket.emit('bot:inventory_action', { action: 'drop', slot: selectedSlot, count: 1 });
    }
  };
}
if (btnSlotDropAll) {
  btnSlotDropAll.onclick = () => {
    if (selectedSlot !== null) {
      socket.emit('bot:inventory_action', { action: 'drop', slot: selectedSlot });
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

// Global Keyboard Shortcuts (Keys 1-9 for Hotbar, E for Inv, Q for Drop)
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

  // 1-9 for Hotbar selection
  if (e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    const idx = parseInt(e.key, 10) - 1;
    socket.emit('bot:set_hotbar', idx);
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
    socket.emit('bot:hand_action', { action: 'drop_held', all: !e.shiftKey });
    return;
  }

  // Escape to close inventory or deselect
  if (e.key === 'Escape') {
    if (selectedSlot !== null) {
      selectedSlot = null;
      renderFullInventoryModal();
      updateSlotActions();
    }
  }
});

// bot:inventory socket event
socket.on('bot:inventory', (inv) => {
  if (!inv) return;
  currentInventory = inv;
  renderHotbarStrip();
  if (modalInventory && modalInventory.open) {
    renderFullInventoryModal();
  }
  updateControlDeckUI();
});

document.querySelectorAll('[data-action]').forEach(btn => {
  btn.onclick = () => socket.emit('bot:action', btn.dataset.action);
});

const btnConnect = document.getElementById('btn-connect');
const btnLeave = document.getElementById('btn-leave');

// Socket Events
socket.on('bot:status', (st) => {
  elStatus.textContent = st.state;
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

  // Inventory
  if (st.inventory) {
    const { items, armor, heldItem, offhand } = st.inventory;
    
    // Render Armor
    const renderArmor = (name, data) => {
      if (!data) return `<div class="armor-slot" title="Empty ${name}"><span style="opacity:0.2;">${name[0]}</span></div>`;
      return `<div class="armor-slot" data-filled="true" title="${data.displayName}">✓</div>`;
    };
    invArmor.innerHTML = `
      ${renderArmor('Helmet', armor.helmet)}
      ${renderArmor('Chest', armor.chestplate)}
      ${renderArmor('Legs', armor.leggings)}
      ${renderArmor('Boots', armor.boots)}
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

    items.forEach(i => {
      itemsHtml += `<div class="inv-item">
        <div class="inv-item-name"><span class="inv-icon">📦</span><span>${i.displayName}</span></div>
        <span class="inv-count">x${i.count}</span>
      </div>`;
    });

    if (!itemsHtml) itemsHtml = '<div class="empty-text">Inventory Empty</div>';
    invItems.innerHTML = itemsHtml;

    currentInventory = st.inventory;
    renderHotbarStrip();
    if (modalInventory && modalInventory.open) {
      renderFullInventoryModal();
    }
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
  
  if (st.state === 'SPAWNED') {
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
  appendLog(senderName, msg.text, type, 'chat', msg.time);
});

socket.on('bot:log', (log) => {
  appendLog(log.type.toUpperCase(), log.text, log.type, log.type === 'action' ? 'system' : log.type);
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
});

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
    host,
    port,
    username: inpUser.value.trim(),
    version: inpVersion.value.trim(),
    loginPassword: inpPass.value.trim(),
    autoLogin: inpAutoLogin.checked
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

btnDisconnect.onclick = () => socket.emit('bot:disconnect');
if (btnLeave) btnLeave.onclick = () => socket.emit('bot:disconnect');

formChat.onsubmit = (e) => {
  e.preventDefault();
  const msg = inpChat.value.trim();
  if(!msg) return;
  socket.emit('bot:chat', msg);
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
