import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const SERVERS_FILE = path.join(DATA_DIR, 'servers.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const BOTS_FILE = path.join(DATA_DIR, 'bots.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial settings default:
// trustedPlayer is the account authorized to send TPA requests and control the AFK bot.
const DEFAULT_SETTINGS = {
  trustedPlayer: process.env.TRUSTED_PLAYER || 'phyrooss',
  defaultUsername: process.env.DEFAULT_USERNAME || 'Aaswaam',
  defaultPassword: process.env.DEFAULT_PASSWORD || '209801',
  autoLogin: true,
  autoEat: true,
  autoEatThreshold: 16,
  aiModel: process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-super-120b-a12b',
  worldSeed: '',
  autoJoinSmp: false,
  antiAfkEnabled: true,
  antiAfkMode: 'still', // 'still' = stand still (farm safe); 'subtle' = small safe nudge
  antiAfkIntervalSec: 30,
  antiAfkActions: {
    walkAround: false,
    swingArm: false,
    lookAround: false,
    jump: false,
    microStep: false,
    sneak: false
  },
  autoReconnect: true,
  autoReconnectDelaySec: 10,
  maxReconnectAttempts: 10,
  tpaTimeoutSec: 25,
  permittedUsers: []
};

function sanitizeGuestUsers(users) {
  if (!Array.isArray(users)) return [];
  const seen = new Set();
  const result = [];
  for (const u of users) {
    const clean = String(u || '').trim();
    if (!clean || clean.toLowerCase() === 'phyrooss' || clean.toLowerCase() === 'phyroosh') continue;
    const lower = clean.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(clean);
    }
  }
  return result;
}

export function getSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
      return { ...DEFAULT_SETTINGS };
    }
    const data = fs.readFileSync(SETTINGS_FILE, 'utf8').trim();
    if (!data) {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
      return { ...DEFAULT_SETTINGS };
    }
    const parsed = JSON.parse(data);
    const settings = { ...DEFAULT_SETTINGS, ...parsed };
    settings.permittedUsers = sanitizeGuestUsers(settings.permittedUsers);
    return settings;
  } catch (err) {
    console.error('Error reading settings, resetting to defaults:', err.message);
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    const current = getSettings();
    const updated = { ...current, ...settings };
    if (updated.permittedUsers !== undefined) {
      updated.permittedUsers = sanitizeGuestUsers(updated.permittedUsers);
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2));
    return updated;
  } catch (err) {
    console.error('Error saving settings:', err);
    throw err;
  }
}
const DEFAULT_SERVERS = [
  {
    id: 'srv_skillora',
    name: 'paid34.skilloraclouds.com:25593',
    host: 'paid34.skilloraclouds.com',
    port: 25593,
    version: '1.21.4',
    username: 'Aaswaam',
    loginPassword: '209801',
    autoLogin: true
  }
];

export function getSavedServers() {
  try {
    if (!fs.existsSync(SERVERS_FILE)) {
      fs.writeFileSync(SERVERS_FILE, JSON.stringify(DEFAULT_SERVERS, null, 2));
      return [...DEFAULT_SERVERS];
    }
    const data = fs.readFileSync(SERVERS_FILE, 'utf8').trim();
    if (!data) {
      fs.writeFileSync(SERVERS_FILE, JSON.stringify(DEFAULT_SERVERS, null, 2));
      return [...DEFAULT_SERVERS];
    }
    const list = JSON.parse(data);
    return Array.isArray(list) && list.length > 0 ? list : [...DEFAULT_SERVERS];
  } catch (err) {
    console.error('Error reading servers:', err);
    return [...DEFAULT_SERVERS];
  }
}

export function saveServer(server) {
  try {
    const servers = getSavedServers();
    const existingIndex = servers.findIndex(s => s.id === server.id || (s.host === server.host && s.port === server.port));
    
    const newEntry = {
      id: server.id || `srv_${Date.now()}`,
      name: server.name || `${server.host}:${server.port}`,
      host: server.host,
      port: Number(server.port) || 25565,
      version: server.version || '',
      username: server.username || '',
      loginPassword: server.loginPassword || '209801',
      autoLogin: server.autoLogin !== false,
      lastJoined: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      servers[existingIndex] = { ...servers[existingIndex], ...newEntry };
    } else {
      servers.unshift(newEntry);
    }

    fs.writeFileSync(SERVERS_FILE, JSON.stringify(servers, null, 2));
    return newEntry;
  } catch (err) {
    console.error('Error saving server:', err);
    throw err;
  }
}

export function deleteServer(id) {
  try {
    const servers = getSavedServers();
    const filtered = servers.filter(s => s.id !== id);
    fs.writeFileSync(SERVERS_FILE, JSON.stringify(filtered, null, 2));
    return filtered;
  } catch (err) {
    console.error('Error deleting server:', err);
    throw err;
  }
}

