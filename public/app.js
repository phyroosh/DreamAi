const socket = io();

// DOM
const elStatus = document.getElementById('status-pill');
const btnDisconnect = document.getElementById('btn-disconnect');
const panelTelemetry = document.getElementById('panel-telemetry');

const valHealth = document.getElementById('val-health');
const valFood = document.getElementById('val-food');
const valPos = document.getElementById('val-pos');
const valUptime = document.getElementById('val-uptime');

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
const chkSwing = document.getElementById('chk-swing');
const chkLook = document.getElementById('chk-look');
const chkJump = document.getElementById('chk-jump');
const chkSneak = document.getElementById('chk-sneak');
const inpInterval = document.getElementById('inp-interval');
const valInterval = document.getElementById('val-interval');

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

// Settings Modal
btnSettings.onclick = () => modalSettings.showModal();
btnCloseSettings.onclick = () => modalSettings.close();

const syncSettings = () => {
  afkOpts.style.opacity = chkAntiAfk.checked ? '1' : '0.5';
  afkOpts.style.pointerEvents = chkAntiAfk.checked ? 'auto' : 'none';
  
  socket.emit('settings:update', {
    antiAfkEnabled: chkAntiAfk.checked,
    antiAfkIntervalSec: parseInt(inpInterval.value),
    antiAfkActions: {
      swingArm: chkSwing.checked,
      lookAround: chkLook.checked,
      jump: chkJump.checked,
      sneak: chkSneak.checked
    }
  });
};

chkAntiAfk.onchange = syncSettings;
chkSwing.onchange = syncSettings;
chkLook.onchange = syncSettings;
chkJump.onchange = syncSettings;
chkSneak.onchange = syncSettings;
inpInterval.oninput = () => { valInterval.textContent = inpInterval.value; };
inpInterval.onchange = syncSettings;

document.querySelectorAll('[data-action]').forEach(btn => {
  btn.onclick = () => socket.emit('bot:action', btn.dataset.action);
});

// Socket Events
socket.on('bot:status', (st) => {
  elStatus.textContent = st.state;
  elStatus.className = `status-pill ${st.state.toLowerCase()}`;
  
  const isActive = ['CONNECTING', 'CONNECTED', 'SPAWNED'].includes(st.state);
  btnDisconnect.classList.toggle('hidden', !isActive);
  panelTelemetry.classList.toggle('hidden', !isActive);

  if (st.health !== undefined) valHealth.textContent = `${st.health}/20`;
  if (st.food !== undefined) valFood.textContent = `${st.food}/20`;
  if (st.position) valPos.textContent = `${st.position.x}, ${st.position.y}, ${st.position.z}`;
  
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
  chkAntiAfk.checked = !!st.antiAfkEnabled;
  inpInterval.value = st.antiAfkIntervalSec || 10;
  valInterval.textContent = inpInterval.value;
  if(st.antiAfkActions) {
    chkSwing.checked = st.antiAfkActions.swingArm !== false;
    chkLook.checked = st.antiAfkActions.lookAround !== false;
    chkJump.checked = !!st.antiAfkActions.jump;
    chkSneak.checked = !!st.antiAfkActions.sneak;
  }
  syncSettings();
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
