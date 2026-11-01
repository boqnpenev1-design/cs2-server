// CS2 Dedicated Authoritative Game Server
// Optimized for Render Free-Tier Deployment (WebSocket + HTTP Health Check)

const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';
const startTime = Date.now();

const DUST2_SPAWNS = {
  CT: [
    { x: -5.0, y: -3.56, z: -98.0, yaw: Math.PI },
    { x: -2.0, y: -3.56, z: -96.0, yaw: Math.PI },
    { x: -8.0, y: -3.56, z: -96.0, yaw: Math.PI },
    { x: -5.0, y: -3.56, z: -101.0, yaw: Math.PI },
    { x: -1.0, y: -3.56, z: -100.0, yaw: Math.PI }
  ],
  T: [
    { x: -65.0, y: 7.96, z: 35.0, yaw: 0 },
    { x: -61.0, y: 7.96, z: 33.0, yaw: 0 },
    { x: -69.0, y: 7.96, z: 33.0, yaw: 0 },
    { x: -65.0, y: 7.96, z: 38.0, yaw: 0 },
    { x: -58.0, y: 7.96, z: 36.0, yaw: 0 }
  ]
};

const KILL_REWARDS = {
  knife: 1500,
  // SMGs: $600
  mp9: 600, mac10: 600, mp7: 600, mp5: 600, mp5sd: 600, ump45: 600, p90: 600, bizon: 600,
  // Shotguns: $900
  nova: 900, xm1014: 900, mag7: 900, sawedoff: 900,
  // Rifles: $300
  galil: 300, famas: 300, ak47: 300, m4a4: 300, m4a1s: 300, ssg08: 300, sg553: 300, aug: 300, g3sg1: 300, scar20: 300,
  // Snipers: AWP $100
  awp: 100,
  // Pistols: $300
  glock: 300, usp: 300, usps: 300, p2000: 300, p250: 300, tec9: 300, fiveseven: 300, deagle: 300, cz75: 300, revolver: 300,
  // Special/grenades
  hegrenade: 300, molotov: 300, incgrenade: 300, c4: 0
};

// ============================================================================
// ROOM & MATCH STATE (Authoritative In-Memory Game Simulation)
// ============================================================================

class GameRoom {
  constructor(name = 'dust2') {
    this.name = name;
    this.matchId = crypto.randomBytes(6).toString('hex');
    this.players = new Map(); // id -> PlayerState

    // Match Clock & Phases
    this.phase = 'freeze'; // 'freeze' | 'live' | 'round_over'
    this.phaseTimer = 15;
    this.phaseEndTime = Date.now() + 15000;
    this.currentRound = 1;
    this.maxRounds = 24; // MR12 competitive format
    this.ctScore = 0;
    this.tScore = 0;
    this.consecutiveLosses = { CT: 0, T: 0 };
    this.c4PlantedThisRound = false;

    // C4 Bomb State
    this.c4CarrierId = null;
    this.c4Planted = false;
    this.c4Site = null;
    this.c4Pos = null;
    this.c4PlantTime = 0;
    this.c4ExplodeTime = 0;
    this.c4DefuseProgress = 0;
    this.c4Defuser = null;

    // Dropped Weapons / Utility on Ground
    this.droppedItems = []; // { id, weaponId, x, y, z, droppedAt }

    // Loop Handles (Paused when room is empty to conserve Render sleep quota)
    this.tickInterval = null;
    this.snapshotInterval = null;
    this.idleCheckInterval = null;
  }

  startLoops() {
    if (this.tickInterval) return;

    // 1. Match Logic Tick (1 Hz)
    this.tickInterval = setInterval(() => this.updateClock(), 1000);

    // 2. High-Frequency State Broadcast (25 Hz / 40ms)
    this.snapshotInterval = setInterval(() => this.broadcastSnapshot(), 40);

    // 3. Idle Player Sweep (Checks every 30s for 10min inactivity)
    this.idleCheckInterval = setInterval(() => this.checkIdlePlayers(), 30000);

    console.log(`[ROOM ${this.name}] Simulation loops active. Match ID: ${this.matchId}`);
  }

