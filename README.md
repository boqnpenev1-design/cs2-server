# CS2 Browser Edition — Dedicated Game Server

Authoritative Node.js WebSocket game server for Counter-Strike 2 Browser Edition. Engineered for zero-cost hosting on Render's free tier with automated sleep management and idle-disconnect safety.

---

## Architecture & Features

- **Authoritative State Engine**: Owns the round clock, phase transitions (Freeze, Live, Round Over), scores, halftime swap at round 12, bomb planting/defusing timers, and damage validation.
- **Sleep & Free-Tier Optimization**:
  - Automatically shuts down internal tick intervals and snapshot loops when room is empty (0 players), allowing Render to sleep and preserve free monthly hours.
  - Automatically kicks idle clients after 10 minutes of zero user input with `{ type: 'kicked_idle' }`, preventing abandoned tabs from burning host uptime.
  - Generates a fresh `matchId` per process startup so reconnecting clients seamlessly reset match state.
- **Health Verification**: Responds to `GET /health` with `200 OK` and live JSON statistics (`uptimeSeconds`, `players`, `round`, `matchId`).

---

## Render Free Tier Deployment Instructions

1. **Push to GitHub**:
   - Ensure `server.js`, `package.json`, `.gitignore`, and `README.md` are committed to the root of your `cs2-server` repository on GitHub.
   - Example commands:
     ```bash
     git add .
     git commit -m "Initial CS2 server release"
     git branch -M main
     git remote add origin https://github.com/<your-username>/cs2-server.git
     git push -u origin main
     ```

2. **Create Web Service on Render**:
   - Log in to your Render dashboard: [dashboard.render.com](https://dashboard.render.com)
   - Click **New +** -> **Web Service**.
   - Select **Build and deploy from a Git repository** and connect your `cs2-server` repo.

3. **Configure Service Settings**:
   - **Name**: `cs2-server` (or any name you choose; your URL will be `https://<service-name>.onrender.com`)
   - **Region**: Closest to your players (e.g. Frankfurt, Ohio, Oregon)
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free` ($0/month)

4. **Environment Variables**:
   Under **Advanced** -> **Add Environment Variable**:
   - Key: `ALLOWED_ORIGIN`
   - Value: `https://<your-username>.github.io` (e.g., `https://boqnpenev1-design.github.io`)

5. **Health Check Path**:
   Under **Advanced** -> **Health Check Path**:
   - Set to `/health`

6. **Deploy**:
   - Click **Create Web Service**.
   - Render will build and deploy the container. Once deployed, note your service address (e.g. `wss://cs2-server.onrender.com`).

