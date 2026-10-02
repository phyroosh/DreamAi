# Minecraft AFK Bot with Web Dashboard

A robust, lightweight Minecraft AFK bot powered by **Mineflayer** and an interactive real-time **Web Dashboard** (Express + Socket.io). Designed specifically for offline/cracked servers, featuring automatic `/login <password>` execution, customizable Anti-AFK human simulation (arm swings, head rotations, jumps), and 1-click server bookmarking.

---

## ⚡ Features

- **Cracked & Offline Server Support**: Connects seamlessly with `auth: 'offline'`.
- **Auto-Login**: Automatically runs `/login 209801` (or your configured password) upon spawning into cracked servers with AuthMe or similar auth plugins.
- **Human Anti-AFK Simulation**:
  - Arm swinging (periodic hand movements).
  - Natural head turning (subtle pitch & yaw shifts).
  - Optional small jumps or sneaks.
  - ±25% random interval jitter to avoid bot pattern detectors.
- **Manual Server Entry & 1-Click Join**: No default server forced. Enter your server IP/port and click "Bookmark Server" to save it for instant 1-click connection next time.
- **Real-Time Web Dashboard**:
  - Live connection status & uptime.
  - Bot health & hunger gauges.
  - Real-time in-game coordinates (X, Y, Z).
  - In-game chat stream and command terminal (send `/msg`, `/spawn`, etc.).
  - Manual action buttons (Swing, Look, Jump).

---

## 🚀 Quick Start

1. **Install dependencies** (already done):
   ```bash
   npm install
   ```

2. **Start the Dashboard**:
   ```bash
   npm start
   ```

3. **Open the Dashboard**:
   Open [http://localhost:3000](http://localhost:3000) in your web browser.

4. **Connect to Your Server**:
   - Enter your server IP/hostname and Port.
   - Set your desired bot username.
   - Verify the login password is set to `209801`.
   - Click **Connect Bot** or **Bookmark Server** for 1-click join!