  stopLoopsIfEmpty() {
    if (this.players.size > 0) return;

    clearInterval(this.tickInterval);
    clearInterval(this.snapshotInterval);
    clearInterval(this.idleCheckInterval);
    this.tickInterval = null;
    this.snapshotInterval = null;
    this.idleCheckInterval = null;

    // Reset room state so memory stays clean
    this.phase = 'freeze';
    this.phaseTimer = 15;
    this.currentRound = 1;
    this.ctScore = 0;
    this.tScore = 0;
    this.c4CarrierId = null;
    this.c4Planted = false;
    this.c4Site = null;
    this.c4Pos = null;
    this.droppedItems = [];

    console.log(`[ROOM ${this.name}] All players disconnected. Simulation suspended to allow Render host sleep.`);
  }

  checkIdlePlayers() {
    const now = Date.now();
    const IDLE_LIMIT = 10 * 60 * 1000; // 10 minutes

    for (const [id, p] of this.players.entries()) {
      if (now - p.lastInputAt > IDLE_LIMIT) {
        console.log(`[IDLE KICK] Player ${p.callsign} (${id}) inactive for 10m. Disconnecting.`);
        try {
          if (p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(JSON.stringify({
              type: 'kicked_idle',
              message: 'DISCONNECTED FOR INACTIVITY'
            }));
            p.ws.close(1000, 'Idle Inactivity');
          }
        } catch (e) {}
        this.removePlayer(id);
      }
    }
  }

  updateClock() {
    if (this.players.size === 0) return;
    const now = Date.now();

    // Check C4 Detonation & Bomb Clock Override
    if (this.c4Planted) {
      const bombRemaining = Math.max(0, Math.ceil((this.c4ExplodeTime - now) / 1000));
      this.phaseTimer = bombRemaining;

      if (now >= this.c4ExplodeTime && this.phase === 'live') {
        this.onBombExploded();
        return;
      }
    } else {
      const remaining = Math.max(0, Math.ceil((this.phaseEndTime - now) / 1000));
      this.phaseTimer = remaining;

      // Phase Transitions
      if (remaining <= 0) {
        if (this.phase === 'freeze') {
          // Freeze time ended -> Go live
          this.phase = 'live';
          this.phaseTimer = 115; // 1:55 live round time
          this.phaseEndTime = now + 115000;
          this.broadcast({
            type: 'phase_change',
            phase: 'live',
            timer: 115,
            phaseEndTime: this.phaseEndTime
          });
        } else if (this.phase === 'live') {
          // Live round expired without bomb plant -> CT wins (or T if no CT players exist)
          const totalCT = Array.from(this.players.values()).filter(p => p.team === 'CT').length;
          const winner = (totalCT > 0) ? 'CT' : 'T';
          this.endRound(winner, 'TARGET_PRESERVED');
        } else if (this.phase === 'round_over') {
          // Next round initiation
          this.startNextRound();
        }
      }
    }

    // Check Elimination Conditions during live phase
    if (this.phase === 'live') {
      const ctAlive = Array.from(this.players.values()).filter(p => p.team === 'CT' && p.isAlive && p.inMatch).length;
      const tAlive = Array.from(this.players.values()).filter(p => p.team === 'T' && p.isAlive && p.inMatch).length;

      // If both teams had players spawn
      const totalCT = Array.from(this.players.values()).filter(p => p.team === 'CT').length;
      const totalT = Array.from(this.players.values()).filter(p => p.team === 'T').length;

      if (totalCT > 0 && totalT > 0) {
        if (ctAlive === 0 && (!this.c4Planted || tAlive > 0)) {
          this.endRound('T', 'COUNTER_TERRORISTS_ELIMINATED');
        } else if (tAlive === 0 && !this.c4Planted) {
          this.endRound('CT', 'TERRORISTS_ELIMINATED');
        }
      }
    }
  }

  startNextRound() {
    this.currentRound++;

    // Check Halftime Swap at Round 13 (MR12: 12 rounds per half)
    if (this.currentRound === 13) {
      this.handleHalftime();
      return;
    }

    // Check Match Point / Game Over
    if (this.ctScore >= 13 || this.tScore >= 13 || this.currentRound > this.maxRounds) {
      this.endMatch();
      return;
    }

    this.setupRoundState();
  }

