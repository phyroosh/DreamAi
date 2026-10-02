import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import * as storage from './storage.js';
import { BotManager } from './botManager.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || process.env.DASHBOARD_PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Initialize Bot Manager
const botManager = new BotManager(storage);

// Process-level guards against unexpected library-level network drops
process.on('uncaughtException', (err) => {
  console.warn('[Server Guard] Caught exception:', err.message);
  botManager.emit('log', { type: 'error', text: `Connection/Network error: ${err.message}` });
  botManager.cleanup();
});

process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || String(reason);
  console.warn('[Server Guard] Unhandled rejection:', msg);
  botManager.emit('log', { type: 'error', text: `Connection rejection: ${msg}` });
  botManager.cleanup();
});

// Wire Bot Events to WebSockets
botManager.on('status', (status) => io.emit('bot:status', status));
botManager.on('chat', (msg) => io.emit('bot:chat', msg));
botManager.on('log', (log) => io.emit('bot:log', log));
botManager.on('settings', (settings) => io.emit('bot:settings', settings));

// API Routes
app.get('/api/status', (req, res) => {
  res.json(botManager.getStatus());
});

app.get('/api/servers', (req, res) => {
  res.json(storage.getSavedServers());
});

app.post('/api/servers', (req, res) => {
  try {
    const saved = storage.saveServer(req.body);
    io.emit('servers:updated', storage.getSavedServers());
    res.json({ success: true, server: saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/servers/:id', (req, res) => {
  try {
    const remaining = storage.deleteServer(req.params.id);
    io.emit('servers:updated', remaining);
    res.json({ success: true, servers: remaining });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/settings', (req, res) => {
  res.json(storage.getSettings());
});

app.post('/api/settings', (req, res) => {
  try {
    botManager.updateSettings(req.body);
    res.json({ success: true, settings: botManager.settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bot/connect', (req, res) => {
  try {
    const { host, port, username, version, loginPassword, autoLogin } = req.body;
    if (!host) {
      return res.status(400).json({ error: 'Server host is required' });
    }
    botManager.connect({ host, port, username, version, loginPassword, autoLogin });
    res.json({ success: true, message: 'Connection initiated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bot/disconnect', (req, res) => {
  try {
    botManager.disconnect();
    res.json({ success: true, message: 'Disconnected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bot/action', (req, res) => {
  try {
    const { action } = req.body;
    botManager.manualAction(action);
    res.json({ success: true, action });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/bot/chat', (req, res) => {
  try {
    const { message } = req.body;
    botManager.sendChat(message);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Socket.io Connection
io.on('connection', (socket) => {
  // Send initial state on connection
  socket.emit('bot:status', botManager.getStatus());
  socket.emit('servers:updated', storage.getSavedServers());
  socket.emit('bot:settings', storage.getSettings());

  socket.on('bot:connect', (data) => botManager.connect(data));
  socket.on('bot:disconnect', () => botManager.disconnect());
  socket.on('bot:action', (action) => {
    try {
      botManager.manualAction(action);
    } catch (e) {
      socket.emit('bot:log', { type: 'error', text: e.message });
    }
  });
  socket.on('bot:chat', (msg) => {
    try {
      botManager.sendChat(msg);
    } catch (e) {
      socket.emit('bot:log', { type: 'error', text: e.message });
    }
  });
  socket.on('settings:update', (data) => botManager.updateSettings(data));
});

server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(` Minecraft AFK Bot Dashboard running!`);
  console.log(` Web UI: http://localhost:${PORT}`);
  console.log(`===============================================`);
});
