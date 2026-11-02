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

// ============================================================================
// AUTHORITATIVE WEAPON & COMBAT REGISTRY
// ============================================================================
const WEAPON_REGISTRY = {
  // Pistols (Slot 2)
  glock:        { price: 200,  team: 'T',   slot: 2, reward: 300,  damage: 28,  fireRate: 150, headshotMult: 4.0 },
  usp:          { price: 200,  team: 'CT',  slot: 2, reward: 300,  damage: 35,  fireRate: 170, headshotMult: 4.0 },
  usps:         { price: 200,  team: 'CT',  slot: 2, reward: 300,  damage: 35,  fireRate: 170, headshotMult: 4.0 },
  p250:         { price: 300,  team: 'ANY', slot: 2, reward: 300,  damage: 38,  fireRate: 150, headshotMult: 4.0 },
  deagle:       { price: 700,  team: 'ANY', slot: 2, reward: 300,  damage: 63,  fireRate: 260, headshotMult: 4.0 },
  tec9:         { price: 500,  team: 'T',   slot: 2, reward: 300,  damage: 33,  fireRate: 120, headshotMult: 4.0 },
  fiveseven:    { price: 500,  team: 'CT',  slot: 2, reward: 300,  damage: 32,  fireRate: 150, headshotMult: 4.0 },
  cz75:         { price: 500,  team: 'ANY', slot: 2, reward: 100,  damage: 31,  fireRate: 100, headshotMult: 4.0 },
  dualberettas: { price: 400,  team: 'ANY', slot: 2, reward: 300,  damage: 38,  fireRate: 120, headshotMult: 4.0 },
  revolver:     { price: 600,  team: 'ANY', slot: 2, reward: 300,  damage: 86,  fireRate: 400, headshotMult: 4.0 },

  // Rifles (Slot 1)
  ak47:         { price: 2700, team: 'T',   slot: 1, reward: 300,  damage: 36,  fireRate: 100, headshotMult: 4.0 },
  m4a4:         { price: 3100, team: 'CT',  slot: 1, reward: 300,  damage: 33,  fireRate: 90,  headshotMult: 4.0 },
  m4a1:         { price: 2900, team: 'CT',  slot: 1, reward: 300,  damage: 38,  fireRate: 100, headshotMult: 4.0 },
  m4a1s:        { price: 2900, team: 'CT',  slot: 1, reward: 300,  damage: 38,  fireRate: 100, headshotMult: 4.0 },
  galil:        { price: 1800, team: 'T',   slot: 1, reward: 300,  damage: 30,  fireRate: 90,  headshotMult: 4.0 },
  famas:        { price: 2050, team: 'CT',  slot: 1, reward: 300,  damage: 30,  fireRate: 90,  headshotMult: 4.0 },
  aug:          { price: 3300, team: 'CT',  slot: 1, reward: 300,  damage: 28,  fireRate: 90,  headshotMult: 4.0 },
  sg553:        { price: 3000, team: 'T',   slot: 1, reward: 300,  damage: 30,  fireRate: 90,  headshotMult: 4.0 },

  // Snipers (Slot 1)
  awp:          { price: 4750, team: 'ANY', slot: 1, reward: 100,  damage: 115, fireRate: 1450, headshotMult: 4.0 },
  ssg08:        { price: 1700, team: 'ANY', slot: 1, reward: 300,  damage: 88,  fireRate: 1250, headshotMult: 4.0 },
  g3sg1:        { price: 5000, team: 'T',   slot: 1, reward: 300,  damage: 80,  fireRate: 250, headshotMult: 4.0 },
  scar20:       { price: 5000, team: 'CT',  slot: 1, reward: 300,  damage: 80,  fireRate: 250, headshotMult: 4.0 },

  // SMGs (Slot 1 - $600 reward)
  mac10:        { price: 1050, team: 'T',   slot: 1, reward: 600,  damage: 29,  fireRate: 75,  headshotMult: 4.0 },
  mp9:          { price: 1250, team: 'CT',  slot: 1, reward: 600,  damage: 26,  fireRate: 70,  headshotMult: 4.0 },
  mp7:          { price: 1500, team: 'ANY', slot: 1, reward: 600,  damage: 29,  fireRate: 80,  headshotMult: 4.0 },
  mp5:          { price: 1500, team: 'ANY', slot: 1, reward: 600,  damage: 27,  fireRate: 80,  headshotMult: 4.0 },
  mp5sd:        { price: 1500, team: 'ANY', slot: 1, reward: 600,  damage: 27,  fireRate: 80,  headshotMult: 4.0 },
  ump45:        { price: 1200, team: 'ANY', slot: 1, reward: 600,  damage: 35,  fireRate: 90,  headshotMult: 4.0 },
  p90:          { price: 2350, team: 'ANY', slot: 1, reward: 300,  damage: 26,  fireRate: 65,  headshotMult: 4.0 },
  bizon:        { price: 1400, team: 'ANY', slot: 1, reward: 600,  damage: 27,  fireRate: 80,  headshotMult: 4.0 },

  // Shotguns (Slot 1 - $900 reward)
  nova:         { price: 1050, team: 'ANY', slot: 1, reward: 900,  damage: 26,  fireRate: 900, headshotMult: 4.0 },
  xm1014:       { price: 2000, team: 'ANY', slot: 1, reward: 900,  damage: 20,  fireRate: 240, headshotMult: 4.0 },
  mag7:         { price: 1300, team: 'CT',  slot: 1, reward: 900,  damage: 30,  fireRate: 850, headshotMult: 4.0 },
  sawedoff:     { price: 1100, team: 'T',   slot: 1, reward: 900,  damage: 32,  fireRate: 850, headshotMult: 4.0 },

  // Heavy (Slot 1)
  m249:         { price: 5200, team: 'ANY', slot: 1, reward: 300,  damage: 32,  fireRate: 80,  headshotMult: 4.0 },
  negev:        { price: 1700, team: 'ANY', slot: 1, reward: 300,  damage: 35,  fireRate: 75,  headshotMult: 4.0 },

  // Equipment & Grenades
  vest:         { price: 650,  team: 'ANY', slot: 'armor',  reward: 0 },
  kevlar:       { price: 650,  team: 'ANY', slot: 'armor',  reward: 0 },
  helmet:       { price: 1000, team: 'ANY', slot: 'helmet', reward: 0 },
  vesthelm:     { price: 1000, team: 'ANY', slot: 'helmet', reward: 0 },
  defuser:      { price: 400,  team: 'CT',  slot: 'kit',    reward: 0 },
  flashbang:    { price: 200,  team: 'ANY', slot: 4, reward: 300, damage: 0 },
  hegrenade:    { price: 300,  team: 'ANY', slot: 4, reward: 300, damage: 50, fireRate: 1000 },
  smokegrenade: { price: 300,  team: 'ANY', slot: 4, reward: 300, damage: 0 },
  molotov:      { price: 400,  team: 'T',   slot: 4, reward: 300, damage: 40, fireRate: 1000 },
  incgrenade:   { price: 600,  team: 'CT',  slot: 4, reward: 300, damage: 40, fireRate: 1000 },

  // Melee & Objective
  knife:        { price: 0,    team: 'ANY', slot: 3, reward: 1500, damage: 45, fireRate: 400, headshotMult: 2.0 },
  c4:           { price: 0,    team: 'T',   slot: 5, reward: 0 }
};