  handleHalftime() {
    console.log(`[ROOM ${this.name}] Halftime reached! Swapping CT and T teams.`);
    // Swap scores
    const tempScore = this.ctScore;
    this.ctScore = this.tScore;
    this.tScore = tempScore;
    this.consecutiveLosses = { CT: 0, T: 0 };

    // Swap players & reset economy
    for (const p of this.players.values()) {
      if (p.team === 'CT') p.team = 'T';
      else if (p.team === 'T') p.team = 'CT';
      p.money = 800; // Reset pistol round cash
      p.hasHelmet = false;
      p.armor = 0;
      p.purchases = [];
      p.fired = {};
      p.transactions = [{ type: 'halftime', amount: 800, balance: 800, reason: 'Halftime reset', t: Date.now() }];
    }

    this.broadcast({
      type: 'halftime_swap',
      ctScore: this.ctScore,
      tScore: this.tScore,
      round: this.currentRound
    });

    this.setupRoundState();
  }

  setupRoundState() {
    this.phase = 'freeze';
    this.phaseTimer = 15;
    this.phaseEndTime = Date.now() + 15000;
    this.c4Planted = false;
    this.c4PlantedThisRound = false;
    this.c4Site = null;
    this.c4Pos = null;
    this.c4DefuseProgress = 0;
    this.c4Defuser = null;
    this.droppedItems = [];

    // Respawn all in-match players with authentic ground spawns
    const livingTs = [];
    let ctIdx = 0;
    let tIdx = 0;
    for (const p of this.players.values()) {
      p.isAlive = true;
      p.inMatch = true;
      p.health = 100;
      p.hasC4 = false;
      p.purchases = [];
      p.fired = {};
      const teamSpawns = DUST2_SPAWNS[p.team] || DUST2_SPAWNS.T;
      const sIdx = (p.team === 'CT') ? (ctIdx++ % teamSpawns.length) : (tIdx++ % teamSpawns.length);
      const sp = teamSpawns[sIdx];
      p.pos = { x: sp.x, y: sp.y, z: sp.z };
      p.yaw = sp.yaw;
      p.spawnIndex = sIdx;
      if (p.team === 'T') livingTs.push(p);
    }

    // Allocate C4 to exactly ONE living Terrorist
    if (livingTs.length > 0) {
      const luckyT = livingTs[Math.floor(Math.random() * livingTs.length)];
      luckyT.hasC4 = true;
      this.c4CarrierId = luckyT.id;
    } else {
      this.c4CarrierId = null;
    }

    this.broadcast({
      type: 'round_start',
      round: this.currentRound,
      phase: 'freeze',
      timer: 15,
      phaseEndTime: this.phaseEndTime,
      ctScore: this.ctScore,
      tScore: this.tScore,
      c4CarrierId: this.c4CarrierId
    });
  }

  endRound(winnerTeam, reason) {
    if (this.phase === 'round_over') return;

    this.phase = 'round_over';
    this.phaseTimer = 5;
    this.phaseEndTime = Date.now() + 5000;

    if (winnerTeam === 'CT') {
      this.ctScore++;
      this.consecutiveLosses.CT = 0;
      this.consecutiveLosses.T++;
    } else if (winnerTeam === 'T') {
      this.tScore++;
      this.consecutiveLosses.T = 0;
      this.consecutiveLosses.CT++;
    }

    // Calculate MVP of this round
    let roundMvp = null;
    let maxDamage = -1;
    for (const p of this.players.values()) {
      if (p.team === winnerTeam && p.roundDamage > maxDamage && p.roundDamage > 0) {
        maxDamage = p.roundDamage;
        roundMvp = { name: p.callsign, reason: `most damage dealt (${p.roundDamage} dmg)` };
      }
    }

    // Economic rewards (CS2 authentic economy: win $3250, loss $1400+$500/streak max $3400, plant reward $800, cap $16000)
    for (const p of this.players.values()) {
      p.roundDamage = 0;
      p.transactions = p.transactions || [];
      if (p.team === winnerTeam) {
        p.money = Math.min(16000, p.money + 3250);
        p.transactions.push({
          type: 'round_win',
          amount: 3250,
          balance: p.money,
          reason: 'Round win bonus',
          t: Date.now()
        });
      } else {
        const streak = this.consecutiveLosses[p.team] || 1;
        const priorLosses = Math.max(0, Math.min(4, streak - 1));
        let lossBonus = 1400 + priorLosses * 500;
        if (lossBonus > 3400) lossBonus = 3400;

        let totalBonus = lossBonus;
        let reasonStr = `Round loss (streak ${streak}: $${lossBonus})`;
        if (p.team === 'T' && this.c4PlantedThisRound) {
          totalBonus += 800;
          reasonStr += ' + Bomb plant ($800)';
        }
        p.money = Math.min(16000, p.money + totalBonus);
        p.transactions.push({
          type: 'round_loss',
          amount: totalBonus,
          balance: p.money,
          reason: reasonStr,
          t: Date.now()
        });
      }
      if (p.transactions.length > 20) p.transactions.shift();
    }

    this.broadcast({
      type: 'round_end',
      winner: winnerTeam,
      reason: reason,
      ctScore: this.ctScore,
      tScore: this.tScore,
      round: this.currentRound,
      mvp: roundMvp
    });
  }