const SHOPS_DIR = path.join(DATA_DIR, 'shops');
if (!fs.existsSync(SHOPS_DIR)) {
  fs.mkdirSync(SHOPS_DIR, { recursive: true });
}

export function saveShopCatalog(serverHost, catalogData) {
  try {
    const safeHost = String(serverHost || 'default').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const hostFile = path.join(SHOPS_DIR, `${safeHost}.json`);
    const latestFile = path.join(SHOPS_DIR, 'latest.json');
    const payload = JSON.stringify(catalogData, null, 2);

    fs.writeFileSync(hostFile, payload);
    fs.writeFileSync(latestFile, payload);
    return true;
  } catch (err) {
    console.error('Error saving shop catalog:', err);
    return false;
  }
}

export function getShopCatalog(serverHost = null) {
  try {
    if (serverHost) {
      const safeHost = String(serverHost).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      const hostFile = path.join(SHOPS_DIR, `${safeHost}.json`);
      if (fs.existsSync(hostFile)) {
        return JSON.parse(fs.readFileSync(hostFile, 'utf8'));
      }
    }

    const latestFile = path.join(SHOPS_DIR, 'latest.json');
    if (fs.existsSync(latestFile)) {
      return JSON.parse(fs.readFileSync(latestFile, 'utf8'));
    }

    return null;
  } catch (err) {
    console.error('Error loading shop catalog:', err);
    return null;
  }
}

// Multi-Bot Management Storage
export const DEFAULT_BOTS = [
  {
    id: 'bot_aaswaam',
    name: 'Aaswaam',
    username: 'Aaswaam',
    loginPassword: process.env.DEFAULT_PASSWORD || '209801',
    autoLogin: true,
    host: 'paid34.skilloraclouds.com',
    port: 25593,
    version: '1.21.4',
    autoReconnect: true,
    antiAfkEnabled: true,
    antiAfkMode: 'still'
  },
  {
    id: 'bot_monalisa',
    name: 'MONALISA__',
    username: 'MONALISA_99',
    loginPassword: process.env.DEFAULT_PASSWORD || '209801',
    autoLogin: true,
    host: 'paid34.skilloraclouds.com',
    port: 25593,
    version: '1.21.4',
    autoReconnect: true,
    antiAfkEnabled: true,
    antiAfkMode: 'still'
  }
];

export function getBots() {
  try {
    if (!fs.existsSync(BOTS_FILE)) {
      fs.writeFileSync(BOTS_FILE, JSON.stringify(DEFAULT_BOTS, null, 2));
      return [...DEFAULT_BOTS];
    }
    const data = fs.readFileSync(BOTS_FILE, 'utf8').trim();
    if (!data) {
      fs.writeFileSync(BOTS_FILE, JSON.stringify(DEFAULT_BOTS, null, 2));
      return [...DEFAULT_BOTS];
    }
    const list = JSON.parse(data);
    return Array.isArray(list) && list.length > 0 ? list : [...DEFAULT_BOTS];
  } catch (err) {
    console.error('Error reading bots:', err);
    return [...DEFAULT_BOTS];
  }
}

export function getBot(id) {
  const bots = getBots();
  return bots.find(b => b.id === id || b.username.toLowerCase() === String(id).toLowerCase() || (b.name && b.name.toLowerCase() === String(id).toLowerCase())) || null;
}

export function saveBot(botData) {
  try {
    const bots = getBots();
    const id = botData.id || `bot_${String(botData.username || Date.now()).toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
    const existingIndex = bots.findIndex(b => b.id === id || b.username.toLowerCase() === String(botData.username || '').toLowerCase());

    const entry = {
      id,
      name: botData.name || botData.username || 'Bot',
      username: botData.username || 'Bot',
      loginPassword: botData.loginPassword || '209801',
      autoLogin: botData.autoLogin !== false,
      host: botData.host || 'paid34.skilloraclouds.com',
      port: Number(botData.port) || 25593,
      version: botData.version || '1.21.4',
      autoReconnect: botData.autoReconnect !== false,
      antiAfkEnabled: botData.antiAfkEnabled !== false,
      antiAfkMode: botData.antiAfkMode || 'still',
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      bots[existingIndex] = { ...bots[existingIndex], ...entry };
    } else {
      bots.push(entry);
    }

    fs.writeFileSync(BOTS_FILE, JSON.stringify(bots, null, 2));
    return entry;
  } catch (err) {
    console.error('Error saving bot:', err);
    throw err;
  }
}

export function deleteBot(id) {
  try {
    const bots = getBots();
    const cleanId = String(id).toLowerCase();
    const filtered = bots.filter(b => b.id !== id && b.username.toLowerCase() !== cleanId && (!b.name || b.name.toLowerCase() !== cleanId));
    fs.writeFileSync(BOTS_FILE, JSON.stringify(filtered, null, 2));
    return filtered;
  } catch (err) {
    console.error('Error deleting bot:', err);
    throw err;
  }
}