function isInsideBombsite(pos) {
  if (!pos) return null;
  // Bombsite A: authentic site decal bounds (radius 8.5m around decal center 51.85, -108.7)
  const distA = Math.hypot(pos.x - 51.85, pos.z - (-108.7));
  const inA = (distA <= 8.5 && Math.abs((pos.y || 4.32) - 4.32) < 4.0) ||
              (pos.x >= 42.0 && pos.x <= 62.0 && pos.z >= -118.0 && pos.z <= -100.0 && pos.y >= 1.5 && pos.y <= 8.0);
  if (inA) return 'A';

  // Bombsite B: authentic site decal bounds (radius 8.5m around decal center -72.0, -121.0)
  const distB = Math.hypot(pos.x - (-72.0), pos.z - (-121.0));
  const inB = (distB <= 8.5 && Math.abs((pos.y || 0) - 0.0) < 4.0) ||
              (pos.x >= -80.0 && pos.x <= -64.0 && pos.z >= -128.0 && pos.z <= -114.0 && pos.y >= -1.5 && pos.y <= 4.5);
  if (inB) return 'B';

  return null;
}

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
    this.liveStartTime = 0;
    this.currentRound = 1;
    this.maxRounds = 24; // MR12 format
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

    // Dropped Weapons / Items on Ground
    this.droppedItems = []; // { id, weaponId, slot, pos, droppedBy, droppedAt }

    // Event Log Ring Buffer (Last 50 events exposed via /health)
    this.eventHistory = [];

    // Loop Handles
    this.tickInterval = null;
    this.snapshotInterval = null;
    this.idleCheckInterval = null;
    this.zeroTimerTicks = 0;
  }

  logEvent(type, details) {
    const entry = {
      t: Date.now(),
      iso: new Date().toISOString(),
      matchId: this.matchId,
      round: this.currentRound,
      phase: this.phase,
      type,
      details
    };
    this.eventHistory.push(entry);
    if (this.eventHistory.length > 50) this.eventHistory.shift();
    console.log(`[EVENT][${entry.iso}][${this.matchId}][R${this.currentRound}][${this.phase}] ${type}: ${details}`);
  }

  startLoops() {
    if (this.tickInterval) return;

    // 1. Match Logic Tick (1 Hz)
    this.tickInterval = setInterval(() => {
      try {
        this.updateClock();
      } catch (err) {
        console.error(`[CRITICAL TICK EXCEPTION]:`, err.stack);
        this.logEvent('TICK_EXCEPTION', err.message);
      }
    }, 1000);

    // 2. High-Frequency State Broadcast (25 Hz / 40ms)
    this.snapshotInterval = setInterval(() => {
      try {
        this.broadcastSnapshot();
      } catch (err) {
        console.error(`[SNAPSHOT EXCEPTION]:`, err.stack);
      }
    }, 40);

    // 3. Idle Player Sweep (every 30s)
    this.idleCheckInterval = setInterval(() => this.checkIdlePlayers(), 30000);

    this.logEvent('ROOM_START', `Simulation active. Match ID: ${this.matchId}`);
  }

  stopLoopsIfEmpty() {
    if (this.players.size > 0) return;

    clearInterval(this.tickInterval);
    clearInterval(this.snapshotInterval);
    clearInterval(this.idleCheckInterval);
    this.tickInterval = null;
    this.snapshotInterval = null;
    this.idleCheckInterval = null;

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

    this.logEvent('ROOM_SLEEP', 'All players disconnected. Loops paused for Render sleep.');
  }

  checkIdlePlayers() {
    const now = Date.now();
    const IDLE_LIMIT = 10 * 60 * 1000; // 10 minutes

    for (const [id, p] of this.players.entries()) {
      if (now - p.lastInputAt > IDLE_LIMIT) {
        this.logEvent('IDLE_KICK', `Player ${p.callsign} (${id}) inactive for 10m.`);
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
        this.zeroTimerTicks++;
        if (this.phase === 'freeze') {
          // Freeze time ended -> Go live
          const oldPhase = this.phase;
          this.phase = 'live';
          this.phaseTimer = 115; // 1:55 live round time
          this.phaseEndTime = now + 115000;
          this.liveStartTime = now;
          this.zeroTimerTicks = 0;

          const ctAlive = Array.from(this.players.values()).filter(p => p.team === 'CT' && p.isAlive).length;
          const tAlive = Array.from(this.players.values()).filter(p => p.team === 'T' && p.isAlive).length;
          this.logEvent('PHASE_CHANGE', `${oldPhase} -> live (timer: 115s, CT alive: ${ctAlive}, T alive: ${tAlive})`);

          this.broadcast({
            type: 'phase_change',
            phase: 'live',
            timer: 115,
            phaseEndTime: this.phaseEndTime
          });
        } else if (this.phase === 'live') {
          // Live round expired without bomb plant -> CT wins
          const totalCT = Array.from(this.players.values()).filter(p => p.team === 'CT' && p.spawnedThisRound).length;
          const winner = (totalCT > 0) ? 'CT' : 'T';
          this.logEvent('PHASE_CHANGE', `live -> round_over (Target preserved / Time expired, Winner: ${winner})`);
          this.endRound(winner, 'TARGET_PRESERVED');
        } else if (this.phase === 'round_over') {
          // Next round initiation
          this.logEvent('PHASE_CHANGE', `round_over -> startNextRound`);
          this.startNextRound();
        }
      } else {
        this.zeroTimerTicks = 0;
      }
    }

    // Watchdog: If timer is 0 for >= 2 ticks and phase hasn't transitioned, force progress
    if (this.zeroTimerTicks >= 2) {
      this.logEvent('WATCHDOG', `Phase ${this.phase} hung at timer 0 for >=2s. Forcing transition.`);
      this.zeroTimerTicks = 0;
      if (this.phase === 'freeze') {
        this.phase = 'live';
        this.phaseTimer = 115;
        this.phaseEndTime = now + 115000;
        this.liveStartTime = now;
        this.broadcast({ type: 'phase_change', phase: 'live', timer: 115, phaseEndTime: this.phaseEndTime });
      } else if (this.phase === 'live') {
        this.endRound('CT', 'TARGET_PRESERVED');
      } else if (this.phase === 'round_over') {
        this.startNextRound();
      }
    }

    // Elimination Checks during live phase (ONLY count players who were spawned into this round!)
    if (this.phase === 'live') {
      const ctSpawned = Array.from(this.players.values()).filter(p => p.team === 'CT' && p.spawnedThisRound);
      const tSpawned = Array.from(this.players.values()).filter(p => p.team === 'T' && p.spawnedThisRound);
      const ctAlive = ctSpawned.filter(p => p.isAlive).length;
      const tAlive = tSpawned.filter(p => p.isAlive).length;

      // Both teams must have had living players at round start to trigger elimination
      if (ctSpawned.length > 0 && tSpawned.length > 0) {
        if (ctAlive === 0 && (!this.c4Planted || tAlive > 0)) {
          this.logEvent('ELIMINATION', `All CTs eliminated (${ctAlive}/${ctSpawned.length}). T wins.`);
          this.endRound('T', 'COUNTER_TERRORISTS_ELIMINATED');
        } else if (tAlive === 0 && !this.c4Planted) {
          this.logEvent('ELIMINATION', `All Ts eliminated (${tAlive}/${tSpawned.length}) without bomb plant. CT wins.`);
          this.endRound('CT', 'TERRORISTS_ELIMINATED');
        }
      }
    }
  }

  startNextRound() {
    this.currentRound++;
    this.zeroTimerTicks = 0;

    // Check Halftime Swap at Round 13 (MR12)
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
    this.logEvent('HALFTIME', `Halftime reached! Round 13. Swapping teams.`);
    const tempScore = this.ctScore;
    this.ctScore = this.tScore;
    this.tScore = tempScore;
    this.consecutiveLosses = { CT: 0, T: 0 };

    for (const p of this.players.values()) {
      if (p.team === 'CT') p.team = 'T';
      else if (p.team === 'T') p.team = 'CT';
      p.money = 800;
      p.hasHelmet = false;
      p.armor = 0;
      p.hasDefuseKit = false;
      p.purchases = [];
      p.fired = {};
      p.inventory = {
        1: null,
        2: (p.team === 'CT' ? 'usp' : 'glock'),
        3: 'knife',
        4: [],
        5: null
      };
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
    this.zeroTimerTicks = 0;
    this.c4Planted = false;
    this.c4PlantedThisRound = false;
    this.c4Site = null;
    this.c4Pos = null;
    this.c4DefuseProgress = 0;
    this.c4Defuser = null;
    this.droppedItems = []; // Clean up all ground drops at round start

    const livingTs = [];
    let ctIdx = 0;
    let tIdx = 0;
    for (const p of this.players.values()) {
      p.isAlive = true;
      p.inMatch = true;
      p.spawnedThisRound = true;
      p.health = 100;
      p.hasC4 = false;
      p.purchases = [];
      p.fired = {};
      p.roundDamage = 0;

      // Rebuild baseline inventory if empty
      p.inventory = p.inventory || {};
      p.inventory[2] = p.inventory[2] || (p.team === 'CT' ? 'usp' : 'glock');
      p.inventory[3] = 'knife';
      p.inventory[5] = null;
      p.activeWeapon = p.inventory[1] || p.inventory[2] || 'knife';

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
      luckyT.inventory[5] = 'c4';
      this.c4CarrierId = luckyT.id;
    } else {
      this.c4CarrierId = null;
    }

    this.logEvent('ROUND_START', `Round ${this.currentRound} started. C4 Carrier: ${this.c4CarrierId || 'none'}. CT Score: ${this.ctScore}, T Score: ${this.tScore}`);

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
    // Idempotent guard: ignore duplicate endRound calls in the same round
    if (this.phase === 'round_over') {
      this.logEvent('END_ROUND_IGNORED', `Duplicate call in round_over ignored: winner=${winnerTeam}, reason=${reason}`);
      return;
    }

    this.phase = 'round_over';
    this.phaseTimer = 5;
    this.phaseEndTime = Date.now() + 5000;
    this.zeroTimerTicks = 0;
    this.c4Planted = false; // CRITICAL: Reset bomb state so clock doesn't hang in c4 branch!

    if (winnerTeam === 'CT') {
      this.ctScore++;
      this.consecutiveLosses.CT = 0;
      this.consecutiveLosses.T++;
    } else if (winnerTeam === 'T') {
      this.tScore++;
      this.consecutiveLosses.T = 0;
      this.consecutiveLosses.CT++;
    }

    this.logEvent('ROUND_END', `Winner: ${winnerTeam} (${reason}). Score: CT ${this.ctScore} - ${this.tScore} T. Loss streaks: CT ${this.consecutiveLosses.CT}, T ${this.consecutiveLosses.T}`);

    // Calculate MVP of this round
    let roundMvp = null;
    let maxDamage = -1;
    for (const p of this.players.values()) {
      if (p.team === winnerTeam && p.roundDamage > maxDamage && p.roundDamage > 0) {
        maxDamage = p.roundDamage;
        roundMvp = { name: p.callsign, reason: `most damage dealt (${p.roundDamage} dmg)` };
      }
    }

    // Authentic CS2 Economy: Win $3250, Loss streak $1400+$500/streak max $3400, Bomb plant bonus $800, Cap $16000
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
    this.logEvent('BOMB_EXPLODED', `C4 detonated at (${bombPos.x.toFixed(1)}, ${bombPos.y.toFixed(1)}, ${bombPos.z.toFixed(1)})`);

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
          player.health = Math.max(0, player.health - blastDamage);
          if (player.health <= 0) {
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
      this.logEvent('BOMB_DEFUSED', `Defused by ${defuser.callsign} (${defuserId}). +$300 bonus.`);
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
    this.logEvent('MATCH_OVER', `Match concluded. Winner: ${winner}. Final Score: CT ${this.ctScore} - ${this.tScore} T`);

    this.broadcast({
      type: 'match_over',
      winner: winner,
      ctScore: this.ctScore,
      tScore: this.tScore
    });

    setTimeout(() => {
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
        armor: p.armor,
        hasHelmet: p.hasHelmet,
        hasDefuseKit: p.hasDefuseKit,
        pos: p.pos,
        yaw: p.yaw,
        pitch: p.pitch,
        crouch: p.crouch,
        weapon: p.activeWeapon,
        hasC4: p.hasC4,
        kills: p.kills,
        deaths: p.deaths,
        money: p.money,
        inventory: p.inventory,
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
      dropsCount: this.droppedItems.length,
      drops: this.droppedItems,
      players: playersData
    };

    this.broadcast(snapshot);
  }

  addPlayer(id, ws, callsign, team = 'CT') {
    const isFirstPlayer = (this.players.size === 0);
    const cleanCallsign = (typeof callsign === 'string' && callsign.trim().length >= 2)
      ? callsign.trim().substring(0, 16).replace(/[<>&"']/g, '')
      : `Agent_${id.substring(0, 5)}`;

    // Prune any existing stale player session with the same callsign
    for (const [existingId, p] of this.players.entries()) {
      if (existingId !== id && p.callsign && p.callsign.toLowerCase() === cleanCallsign.toLowerCase()) {
        this.logEvent('PRUNE_CLONE', `Pruning stale clone session for ${cleanCallsign} (${existingId})`);
        this.removePlayer(existingId);
        this.broadcast({ type: 'player_left', id: existingId });
      }
    }

    if (isFirstPlayer) {
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

    // Joining player spawns only during freeze or as first player. Otherwise spectators until next round.
    const shouldSpawn = isFirstPlayer || (this.phase === 'freeze');

    // Auto-balance teams
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
      assignedTeam = (firstPlayer.team === 'T') ? 'CT' : 'T';
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
      spawnedThisRound: shouldSpawn,
      health: 100,
      armor: 0,
      hasHelmet: false,
      hasDefuseKit: false,
      money: 800,
      purchases: [],
      transactions: [{ type: 'init', amount: 800, balance: 800, reason: 'Initial money', t: Date.now() }],
      fired: {},
      kills: 0,
      deaths: 0,
      roundDamage: 0,
      inventory: {
        1: null,
        2: (playerTeam === 'CT' ? 'usp' : 'glock'),
        3: 'knife',
        4: [],
        5: null
      },
      activeWeapon: (playerTeam === 'CT' ? 'usp' : 'glock'),
      hasC4: (playerTeam === 'T' && (isFirstPlayer || (!this.c4CarrierId && !this.c4Planted))),
      pos: { x: initialSpawn.x, y: initialSpawn.y, z: initialSpawn.z },
      yaw: initialSpawn.yaw,
      pitch: 0,
      spawnIndex: 0,
      crouch: false,
      lastInputAt: Date.now()
    };

    if (player.hasC4) {
      player.inventory[5] = 'c4';
      this.c4CarrierId = id;
    }

    this.players.set(id, player);
    this.startLoops();

    this.logEvent('PLAYER_JOIN', `${player.callsign} (${id}) joined ${player.team}. Spawning=${shouldSpawn}. Total: ${this.players.size}`);

    // Send full match sync
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
      inMatch: player.inMatch,
      inventory: player.inventory,
      money: player.money
    }));

    // Broadcast to other players
    this.broadcast({
      type: 'player_joined',
      player: {
        id: id,
        callsign: player.callsign,
        team: player.team,
        inMatch: player.inMatch
      }
    }, ws);
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;

    if (p.hasC4 && !this.c4Planted) {
      this.droppedItems.push({
        id: `c4_drop_${Date.now()}`,
        weaponId: 'c4',
        slot: 5,
        pos: p.pos,
        droppedBy: id,
        droppedAt: Date.now()
      });
      this.c4CarrierId = null;
      this.broadcast({
        type: 'c4_dropped',
        pos: p.pos
      });
    }

    this.players.delete(id);
    this.logEvent('PLAYER_LEAVE', `${p.callsign} (${id}) disconnected. Remaining: ${this.players.size}`);

    this.broadcast({
      type: 'player_left',
      id: id,
      callsign: p.callsign
    });

    this.stopLoopsIfEmpty();
  }
}

// Global Room Instance
const dust2Room = new GameRoom('dust2');

// ============================================================================
// HTTP SERVER (Health Check & Render Keep-Alive / Wake-up Verification)
// ============================================================================

const server = http.createServer((req, res) => {
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
      phase: dust2Room.phase,
      last50Events: dust2Room.eventHistory
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
  const origin = info.origin || (info.req && info.req.headers ? info.req.headers.origin : '');
  const allowed = process.env.ALLOWED_ORIGIN || '';

  if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1') || origin.startsWith('https://localhost')) {
    return callback(true);
  }

  if (allowed && (origin === allowed || origin === allowed.replace(/\/$/, ''))) {
    return callback(true);
  }

  if (origin.includes('github.io')) {
    return callback(true);
  }

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

      case 'select_team': {
        if (!player) break;
        player.lastInputAt = Date.now();
        const targetTeam = (packet.team === 'T') ? 'T' : 'CT';
        if (player.team === targetTeam) break;

        let otherT = 0, otherCT = 0;
        for (const [pId, p] of dust2Room.players.entries()) {
          if (pId !== playerId) {
            if (p.team === 'T') otherT++;
            else otherCT++;
          }
        }
        const wouldBeT = (targetTeam === 'T') ? otherT + 1 : otherT;
        const wouldBeCT = (targetTeam === 'CT') ? otherCT + 1 : otherCT;

        if (Math.abs(wouldBeT - wouldBeCT) <= 1 || (otherT === 0 && otherCT === 0)) {
          const oldTeam = player.team;
          player.team = targetTeam;

          // Rebuild baseline loadout for the new team
          player.hasC4 = false;
          player.hasDefuseKit = false;
          player.inventory = {
            1: null,
            2: (targetTeam === 'CT' ? 'usp' : 'glock'),
            3: 'knife',
            4: [],
            5: null
          };
          player.activeWeapon = player.inventory[2];

          // Re-evaluate spawn position for the new team
          const teamSpawns = DUST2_SPAWNS[targetTeam] || DUST2_SPAWNS.T;
          const sp = teamSpawns[0];
          player.pos = { x: sp.x, y: sp.y, z: sp.z };
          player.yaw = sp.yaw;

          dust2Room.logEvent('TEAM_SWAP', `${player.callsign} (${playerId}) switched from ${oldTeam} to ${targetTeam}`);

          dust2Room.broadcast({
            type: 'team_swapped',
            id: playerId,
            team: player.team,
            pos: player.pos,
            inventory: player.inventory
          });
        } else {
          dust2Room.logEvent('TEAM_REJECT', `${player.callsign} (${playerId}) change to ${targetTeam} rejected (unbalanced: T=${otherT}, CT=${otherCT})`);
          ws.send(JSON.stringify({
            type: 'team_reject',
            reason: `Teams would be unbalanced (${wouldBeT} T vs ${wouldBeCT} CT)`
          }));
        }
        break;
      }

      case 'buy_item': {
        if (!player) break;
        player.lastInputAt = Date.now();
        const wepId = String(packet.weaponId || '').toLowerCase();
        const wepDef = WEAPON_REGISTRY[wepId];

        if (!wepDef) {
          const reason = `Unknown weapon id: ${wepId}`;
          dust2Room.logEvent('BUY_REJECT', `${player.callsign} (${playerId}): ${reason}`);
          ws.send(JSON.stringify({ type: 'buy_error', weaponId: wepId, reason }));
          break;
        }

        const now = Date.now();
        const isFreeze = (dust2Room.phase === 'freeze');
        const isLiveBuy = (dust2Room.phase === 'live' && (now - dust2Room.liveStartTime <= 15000));
        if (!isFreeze && !isLiveBuy) {
          const reason = `Buy period expired (freeze or first 15s of live only, phase: ${dust2Room.phase})`;
          dust2Room.logEvent('BUY_REJECT', `${player.callsign} (${playerId}): ${reason}`);
          ws.send(JSON.stringify({ type: 'buy_error', weaponId: wepId, reason }));
          break;
        }

        if (wepDef.team !== 'ANY' && wepDef.team !== player.team) {
          const reason = `Weapon ${wepId} is restricted to ${wepDef.team}`;
          dust2Room.logEvent('BUY_REJECT', `${player.callsign} (${playerId}): ${reason}`);
          ws.send(JSON.stringify({ type: 'buy_error', weaponId: wepId, reason }));
          break;
        }

        player.inventory = player.inventory || { 1: null, 2: (player.team === 'CT' ? 'usp' : 'glock'), 3: 'knife', 4: [], 5: null };

        if (wepDef.slot === 1 && player.inventory[1]) {
          const reason = `Already holding primary weapon (${player.inventory[1]}). Drop it first.`;
          dust2Room.logEvent('BUY_REJECT', `${player.callsign} (${playerId}): ${reason}`);
          ws.send(JSON.stringify({ type: 'buy_error', weaponId: wepId, reason }));
          break;
        }
        if (wepDef.slot === 'helmet' && player.hasHelmet) {
          const reason = `Already equipped with helmet`;
          dust2Room.logEvent('BUY_REJECT', `${player.callsign} (${playerId}): ${reason}`);
          ws.send(JSON.stringify({ type: 'buy_error', weaponId: wepId, reason }));
          break;
        }
        if (wepDef.slot === 'kit' && player.hasDefuseKit) {
          const reason = `Already equipped with defuse kit`;
          dust2Room.logEvent('BUY_REJECT', `${player.callsign} (${playerId}): ${reason}`);
          ws.send(JSON.stringify({ type: 'buy_error', weaponId: wepId, reason }));
          break;
        }

        const price = wepDef.price;
        if (player.money < price) {
          const reason = `Insufficient funds ($${player.money} < $${price})`;
          dust2Room.logEvent('BUY_REJECT', `${player.callsign} (${playerId}): ${reason}`);
          ws.send(JSON.stringify({ type: 'buy_error', weaponId: wepId, reason }));
          break;
        }

        // Execute Buy
        player.money -= price;
        player.purchases = player.purchases || [];
        player.purchases.push({
          id: `purch_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          weaponId: wepId,
          cost: price,
          slot: wepDef.slot,
          round: dust2Room.currentRound,
          dropped: false,
          fired: false,
          refunded: false,
          timestamp: Date.now()
        });

        // Update server inventory
        if (wepDef.slot === 1) player.inventory[1] = wepId;
        else if (wepDef.slot === 2) player.inventory[2] = wepId;
        else if (wepDef.slot === 'armor') { player.armor = 100; }
        else if (wepDef.slot === 'helmet') { player.armor = 100; player.hasHelmet = true; }
        else if (wepDef.slot === 'kit') { player.hasDefuseKit = true; }
        else if (wepDef.slot === 4) {
          player.inventory[4] = player.inventory[4] || [];
          if (player.inventory[4].length < 4) player.inventory[4].push(wepId);
        }

        player.activeWeapon = (typeof wepDef.slot === 'number') ? wepId : player.activeWeapon;
        player.transactions = player.transactions || [];
        player.transactions.push({
          type: 'buy',
          amount: -price,
          balance: player.money,
          reason: `Bought ${wepId}`,
          t: Date.now()
        });
        if (player.transactions.length > 20) player.transactions.shift();

        dust2Room.logEvent('BUY_ACCEPT', `${player.callsign} bought ${wepId} for $${price}. Balance: $${player.money}`);
        ws.send(JSON.stringify({
          type: 'buy_success',
          weaponId: wepId,
          cost: price,
          slot: wepDef.slot,
          remainingMoney: player.money,
          inventory: player.inventory,
          transactions: player.transactions.slice(-5)
        }));
        break;
      }

      case 'refund_item': {
        if (!player) break;
        player.lastInputAt = Date.now();
        const wepId = String(packet.weaponId || '').toLowerCase();

        if (dust2Room.phase !== 'freeze') {
          const reason = 'Refunds only allowed during freeze time';
          dust2Room.logEvent('REFUND_REJECT', `${player.callsign} (${playerId}): ${reason}`);
          ws.send(JSON.stringify({ type: 'refund_error', weaponId: wepId, reason }));
          break;
        }

        player.purchases = player.purchases || [];
        const eligIdx = player.purchases.findIndex(p =>
          p.weaponId === wepId &&
          p.round === dust2Room.currentRound &&
          !p.refunded
        );

        if (eligIdx === -1) {
          const reason = `No eligible purchase of ${wepId} found in round ${dust2Room.currentRound}`;
          dust2Room.logEvent('REFUND_REJECT', `${player.callsign} (${playerId}): ${reason}`);
          ws.send(JSON.stringify({ type: 'refund_error', weaponId: wepId, reason }));
          break;
        }

        const elig = player.purchases[eligIdx];
        if (elig.dropped) {
          const reason = `Cannot refund dropped weapon: ${wepId}`;
          dust2Room.logEvent('REFUND_REJECT', `${player.callsign} (${playerId}): ${reason}`);
          ws.send(JSON.stringify({ type: 'refund_error', weaponId: wepId, reason }));
          break;
        }
        if (elig.fired || (player.fired && player.fired[wepId])) {
          const reason = `Cannot refund weapon after firing: ${wepId}`;
          dust2Room.logEvent('REFUND_REJECT', `${player.callsign} (${playerId}): ${reason}`);
          ws.send(JSON.stringify({ type: 'refund_error', weaponId: wepId, reason }));
          break;
        }

        // Execute Refund
        elig.refunded = true;
        player.money = Math.min(16000, player.money + elig.cost);

        player.inventory = player.inventory || {};
        if (elig.slot === 1 && player.inventory[1] === wepId) player.inventory[1] = null;
        else if (elig.slot === 2 && player.inventory[2] === wepId) player.inventory[2] = (player.team === 'CT' ? 'usp' : 'glock');
        else if (elig.slot === 'helmet') player.hasHelmet = false;
        else if (elig.slot === 'kit') player.hasDefuseKit = false;
        else if (elig.slot === 4 && Array.isArray(player.inventory[4])) {
          const gIdx = player.inventory[4].indexOf(wepId);
          if (gIdx !== -1) player.inventory[4].splice(gIdx, 1);
        }

        player.activeWeapon = player.inventory[1] || player.inventory[2] || 'knife';
        player.transactions = player.transactions || [];
        player.transactions.push({
          type: 'refund',
          amount: elig.cost,
          balance: player.money,
          reason: `Refunded ${wepId}`,
          t: Date.now()
        });
        if (player.transactions.length > 20) player.transactions.shift();

        dust2Room.logEvent('REFUND_ACCEPT', `${player.callsign} refunded ${wepId} for +$${elig.cost}. Balance: $${player.money}`);
        ws.send(JSON.stringify({
          type: 'refund_success',
          weaponId: wepId,
          refundAmount: elig.cost,
          remainingMoney: player.money,
          slot: elig.slot,
          inventory: player.inventory,
          transactions: player.transactions.slice(-5)
        }));
        break;
      }

      case 'weapon_fired':
        if (player && packet.weaponId) {
          const wepKey = String(packet.weaponId).toLowerCase();
          player.fired = player.fired || {};
          player.fired[wepKey] = true;
          if (player.purchases) {
            const pObj = player.purchases.find(p => p.weaponId === wepKey && !p.refunded);
            if (pObj) pObj.fired = true;
          }
        }
        break;

      case 'plant_c4': {
        if (!player || !player.isAlive) {
          dust2Room.logEvent('PLANT_REJECT', `Player not alive or missing`);
          ws.send(JSON.stringify({ type: 'plant_error', reason: 'Player must be alive to plant' }));
          break;
        }
        if (player.team !== 'T') {
          dust2Room.logEvent('PLANT_REJECT', `Player is not on Terrorist team (team: ${player.team})`);
          ws.send(JSON.stringify({ type: 'plant_error', reason: 'Counter-Terrorists cannot plant C4' }));
          break;
        }
        if (!player.hasC4 && dust2Room.c4CarrierId !== playerId) {
          dust2Room.logEvent('PLANT_REJECT', `${player.callsign} is not the C4 carrier`);
          ws.send(JSON.stringify({ type: 'plant_error', reason: 'You do not possess the C4 explosive' }));
          break;
        }
        if (dust2Room.phase !== 'live') {
          dust2Room.logEvent('PLANT_REJECT', `Plant attempted outside live round (phase: ${dust2Room.phase})`);
          ws.send(JSON.stringify({ type: 'plant_error', reason: 'Can only plant during live round' }));
          break;
        }
        if (dust2Room.c4Planted) {
          dust2Room.logEvent('PLANT_REJECT', `C4 is already planted`);
          ws.send(JSON.stringify({ type: 'plant_error', reason: 'C4 is already planted' }));
          break;
        }

        // Validate bombsite location
        const plantPos = packet.pos || player.pos;
        const site = isInsideBombsite(plantPos);
        if (!site) {
          dust2Room.logEvent('PLANT_REJECT', `Player position (${plantPos ? plantPos.x.toFixed(1) + ',' + plantPos.z.toFixed(1) : 'none'}) is not inside bombsite A or B`);
          ws.send(JSON.stringify({ type: 'plant_error', reason: 'Must be inside bombsite A or B to plant' }));
          break;
        }

        player.lastInputAt = Date.now();
        dust2Room.c4Planted = true;
        dust2Room.c4PlantedThisRound = true;
        dust2Room.c4CarrierId = null;
        player.hasC4 = false;
        if (player.inventory) player.inventory[5] = null;

        dust2Room.c4Site = site;
        dust2Room.c4Pos = plantPos;
        dust2Room.c4PlantTime = Date.now();
        dust2Room.c4ExplodeTime = Date.now() + 40000; // 40s authentic C4 timer

        // Personal bonus: +$300 to the planter
        player.money = Math.min(16000, player.money + 300);
        player.transactions = player.transactions || [];
        player.transactions.push({
          type: 'plant',
          amount: 300,
          balance: player.money,
          reason: 'C4 plant bonus',
          t: Date.now()
        });
        if (player.transactions.length > 20) player.transactions.shift();

        dust2Room.logEvent('PLANT_ACCEPT', `C4 planted on site ${site} by ${player.callsign} (${playerId}). +$300 personal bonus awarded.`);

        dust2Room.broadcast({
          type: 'c4_planted',
          site: dust2Room.c4Site,
          pos: dust2Room.c4Pos,
          planterId: playerId,
          planterName: player.callsign,
          explodeTime: dust2Room.c4ExplodeTime
        });
        break;
      }

      case 'defuse_progress': {
        if (!player || !player.isAlive) {
          ws.send(JSON.stringify({ type: 'defuse_error', reason: 'Player must be alive' }));
          break;
        }
        if (player.team !== 'CT') {
          ws.send(JSON.stringify({ type: 'defuse_error', reason: 'Only Counter-Terrorists can defuse' }));
          break;
        }
        if (!dust2Room.c4Planted) {
          ws.send(JSON.stringify({ type: 'defuse_error', reason: 'No bomb is currently planted' }));
          break;
        }

        // Distance check
        if (player.pos && dust2Room.c4Pos) {
          const dist = Math.hypot(player.pos.x - dust2Room.c4Pos.x, player.pos.z - dust2Room.c4Pos.z);
          if (dist > 4.5) {
            ws.send(JSON.stringify({ type: 'defuse_error', reason: 'Too far from C4 to defuse' }));
            break;
          }
        }

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
        break;
      }

      case 'damage_hit': {
        if (!player || !player.isAlive) break;
        player.lastInputAt = Date.now();

        if (dust2Room.phase !== 'live') {
          dust2Room.logEvent('DAMAGE_REJECT', `Shooter ${player.callsign} fired outside live round (phase: ${dust2Room.phase})`);
          break;
        }

        const target = dust2Room.players.get(packet.targetId);
        if (!target || !target.isAlive || target.team === player.team) {
          dust2Room.logEvent('DAMAGE_REJECT', `Invalid target for ${player.callsign}`);
          break;
        }

        let wepKey = String(packet.weapon || player.activeWeapon || 'ak47').toLowerCase().trim();
        const wepAliases = {
          'glock-18': 'glock', 'glock18': 'glock',
          'usp-s': 'usp', 'usps': 'usp',
          'desert eagle': 'deagle', 'deserteagle': 'deagle',
          'ak-47': 'ak47', 'm4a4': 'm4a4', 'm4a1-s': 'm4a1', 'm4a1': 'm4a1',
          'awp': 'awp', 'ssg 08': 'ssg08', 'ssg08': 'ssg08',
          'default knife': 'knife', 'knife': 'knife'
        };
        if (wepAliases[wepKey]) wepKey = wepAliases[wepKey];

        const wepDef = WEAPON_REGISTRY[wepKey];
        if (!wepDef) {
          dust2Room.logEvent('DAMAGE_REJECT', `Unknown weapon in damage_hit: ${wepKey}`);
          break;
        }

        // Verify weapon is in player's server inventory
        player.inventory = player.inventory || {};
        if (!player.inventory[2]) player.inventory[2] = (player.team === 'CT' ? 'usp' : 'glock');
        if (!player.inventory[3]) player.inventory[3] = 'knife';
        const hasWep = (player.inventory[1] === wepKey || player.inventory[2] === wepKey || wepKey === 'knife' ||
                        (Array.isArray(player.inventory[4]) && player.inventory[4].includes(wepKey)));
        if (!hasWep && wepKey !== 'knife') {
          dust2Room.logEvent('DAMAGE_REJECT', `Player ${player.callsign} does not own weapon ${wepKey}`);
          break;
        }

        // Fire rate enforcement
        player.lastFireTimes = player.lastFireTimes || {};
        const lastFire = player.lastFireTimes[wepKey] || 0;
        const now = Date.now();
        const minInterval = (wepDef.fireRate || 100) * 0.70;
        if (now - lastFire < minInterval) {
          dust2Room.logEvent('DAMAGE_REJECT', `Fire rate exceeded for ${wepKey} by ${player.callsign}`);
          break;
        }
        player.lastFireTimes[wepKey] = now;

        // Disqualify for refund
        player.fired = player.fired || {};
        player.fired[wepKey] = true;
        if (player.purchases) {
          const pObj = player.purchases.find(p => p.weaponId === wepKey && !p.refunded);
          if (pObj) pObj.fired = true;
        }

        // Distance check
        if (player.pos && target.pos) {
          const dist = Math.hypot(player.pos.x - target.pos.x, player.pos.y - target.pos.y, player.pos.z - target.pos.z);
          if (dist > 160) {
            dust2Room.logEvent('DAMAGE_REJECT', `Distance too great (${dist.toFixed(1)}m > 160m)`);
            break;
          }
        }

        // Authoritative damage from registry
        const isHeadshot = !!packet.isHeadshot;
        const baseDmg = wepDef.damage || 25;
        const mult = isHeadshot ? (wepDef.headshotMult || 4.0) : 1.0;
        let finalDmg = Math.round(baseDmg * mult);

        // Armor mitigation
        if (!isHeadshot && target.armor > 0) {
          finalDmg = Math.round(finalDmg * 0.75);
          target.armor = Math.max(0, target.armor - Math.round(finalDmg * 0.5));
        }

        target.health = Math.max(0, target.health - finalDmg);
        player.roundDamage += finalDmg;

        dust2Room.broadcast({
          type: 'player_damaged',
          targetId: target.id,
          attackerId: player.id,
          health: target.health,
          damage: finalDmg,
          isHeadshot
        });

        if (target.health <= 0) {
          target.isAlive = false;
          target.deaths++;
          player.kills++;

          const reward = (wepDef.reward !== undefined) ? wepDef.reward : 300;
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

          dust2Room.logEvent('KILL', `${player.callsign} [${wepKey}${isHeadshot ? ' HS' : ''}] ${target.callsign} (Reward: +$${reward})`);

          // Drop C4 if victim carried it
          if (target.hasC4) {
            target.hasC4 = false;
            dust2Room.c4CarrierId = null;
            const dropPos = target.pos || { x: 0, y: 0, z: 0 };
            dust2Room.droppedItems.push({
              id: `c4_drop_${Date.now()}`,
              weaponId: 'c4',
              slot: 5,
              pos: dropPos,
              droppedBy: target.id,
              droppedAt: Date.now()
            });
            dust2Room.broadcast({ type: 'c4_dropped', pos: dropPos });
          }

          // Drop victim's weapon on death: primary first, or secondary pistol if no primary
          let dropWep = null;
          let dropSlot = 1;
          if (target.inventory && target.inventory[1]) {
            dropWep = target.inventory[1];
            dropSlot = 1;
            target.inventory[1] = null;
          } else if (target.inventory && target.inventory[2]) {
            dropWep = target.inventory[2];
            dropSlot = 2;
          }
          if (dropWep) {
            const groundDropY = (target.pos && typeof target.pos.y === 'number') ? (target.pos.y - 2.1) : 0;
            const dropItem = {
              id: `drop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              weaponId: dropWep,
              slot: dropSlot,
              pos: target.pos ? { x: target.pos.x, y: groundDropY, z: target.pos.z } : { x: 0, y: 0, z: 0 },
              droppedBy: target.id,
              droppedAt: Date.now()
            };
            dust2Room.droppedItems.push(dropItem);
            dust2Room.broadcast({ type: 'item_dropped', item: dropItem });
          }

          // Also drop C4 if victim was carrying it
          if (target.hasC4 || (target.inventory && target.inventory[5] === 'c4')) {
            target.hasC4 = false;
            dust2Room.c4CarrierId = null;
            if (target.inventory) target.inventory[5] = null;
            const groundDropY = (target.pos && typeof target.pos.y === 'number') ? (target.pos.y - 2.1) : 0;
            const c4Item = {
              id: `drop_c4_${Date.now()}`,
              weaponId: 'c4',
              slot: 5,
              pos: target.pos ? { x: target.pos.x, y: groundDropY, z: target.pos.z } : { x: 0, y: 0, z: 0 },
              droppedBy: target.id,
              droppedAt: Date.now()
            };
            dust2Room.droppedItems.push(c4Item);
            dust2Room.broadcast({ type: 'item_dropped', item: c4Item });
            dust2Room.logEvent('C4_DROPPED', `C4 dropped at death of carrier ${target.callsign}`);
          }

          dust2Room.broadcast({
            type: 'player_killed',
            victimId: target.id,
            victimName: target.callsign,
            victimTeam: target.team,
            attackerId: player.id,
            attackerName: player.callsign,
            attackerTeam: player.team,
            weapon: wepKey,
            isHeadshot
          });
        }
        break;
      }

      case 'player_shot': {
        if (!player || !player.isAlive) break;
        player.lastInputAt = Date.now();
        dust2Room.broadcast({
          type: 'player_shot',
          shooterId: playerId,
          weaponId: packet.weaponId || player.activeWeapon || 'ak47',
          audioType: packet.audioType || 'primary',
          isSilenced: !!packet.isSilenced,
          pos: packet.pos || player.pos
        }, playerId);
        break;
      }

      case 'drop_weapon': {
        if (!player || !player.isAlive || !packet.weaponId) break;
        player.lastInputAt = Date.now();
        const dropWepId = String(packet.weaponId).toLowerCase();

        // Cannot drop knife
        if (dropWepId === 'knife') {
          ws.send(JSON.stringify({ type: 'drop_error', reason: 'Cannot drop knife' }));
          break;
        }

        // Verify player owns weapon
        player.inventory = player.inventory || {};
        let foundSlot = null;
        if (player.inventory[1] === dropWepId) foundSlot = 1;
        else if (player.inventory[2] === dropWepId) foundSlot = 2;
        else if (Array.isArray(player.inventory[4]) && player.inventory[4].includes(dropWepId)) foundSlot = 4;
        else if (dropWepId === 'c4' && player.hasC4) foundSlot = 5;

        if (!foundSlot) {
          ws.send(JSON.stringify({ type: 'drop_error', reason: `You do not own ${dropWepId}` }));
          break;
        }

        // Remove from inventory
        if (foundSlot === 1) player.inventory[1] = null;
        else if (foundSlot === 2) player.inventory[2] = (player.team === 'CT' ? 'usp' : 'glock');
        else if (foundSlot === 4) {
          const idx = player.inventory[4].indexOf(dropWepId);
          if (idx !== -1) player.inventory[4].splice(idx, 1);
        } else if (foundSlot === 5) {
          player.hasC4 = false;
          dust2Room.c4CarrierId = null;
          player.inventory[5] = null;
        }

        player.activeWeapon = player.inventory[1] || player.inventory[2] || 'knife';

        if (player.purchases) {
          const pObj = player.purchases.slice().reverse().find(p => p.weaponId === dropWepId && !p.refunded && !p.dropped);
          if (pObj) pObj.dropped = true;
        }

        const dropItem = {
          id: `drop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          weaponId: dropWepId,
          slot: foundSlot,
          pos: packet.pos || player.pos,
          droppedBy: player.id,
          droppedAt: Date.now()
        };
        dust2Room.droppedItems.push(dropItem);

        dust2Room.logEvent('DROP', `${player.callsign} dropped ${dropWepId} at (${dropItem.pos.x.toFixed(1)}, ${dropItem.pos.y.toFixed(1)}, ${dropItem.pos.z.toFixed(1)})`);

        dust2Room.broadcast({
          type: 'item_dropped',
          item: dropItem
        });
        break;
      }

      case 'pickup_weapon': {
        if (!player || !player.isAlive || !packet.weaponId) break;
        player.lastInputAt = Date.now();
        const pickWepId = String(packet.weaponId).toLowerCase();

        // Find nearest matching drop
        const idx = dust2Room.droppedItems.findIndex(d =>
          (packet.itemId && d.id === packet.itemId) || (d.weaponId === pickWepId)
        );

        if (idx === -1) {
          ws.send(JSON.stringify({ type: 'pickup_error', reason: 'Item no longer exists on ground' }));
          break;
        }

        const item = dust2Room.droppedItems[idx];

        // Distance check
        if (player.pos && item.pos) {
          const dist = Math.hypot(player.pos.x - item.pos.x, player.pos.z - item.pos.z);
          if (dist > 3.5) {
            ws.send(JSON.stringify({ type: 'pickup_error', reason: 'Too far away to pick up' }));
            break;
          }
        }

        // Slot validation: if picking up primary and already holding one, drop old primary first
        player.inventory = player.inventory || {};
        const wepDef = WEAPON_REGISTRY[pickWepId] || { slot: 1 };
        const slot = (typeof wepDef.slot === 'number') ? wepDef.slot : 1;

        if (slot === 1 && player.inventory[1]) {
          const oldWep = player.inventory[1];
          player.inventory[1] = null;
          const swapDrop = {
            id: `drop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            weaponId: oldWep,
            slot: 1,
            pos: player.pos,
            droppedBy: player.id,
            droppedAt: Date.now()
          };
          dust2Room.droppedItems.push(swapDrop);
          dust2Room.broadcast({ type: 'item_dropped', item: swapDrop });
        }

        // Remove from ground
        dust2Room.droppedItems.splice(idx, 1);

        // Equip into inventory
        if (slot === 1) player.inventory[1] = pickWepId;
        else if (slot === 2) player.inventory[2] = pickWepId;
        else if (slot === 4) {
          player.inventory[4] = player.inventory[4] || [];
          player.inventory[4].push(pickWepId);
        } else if (slot === 5 && player.team === 'T') {
          player.hasC4 = true;
          dust2Room.c4CarrierId = player.id;
          player.inventory[5] = 'c4';
        }

        player.activeWeapon = pickWepId;

        dust2Room.logEvent('PICKUP', `${player.callsign} picked up ${pickWepId}`);

        dust2Room.broadcast({
          type: 'item_picked_up',
          itemId: item.id,
          weaponId: pickWepId,
          pickerId: player.id,
          inventory: player.inventory
        });
        break;
      }

      case 'pickup_c4': {
        if (!player || !player.isAlive || player.team !== 'T' || dust2Room.c4Planted || dust2Room.c4CarrierId) break;
        player.lastInputAt = Date.now();
        player.hasC4 = true;
        dust2Room.c4CarrierId = player.id;
        player.inventory = player.inventory || {};
        player.inventory[5] = 'c4';

        const c4Idx = dust2Room.droppedItems.findIndex(d => d.weaponId === 'c4');
        if (c4Idx !== -1) dust2Room.droppedItems.splice(c4Idx, 1);

        dust2Room.logEvent('PICKUP_C4', `${player.callsign} picked up C4`);

        dust2Room.broadcast({
          type: 'c4_picked_up',
          carrierId: player.id,
          carrierName: player.callsign
        });
        break;
      }

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
