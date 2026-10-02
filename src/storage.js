import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const SERVERS_FILE = path.join(DATA_DIR, 'servers.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial settings default
const DEFAULT_SETTINGS = {
  defaultUsername: 'AFK_Bot',
  defaultPassword: '209801',
  autoLogin: true,
  antiAfkEnabled: true,
  antiAfkIntervalSec: 10,
  antiAfkActions: {
    swingArm: true,
    lookAround: true,
    jump: false,
    sneak: false
  },
  autoReconnect: true,
  autoReconnectDelaySec: 5
};

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
    return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
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
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2));
    return updated;
  } catch (err) {
    console.error('Error saving settings:', err);
    throw err;
  }
}

export function getSavedServers() {
  try {
    if (!fs.existsSync(SERVERS_FILE)) {
      fs.writeFileSync(SERVERS_FILE, JSON.stringify([], null, 2));
      return [];
    }
    const data = fs.readFileSync(SERVERS_FILE, 'utf8').trim();
    if (!data) return [];
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading servers:', err);
    return [];
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
