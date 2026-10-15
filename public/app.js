const socket = io();

// DOM
const elStatus = document.getElementById('status-pill');
const btnDisconnect = document.getElementById('btn-disconnect');
const panelTelemetry = document.getElementById('panel-telemetry');

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
  const guestList = (users || []).filter(u => u && u.toLowerCase() !== 'phyroosh');

  // 1. Render on Home Page Sidebar
  if (homeAllowedUsers) {
    if (guestList.length === 0) {
      homeAllowedUsers.innerHTML = `<div class="empty-text">No guest users added.<br>Only <strong>Phyroosh</strong> has permission.</div>`;
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
      modalAllowedUsers.innerHTML = `<span style="font-size:11px; color:var(--text-muted);">None (only Phyroosh has permission)</span>`;
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

  const hasTelemetry = ['CONNECTED', 'SPAWNED'].includes(st.state);
  panelTelemetry.classList.toggle('hidden', !hasTelemetry);
  panelServerInfo.classList.toggle('hidden', !hasTelemetry);
  panelInventory.classList.toggle('hidden', !hasTelemetry);
  panelPlayers.classList.toggle('hidden', !hasTelemetry);

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
formConnect.onsubmit = (e) => {
  e.preventDefault();
  socket.emit('bot:connect', {
    host: inpHost.value.trim(),
    port: parseInt(inpPort.value)||25565,
    username: inpUser.value.trim(),
    version: inpVersion.value.trim(),
    loginPassword: inpPass.value.trim(),
    autoLogin: inpAutoLogin.checked
  });
};

btnBookmark.onclick = async () => {
  const host = inpHost.value.trim();
  if(!host) return alert('Enter a host IP first');
  await fetch('/api/servers', {
    method: 'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      host, port: parseInt(inpPort.value)||25565, username: inpUser.value.trim(),
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