  onBombExploded() {
    this.c4Planted = false;
    const bombPos = this.c4Pos || { x: 0, y: 0, z: 0 };
    this.broadcast({
      type: 'bomb_exploded',
      pos: bombPos
    });

    // Authoritative explosion damage calculation for all alive players
    for (const player of this.players.values()) {
      if (player.isAlive && player.pos) {
        const dx = player.pos.x - bombPos.x;
        const dy = player.pos.y - bombPos.y;
        const dz = player.pos.z - bombPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 50) {
          const factor = Math.pow(Math.max(0, 1 - dist / 50), 1.5);
          const blastDamage = Math.round(500 * factor);
          player.hp = Math.max(0, player.hp - blastDamage);
          if (player.hp <= 0) {
            player.isAlive = false;
            player.deaths++;
            this.broadcast({
              type: 'player_killed',
              attackerId: this.c4CarrierId || 'c4',
              attackerName: 'C4 Explosive',
              attackerTeam: 'T',
              victimId: player.id,
              victimName: player.callsign,
              victimTeam: player.team,
              weapon: 'c4',
              isHeadshot: false
            });
          }
        }
      }
    }

    this.endRound('T', 'TARGET_DESTROYED');
  }

  onBombDefused(defuserId) {
    this.c4Planted = false;
    const defuser = this.players.get(defuserId);
    if (defuser) {
      defuser.money = Math.min(16000, defuser.money + 300);
      defuser.transactions = defuser.transactions || [];
      defuser.transactions.push({
        type: 'defuse',
        amount: 300,
        balance: defuser.money,
        reason: 'Bomb defusal reward',
        t: Date.now()
      });
      if (defuser.transactions.length > 20) defuser.transactions.shift();
    }

    this.broadcast({
      type: 'bomb_defused',
      defuserId: defuserId,
      defuserName: defuser ? defuser.callsign : 'Counter-Terrorist'
    });
    this.endRound('CT', 'BOMB_DEFUSED');
  }

  endMatch() {
    const winner = (this.ctScore > this.tScore) ? 'CT' : (this.tScore > this.ctScore ? 'T' : 'TIE');
    this.broadcast({
      type: 'match_over',
      winner: winner,
      ctScore: this.ctScore,
      tScore: this.tScore
    });

    setTimeout(() => {
      // Re-initialize a fresh match with a new matchId
      this.matchId = crypto.randomBytes(6).toString('hex');
      this.currentRound = 1;
      this.ctScore = 0;
      this.tScore = 0;
      this.setupRoundState();
    }, 7000);
  }

  broadcast(packet, excludeWs = null) {
    const data = JSON.stringify(packet);
    for (const p of this.players.values()) {
      if (p.ws !== excludeWs && p.ws.readyState === WebSocket.OPEN) {
        p.ws.send(data);
      }
    }
  }

  broadcastSnapshot() {
    if (this.players.size === 0) return;

    const playersData = [];
    for (const [id, p] of this.players.entries()) {
      playersData.push({
        id: id,
        callsign: p.callsign,
        team: p.team,
        isAlive: p.isAlive,
        inMatch: p.inMatch,
        health: p.health,
        pos: p.pos,
        yaw: p.yaw,
        pitch: p.pitch,
        crouch: p.crouch,
        weapon: p.activeWeapon,
        hasC4: p.hasC4,
        kills: p.kills,
        deaths: p.deaths,
        money: p.money,
        transactions: p.transactions ? p.transactions.slice(-5) : []
      });
    }

    const snapshot = {
      type: 'snapshot',
      t: Date.now(),
      phase: this.phase,
      timer: this.phaseTimer,
      ctScore: this.ctScore,
      tScore: this.tScore,
      round: this.currentRound,
      c4Planted: this.c4Planted,
      c4Pos: this.c4Pos,
      c4Site: this.c4Site,
      players: playersData
    };

    this.broadcast(snapshot);
  }

  addPlayer(id, ws, callsign, team = 'CT') {
    const isFirstPlayer = (this.players.size === 0);
    const cleanCallsign = (typeof callsign === 'string' && callsign.trim().length >= 2)
      ? callsign.trim().substring(0, 16).replace(/[<>&"']/g, '')
      : `Agent_${id.substring(0, 5)}`;

    if (isFirstPlayer) {
      // First player entering empty room: restart fresh match freeze phase immediately
      this.currentRound = 1;
      this.ctScore = 0;
      this.tScore = 0;
      this.phase = 'freeze';
      this.phaseTimer = 15;
      this.phaseEndTime = Date.now() + 15000;
      this.c4Planted = false;
      this.c4CarrierId = (team === 'T') ? id : null;
      this.c4Pos = null;
      this.c4Site = null;
      this.droppedItems = [];
    }

    const shouldSpawn = isFirstPlayer || (this.phase === 'freeze');

    // Auto-balance teams: first player T, second CT, keeping counts balanced
    let tCount = 0;
    let ctCount = 0;
    for (const p of this.players.values()) {
      if (p.team === 'T') tCount++;
      else ctCount++;
    }

    let assignedTeam = (team === 'T') ? 'T' : 'CT';
    if (this.players.size === 0) {
      assignedTeam = 'T'; // First player is Terrorist
    } else if (this.players.size === 1) {
      const firstPlayer = Array.from(this.players.values())[0];
      assignedTeam = (firstPlayer.team === 'T') ? 'CT' : 'T'; // Second player opposes first
    } else {
      if (tCount < ctCount) assignedTeam = 'T';
      else if (ctCount < tCount) assignedTeam = 'CT';
    }

    const playerTeam = assignedTeam;
    const teamSpawns = DUST2_SPAWNS[playerTeam] || DUST2_SPAWNS.T;
    const initialSpawn = teamSpawns[0];

    const player = {
      id: id,
      ws: ws,
      callsign: cleanCallsign,
      team: playerTeam,
      inMatch: shouldSpawn,
      isAlive: shouldSpawn,
      health: 100,
      armor: 0,
      hasHelmet: false,
      money: 800,
      purchases: [],
      transactions: [{ type: 'init', amount: 800, balance: 800, reason: 'Initial money', t: Date.now() }],
      fired: {},
      kills: 0,
      deaths: 0,
      roundDamage: 0,
      activeWeapon: 'knife',
      hasC4: (playerTeam === 'T' && (isFirstPlayer || (!this.c4CarrierId && !this.c4Planted))),
      pos: { x: initialSpawn.x, y: initialSpawn.y, z: initialSpawn.z },
      yaw: initialSpawn.yaw,
      pitch: 0,
      spawnIndex: 0,
      crouch: false,
      lastInputAt: Date.now()
    };

    if (player.hasC4) {
      this.c4CarrierId = id;
    }

    this.players.set(id, player);
    this.startLoops();

    // Send full match sync to joining player
    ws.send(JSON.stringify({
      type: 'match_sync',
      matchId: this.matchId,
      playerId: id,
      callsign: player.callsign,
      team: player.team,
      phase: this.phase,
      phaseTimer: this.phaseTimer,
      phaseEndTime: this.phaseEndTime,
      currentRound: this.currentRound,
      ctScore: this.ctScore,
      tScore: this.tScore,
      c4Planted: this.c4Planted,
      c4Site: this.c4Site,
      c4Pos: this.c4Pos,
      c4CarrierId: this.c4CarrierId,
      inMatch: player.inMatch
    }));

    // Notify other players
    this.broadcast({
      type: 'player_joined',
      player: {
        id: id,
        callsign: player.callsign,
        team: player.team,
        inMatch: player.inMatch
      }
    }, ws);

    console.log(`[CONNECT] ${player.callsign} (${id}) joined team ${player.team}. Active players: ${this.players.size}`);
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;

    // If carrying C4, drop on ground
    if (p.hasC4 && !this.c4Planted) {
      this.droppedItems.push({
        id: `c4_drop_${Date.now()}`,
        weaponId: 'c4',
        x: p.pos.x,
        y: p.pos.y,
        z: p.pos.z,
        droppedAt: Date.now()
      });
      this.c4CarrierId = null;
      this.broadcast({
        type: 'c4_dropped',
        pos: p.pos
      });
    }

    this.players.delete(id);
    this.broadcast({
      type: 'player_left',
      id: id,
      callsign: p.callsign
    });

    console.log(`[DISCONNECT] ${p.callsign} (${id}) left. Remaining players: ${this.players.size}`);
    this.stopLoopsIfEmpty();
  }
}

// Global Room Instance
const dust2Room = new GameRoom('dust2');

// ============================================================================
// HTTP SERVER (Health Check & Render Keep-Alive / Wake-up Verification)
// ============================================================================

const server = http.createServer((req, res) => {
  // CORS Headers for GitHub Pages integration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url ? req.url.split('?')[0] : '/';

  if (url === '/health' || url === '/') {
    const status = {
      ok: true,
      service: 'cs2-server',
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      matchId: dust2Room.matchId,
      players: dust2Room.players.size,
      round: dust2Room.currentRound,
      phase: dust2Room.phase
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

// ============================================================================
// WEBSOCKET SERVER & CLIENT VERIFICATION
// ============================================================================

function verifyClient(info, callback) {
  const origin = info.origin || info.req.headers.origin;
  const allowed = process.env.ALLOWED_ORIGIN || '';

  // Local testing always permitted
  if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1') || origin.startsWith('https://localhost')) {
    return callback(true);
  }

  // Production Origin Validation
  if (allowed && (origin === allowed || origin === allowed.replace(/\/$/, ''))) {
    return callback(true);
  }

  // GitHub Pages domain allowance
  if (origin.includes('github.io')) {
    return callback(true);
  }

  // Permissive fallback so initial deploy is not blocked before ALLOWED_ORIGIN is configured
  callback(true);
}

const wss = new WebSocketServer({
  server,
  verifyClient
});

wss.on('connection', (ws, req) => {
  const playerId = 'p_' + crypto.randomBytes(4).toString('hex');
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (message) => {
    let packet;
    try {
      packet = JSON.parse(message);
    } catch (e) {
      return;
    }

    const player = dust2Room.players.get(playerId);

    switch (packet.type) {
      case 'join':
        dust2Room.addPlayer(playerId, ws, packet.callsign, packet.team);
        break;

      case 'player_input':
        if (player) {
          player.lastInputAt = Date.now();
          if (packet.pos) player.pos = packet.pos;
          if (packet.yaw !== undefined) player.yaw = packet.yaw;
          if (packet.pitch !== undefined) player.pitch = packet.pitch;
          if (packet.crouch !== undefined) player.crouch = !!packet.crouch;
          if (packet.weapon) player.activeWeapon = packet.weapon;
        }
        break;

      case 'select_team':
        if (player) {
          player.lastInputAt = Date.now();
          const targetTeam = (packet.team === 'T') ? 'T' : 'CT';
          let otherT = 0, otherCT = 0;
          for (const [pId, p] of dust2Room.players.entries()) {
            if (pId !== playerId) {
              if (p.team === 'T') otherT++;
              else otherCT++;
            }
          }
          const wouldBeT = (targetTeam === 'T') ? otherT + 1 : otherT;
          const wouldBeCT = (targetTeam === 'CT') ? otherCT + 1 : otherCT;
          // Only permit change if team sizes remain balanced
          if (Math.abs(wouldBeT - wouldBeCT) <= 1 || (otherT === 0 && otherCT === 0)) {
            player.team = targetTeam;
            dust2Room.broadcast({
              type: 'team_swapped',
              id: playerId,
              team: player.team
            });
          }
        }
        break;

      case 'buy_item':
        if (!player) break;
        player.lastInputAt = Date.now();
        const cost = Number(packet.cost) || 0;
        const buyWepId = packet.weaponId;
        if (dust2Room.phase !== 'freeze') {
          ws.send(JSON.stringify({
            type: 'buy_error',
            weaponId: buyWepId,
            reason: 'Can only purchase during freeze time'
          }));
          break;
        }
        if (player.money < cost || cost <= 0) {
          ws.send(JSON.stringify({
            type: 'buy_error',
            weaponId: buyWepId,
            reason: 'Insufficient funds'
          }));
          break;
        }
        player.money -= cost;
        player.activeWeapon = buyWepId || player.activeWeapon;
        player.purchases = player.purchases || [];
        player.transactions = player.transactions || [];
        const purchase = {
          id: `purch_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          weaponId: buyWepId,
          cost: cost,
          slot: packet.slot || 1,
          round: dust2Room.currentRound,
          dropped: false,
          fired: false,
          refunded: false,
          timestamp: Date.now()
        };
        player.purchases.push(purchase);
        player.transactions.push({
          type: 'buy',
          amount: -cost,
          balance: player.money,
          reason: `Bought ${buyWepId}`,
          t: Date.now()
        });
        if (player.transactions.length > 20) player.transactions.shift();
        ws.send(JSON.stringify({
          type: 'buy_success',
          weaponId: buyWepId,
          cost: cost,
          slot: packet.slot || 1,
          remainingMoney: player.money,
          transactions: player.transactions.slice(-5)
        }));
        break;

      case 'refund_item':
        if (!player) break;
        player.lastInputAt = Date.now();
        const refWepId = packet.weaponId;
        if (dust2Room.phase !== 'freeze') {
          ws.send(JSON.stringify({
            type: 'refund_error',
            weaponId: refWepId,
            reason: 'Refunds only allowed during freeze time'
          }));
          break;
        }
        player.purchases = player.purchases || [];
        player.fired = player.fired || {};
        const eligIdx = player.purchases.findIndex(p =>
          p.weaponId === refWepId &&
          p.round === dust2Room.currentRound &&
          !p.refunded
        );
        if (eligIdx === -1) {
          ws.send(JSON.stringify({
            type: 'refund_error',
            weaponId: refWepId,
            reason: 'No eligible purchase this round'
          }));
          break;
        }
        const elig = player.purchases[eligIdx];
        if (elig.dropped) {
          ws.send(JSON.stringify({
            type: 'refund_error',
            weaponId: refWepId,
            reason: 'Cannot refund dropped weapon'
          }));
          break;
        }
        if (elig.fired || player.fired[refWepId]) {
          ws.send(JSON.stringify({
            type: 'refund_error',
            weaponId: refWepId,
            reason: 'Cannot refund weapon after firing'
          }));
          break;
        }
        elig.refunded = true;
        player.money = Math.min(16000, player.money + elig.cost);
        player.transactions = player.transactions || [];
        player.transactions.push({
          type: 'refund',
          amount: elig.cost,
          balance: player.money,
          reason: `Refunded ${refWepId}`,
          t: Date.now()
        });
        if (player.transactions.length > 20) player.transactions.shift();
        ws.send(JSON.stringify({
          type: 'refund_success',
          weaponId: refWepId,
          refundAmount: elig.cost,
          remainingMoney: player.money,
          slot: elig.slot,
          transactions: player.transactions.slice(-5)
        }));
        break;

      case 'weapon_fired':
        if (player && packet.weaponId) {
          player.fired = player.fired || {};
          player.fired[packet.weaponId] = true;
          if (player.purchases) {
            const pObj = player.purchases.find(p => p.weaponId === packet.weaponId && !p.refunded);
            if (pObj) pObj.fired = true;
          }
        }
        break;

      case 'plant_c4':
        if (player && player.isAlive && (player.hasC4 || player.team === 'T') && !dust2Room.c4Planted) {
          player.lastInputAt = Date.now();
          dust2Room.c4Planted = true;
          dust2Room.c4CarrierId = null;
          player.hasC4 = false;
          dust2Room.c4Site = packet.site || 'A';
          dust2Room.c4Pos = packet.pos || player.pos;
          dust2Room.c4PlantTime = Date.now();
          dust2Room.c4ExplodeTime = Date.now() + 40000; // 40s authentic C4 timer

          dust2Room.broadcast({
            type: 'c4_planted',
            site: dust2Room.c4Site,
            pos: dust2Room.c4Pos,
            planterId: playerId,
            planterName: player.callsign,
            explodeTime: dust2Room.c4ExplodeTime
          });
        }
        break;

      case 'defuse_progress':
        if (player && player.isAlive && player.team === 'CT' && dust2Room.c4Planted) {
          player.lastInputAt = Date.now();
          const progress = Number(packet.progress) || 0;
          dust2Room.c4DefuseProgress = progress;
          dust2Room.c4Defuser = playerId;

          dust2Room.broadcast({
            type: 'defuse_progress_sync',
            defuserId: playerId,
            progress: progress
          });

          if (progress >= 1.0) {
            dust2Room.onBombDefused(playerId);
          }
        }
        break;

      case 'damage_hit':
        if (player && player.isAlive) {
          player.lastInputAt = Date.now();
          const target = dust2Room.players.get(packet.targetId);
          if (target && target.isAlive && target.team !== player.team) {
            const wepKey = String(packet.weapon || player.activeWeapon || 'ak47').toLowerCase();
            player.fired = player.fired || {};
            player.fired[wepKey] = true;
            if (player.purchases) {
              const pObj = player.purchases.find(p => p.weaponId === wepKey && !p.refunded);
              if (pObj) pObj.fired = true;
            }

            const dmg = Math.max(1, Math.min(120, Number(packet.damage) || 20));
            target.health = Math.max(0, target.health - dmg);
            player.roundDamage += dmg;

            dust2Room.broadcast({
              type: 'player_damaged',
              targetId: target.id,
              attackerId: player.id,
              health: target.health,
              damage: dmg
            });

            if (target.health <= 0) {
              target.isAlive = false;
              target.deaths++;
              player.kills++;
              const reward = (KILL_REWARDS[wepKey] !== undefined) ? KILL_REWARDS[wepKey] : 300;
              player.money = Math.min(16000, player.money + reward);
              player.transactions = player.transactions || [];
              player.transactions.push({
                type: 'kill',
                amount: reward,
                balance: player.money,
                reason: `Kill with ${wepKey} (+$${reward})`,
                t: Date.now()
              });
              if (player.transactions.length > 20) player.transactions.shift();

              // If target was carrying C4, drop on ground
              if (target.hasC4) {
                target.hasC4 = false;
                dust2Room.c4CarrierId = null;
                dust2Room.broadcast({
                  type: 'c4_dropped',
                  pos: target.pos
                });
              }

              dust2Room.broadcast({
                type: 'player_killed',
                victimId: target.id,
                victimName: target.callsign,
                attackerId: player.id,
                attackerName: player.callsign,
                weapon: packet.weapon || player.activeWeapon,
                isHeadshot: !!packet.isHeadshot
              });
            }
          }
        }
        break;

      case 'drop_weapon':
        if (player && player.isAlive && packet.weaponId) {
          player.lastInputAt = Date.now();
          if (player.purchases) {
            const pObj = player.purchases.slice().reverse().find(p => p.weaponId === packet.weaponId && !p.refunded && !p.dropped);
            if (pObj) pObj.dropped = true;
          }
          const dropItem = {
            id: `drop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            weaponId: packet.weaponId,
            slot: packet.slot || 1,
            pos: packet.pos || player.pos,
            droppedBy: player.id
          };
          dust2Room.droppedItems.push(dropItem);
          dust2Room.broadcast({
            type: 'item_dropped',
            item: dropItem
          });
        }
        break;

      case 'pickup_weapon':
        if (player && player.isAlive && packet.weaponId) {
          player.lastInputAt = Date.now();
          const idx = dust2Room.droppedItems.findIndex(d => d.weaponId === packet.weaponId);
          if (idx !== -1) {
            const picked = dust2Room.droppedItems.splice(idx, 1)[0];
            dust2Room.broadcast({
              type: 'item_picked_up',
              itemId: picked.id,
              weaponId: picked.weaponId,
              pickerId: player.id
            });
          }
        }
        break;

      case 'pickup_c4':
        if (player && player.isAlive && player.team === 'T' && !dust2Room.c4Planted && !dust2Room.c4CarrierId) {
          player.lastInputAt = Date.now();
          player.hasC4 = true;
          dust2Room.c4CarrierId = player.id;
          dust2Room.broadcast({
            type: 'c4_picked_up',
            carrierId: player.id,
            carrierName: player.callsign
          });
        }
        break;

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', t: Date.now() }));
        break;
    }
  });

  ws.on('close', () => {
    dust2Room.removePlayer(playerId);
  });

  ws.on('error', (err) => {
    console.warn(`[SOCKET ERROR] ${playerId}:`, err.message);
  });
});

// Periodic WebSocket Connection Heartbeat (20s)
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 20000);

wss.on('close', () => {
  clearInterval(pingInterval);
});

// ============================================================================
// START SERVER
// ============================================================================

server.listen(PORT, HOST, () => {
  console.log(`================================================================`);
  console.log(`CS2 DEDICATED WEBSOCKET SERVER ACTIVE`);
  console.log(`Listening on http://${HOST}:${PORT} (ws://${HOST}:${PORT})`);
  console.log(`Health Check: GET http://${HOST}:${PORT}/health`);
  console.log(`Allowed Origin: ${process.env.ALLOWED_ORIGIN || 'Any (Permissive)'}`);
  console.log(`================================================================`);
});

