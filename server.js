// CS2 Dedicated Authoritative Game Server
// CS 1.6 & CS2 Competitive MR12 Engine with Overtime & ReGameDLL_CS Combat

const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const crypto = require('crypto');
const { CS16_WEAPONS, HITGROUP_MULTIPLIERS, calculateDamage } = require('./weapon_data');

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';
const BOOT_ID = crypto.randomBytes(4).toString('hex');
const PROCESS_START_TIME = Date.now();

// Global resilience handlers: log error stacks and prevent process termination
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]:', err.stack || err);
  if (global.dust2RoomInstance) {
    global.dust2RoomInstance.logEvent('UNCAUGHT_ERR', (err.message || String(err)).substring(0, 100));
  }
});
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]:', reason);
  if (global.dust2RoomInstance) {
    global.dust2RoomInstance.logEvent('UNHANDLED_REJ', String(reason).substring(0, 100));
  }
});

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

// Merge authentic CS stats with equipment definitions
const WEAPON_REGISTRY = Object.assign({}, CS16_WEAPONS, {
  vest: { price: 650, team: 'ANY', slot: 'armor', reward: 0 },
  kevlar: { price: 650, team: 'ANY', slot: 'armor', reward: 0 },
  helmet: { price: 1000, team: 'ANY', slot: 'helmet', reward: 0 },
  vesthelm: { price: 1000, team: 'ANY', slot: 'helmet', reward: 0 },
  defuser: { price: 400, team: 'CT', slot: 'kit', reward: 0 },
  // Aliases for CS2 / CS:GO / client names
  mp5sd: CS16_WEAPONS.mp5,
  ssg08: CS16_WEAPONS.scout,
  m4a4: CS16_WEAPONS.m4a1,
  m4a1s: CS16_WEAPONS.m4a1s || CS16_WEAPONS.m4a1,
  p250: CS16_WEAPONS.p228,
  sg553: CS16_WEAPONS.sg552,
  dualberettas: CS16_WEAPONS.elite,
  mag7: CS16_WEAPONS.mag7 || CS16_WEAPONS.m3,
  sawedoff: CS16_WEAPONS.sawedoff || CS16_WEAPONS.m3,
  nova: CS16_WEAPONS.nova || CS16_WEAPONS.m3,
  negev: CS16_WEAPONS.negev || CS16_WEAPONS.m249,
  scar20: CS16_WEAPONS.scar20 || CS16_WEAPONS.g3sg1,
  incgrenade: CS16_WEAPONS.molotov
});

function isInsideBombsite(pos) {
  if (!pos) return null;
  // Bombsite A: authentic site bounds
  if (pos.x >= 40.0 && pos.x <= 66.0 && pos.z >= -122.0 && pos.z <= -98.0 && (pos.y === undefined || (pos.y >= -5.0 && pos.y <= 12.0))) {
    return 'A';
  }
  // Bombsite B: authentic site bounds
  if (pos.x >= -85.0 && pos.x <= -58.0 && pos.z >= -136.0 && pos.z <= -108.0 && (pos.y === undefined || (pos.y >= -5.0 && pos.y <= 12.0))) {
    return 'B';
  }
  return null;
}

// ============================================================================
// ROOM & MATCH STATE (Authoritative In-Memory Game Simulation)
// ============================================================================

class GameRoom {
  constructor(name = 'dust2') {
    this.name = name;
    this.bootId = BOOT_ID;
    this.matchId = crypto.randomBytes(6).toString('hex');
    this.lastMatchIdResetReason = 'initial_boot';
    this.emptyRoomGraceTimer = null;
    this.players = new Map();

    // Match scoring and competitive rules
    this.currentRound = 1;
    this.ctScore = 0;
    this.tScore = 0;
    this.isOvertime = false;
    this.otNumber = 0;
    this.otRoundsPlayed = 0;
    this.consecutiveLosses = { CT: 0, T: 0 };

    // Timing
    this.phase = 'freeze';
    this.freezeDuration = 15;
    this.phaseTimer = 15;
    this.phaseEndTime = Date.now() + 15000;
    this.roundStartTime = Date.now();
    this.buyEndsAt = this.roundStartTime + 30000; // strictly 30s from round start

    // C4 & Objectives
    this.c4CarrierId = null;
    this.c4Planted = false;
    this.c4PlantedThisRound = false;
    this.c4Site = null;
    this.c4Pos = null;
    this.c4ExplodeTime = 0;
    this.c4DefuseProgress = 0;
    this.c4Defuser = null;
    this.droppedItems = [];

    // History and logging (Ring buffer of last 50 events)
    this.eventLog = [];
    this.tickInterval = null;
    this.snapshotInterval = null;
    this.heartbeatInterval = null;
    this.zeroTimerTicks = 0;

    global.dust2RoomInstance = this;
    this.logEvent('ROOM_BOOT', `Dust2Room created. Boot ID: ${this.bootId}, Match ID: ${this.matchId}`);
  }

  logEvent(type, details) {
    const iso = new Date().toISOString();
    const entry = { iso, matchId: this.matchId, round: this.currentRound, phase: this.phase, type, details };
    this.eventLog.push(entry);
    if (this.eventLog.length > 50) this.eventLog.shift();
    console.log(`[EVENT][${iso}][${this.matchId}][R${this.currentRound}][${this.phase}] ${type}: ${details}`);
  }

  startLoops() {
    if (this.tickInterval) return;

    // Simulation Clock: 10 Hz
    this.tickInterval = setInterval(() => {
      try {
        this.updateClock();
      } catch (err) {
        console.error('[SIMULATION EXCEPTION]:', err.stack);
      }
    }, 100);

    // Network Snapshot: 25 Hz
    this.snapshotInterval = setInterval(() => {
      try {
        this.broadcastSnapshot();
      } catch (err) {
        console.error('[SNAPSHOT EXCEPTION]:', err.stack);
      }
    }, 40);

    // Protocol Heartbeat Sweep: every 15s, prune sockets inactive > 45s
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      for (const [id, p] of this.players.entries()) {
        if (!p.ws || p.ws.readyState !== WebSocket.OPEN) {
          this.removePlayer(id);
          continue;
        }
        if (p.lastInputAt && (now - p.lastInputAt > 45000)) {
          this.logEvent('HEARTBEAT_DROP', `Player ${p.callsign} (${id}) timed out after 45s of total silence`);
          try { p.ws.terminate(); } catch (e) {}
          this.removePlayer(id);
        }
      }
    }, 15000);

    this.logEvent('ROOM_START', `Simulation active. Match ID: ${this.matchId}`);
  }

  ensureSimulationRunning() {
    if (this.tickInterval) return;
    this.tickInterval = setInterval(() => {
      try { this.updateClock(); } catch (err) { console.error('[SIMULATION EXCEPTION]:', err.stack); }
    }, 100);
    this.snapshotInterval = setInterval(() => {
      try { this.broadcastSnapshot(); } catch (err) { console.error('[SNAPSHOT EXCEPTION]:', err.stack); }
    }, 40);
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      for (const [id, p] of this.players.entries()) {
        if (!p.ws || p.ws.readyState !== 1) { // 1 = WebSocket.OPEN
          this.removePlayer(id);
          continue;
        }
        if (p.lastInputAt && (now - p.lastInputAt > 45000)) {
          this.logEvent('HEARTBEAT_DROP', `Player ${p.callsign} (${id}) timed out after 45s of total silence`);
          try { p.ws.terminate(); } catch (e) {}
          this.removePlayer(id);
        }
      }
    }, 15000);
    this.logEvent('ROOM_RESUME', `Simulation resumed. Match ID: ${this.matchId}`);
  }

  stopLoopsIfEmpty() {
    if (this.players.size > 0) return;
    if (this.emptyRoomGraceTimer) return;

    this.logEvent('ROOM_GRACE_START', 'Room empty. 60s grace timer active before sleeping loops.');
    this.emptyRoomGraceTimer = setTimeout(() => {
      if (this.players.size === 0) {
        clearInterval(this.tickInterval);
        clearInterval(this.snapshotInterval);
        clearInterval(this.heartbeatInterval);
        this.tickInterval = null;
        this.snapshotInterval = null;
        this.heartbeatInterval = null;

        this.lastMatchIdResetReason = 'empty_room_60s_timeout';
        this.matchId = crypto.randomBytes(6).toString('hex');
        this.currentRound = 1;
        this.ctScore = 0;
        this.tScore = 0;
        this.isOvertime = false;
        this.otNumber = 0;
        this.otRoundsPlayed = 0;
        this.phase = 'freeze';
        this.phaseTimer = 15;
        this.c4CarrierId = null;
        this.c4Planted = false;
        this.droppedItems = [];

        this.logEvent('ROOM_SLEEP', `Room empty for 60s. Simulation paused. Fresh matchId: ${this.matchId}`);
      }
      this.emptyRoomGraceTimer = null;
    }, 60000);
  }

  updateClock() {
    const now = Date.now();
    const remaining = Math.max(0, Math.ceil((this.phaseEndTime - now) / 1000));
    this.phaseTimer = remaining;

    if (this.c4Planted) {
      const c4Remain = Math.max(0, Math.ceil((this.c4ExplodeTime - now) / 1000));
      this.phaseTimer = c4Remain;

      if (now >= this.c4ExplodeTime && this.phase === 'live') {
        this.logEvent('BOMB_EXPLODED', 'C4 timer expired. Bomb detonated. Terrorists win round.');
        this.onBombExploded();
        this.endRound('T', 'TARGET_DESTROYED');
        return;
      }
    }

    if (remaining <= 0) {
      if (this.phase === 'freeze') {
        this.phase = 'live';
        this.phaseTimer = 115;
        this.phaseEndTime = now + 115000;
        this.zeroTimerTicks = 0;
        this.logEvent('PHASE_CHANGE', 'Freezetime ended. Round is now LIVE (1:55).');
        this.broadcast({
          type: 'phase_change',
          phase: 'live',
          timer: 115,
          phaseEndTime: this.phaseEndTime
        });
        return;
      }

      if (this.phase === 'live') {
        if (!this.c4Planted) {
          this.logEvent('TIME_EXPIRED', 'Round timer expired without C4 planted. Counter-Terrorists win.');
          this.endRound('CT', 'TARGET_PRESERVED');
          return;
        }
      }

      if (this.phase === 'round_over') {
        this.zeroTimerTicks++;
        if (this.zeroTimerTicks >= 2) {
          this.startNextRound();
        }
        return;
      }
    }

    // Elimination check during live phase
    if (this.phase === 'live') {
      this.checkElimination();
    }
  }

  checkElimination() {
    if (this.phase !== 'live') return;
    const ctSpawned = [];
    const tSpawned = [];
    let ctAlive = 0;
    let tAlive = 0;

    for (const p of this.players.values()) {
      if (p.team === 'CT' && p.spawnedThisRound) {
        ctSpawned.push(p);
        if (p.isAlive) ctAlive++;
      } else if (p.team === 'T' && p.spawnedThisRound) {
        tSpawned.push(p);
        if (p.isAlive) tAlive++;
      }
    }

    if (ctSpawned.length > 0 && tSpawned.length > 0) {
      if (ctAlive === 0) {
        this.logEvent('ELIMINATION', `All CTs eliminated (0/${ctSpawned.length}). T wins.`);
        this.endRound('T', 'COUNTER_TERRORISTS_ELIMINATED');
      } else if (tAlive === 0 && !this.c4Planted) {
        this.logEvent('ELIMINATION', `All Ts eliminated (0/${tSpawned.length}) without bomb plant. CT wins.`);
        this.endRound('CT', 'TERRORISTS_ELIMINATED');
      }
    }
  }

  startNextRound() {
    this.currentRound++;
    this.zeroTimerTicks = 0;

    // 1. Regular MR12 Halftime after Round 12 (Round 13 begins)
    if (!this.isOvertime && this.currentRound === 13) {
      this.handleHalftime('regulation');
      return;
    }

    // 2. Regular MR12 Match Point Check
    if (!this.isOvertime) {
      if (this.ctScore >= 13) {
        this.endMatch('CT');
        return;
      }
      if (this.tScore >= 13) {
        this.endMatch('T');
        return;
      }
      // 12-12 Tie reached after 24 rounds -> Overtime 1!
      if (this.currentRound > 24) {
        if (this.ctScore === 12 && this.tScore === 12) {
          this.startOvertime();
          return;
        } else {
          this.endMatch(this.ctScore > this.tScore ? 'CT' : 'T');
          return;
        }
      }
    }

    // 3. Overtime Handling (CS2 MR3 Format)
    if (this.isOvertime) {
      this.otRoundsPlayed++;
      const targetWin = 12 + (this.otNumber * 3) + 1; // OT1 target is 16
      if (this.ctScore >= targetWin) {
        this.endMatch('CT');
        return;
      }
      if (this.tScore >= targetWin) {
        this.endMatch('T');
        return;
      }

      // Halftime in Overtime after 3 rounds
      if (this.otRoundsPlayed === 3) {
        this.handleHalftime('overtime');
        return;
      }

      // 6 rounds of OT completed
      if (this.otRoundsPlayed >= 6) {
        if (this.ctScore === this.tScore) {
          this.startOvertime(); // Tie in OT -> Next OT
          return;
        } else {
          this.endMatch(this.ctScore > this.tScore ? 'CT' : 'T');
          return;
        }
      }
    }

    this.setupRoundState();
  }

  handleHalftime(kind = 'regulation') {
    this.logEvent('HALFTIME', `Halftime reached (${kind})! Round ${this.currentRound}. Swapping teams.`);
    
    // Scores belong to TEAMS: swap scores so they follow the swapped teams
    const tempScore = this.ctScore;
    this.ctScore = this.tScore;
    this.tScore = tempScore;
    this.consecutiveLosses = { CT: 0, T: 0 };

    const startMoney = (kind === 'overtime') ? 10000 : 800;

    let hCtIdx = 0;
    let hTIdx = 0;
    for (const p of this.players.values()) {
      p.team = (p.team === 'CT') ? 'T' : 'CT';
      p.money = startMoney;
      p.hasHelmet = false;
      p.armor = 0;
      p.hasDefuseKit = false;
      p.purchases = [];
      p.purchasedThisRound = {};
      p.fired = {};
      p.survivedRound = false;
      p.isAlive = true;
      p.inventory = {
        1: null,
        2: (p.team === 'CT' ? 'usp' : 'glock'),
        3: 'knife',
        4: [],
        5: null
      };
      const spawns = DUST2_SPAWNS[p.team] || DUST2_SPAWNS.T;
      const sIdx = (p.team === 'CT') ? (hCtIdx++ % spawns.length) : (hTIdx++ % spawns.length);
      const sp = spawns[sIdx];
      p.pos = { x: sp.x, y: sp.y, z: sp.z };
      p.yaw = sp.yaw;
      p.spawnIndex = sIdx;
      p.transactions = [{ type: 'halftime', amount: startMoney, balance: startMoney, reason: 'Halftime reset', t: Date.now() }];
    }

    this.broadcast({
      type: 'halftime_swap',
      kind,
      ctScore: this.ctScore,
      tScore: this.tScore,
      round: this.currentRound,
      message: 'HALFTIME - SWITCHING SIDES'
    });

    this.setupRoundState();
  }

  startOvertime() {
    this.isOvertime = true;
    this.otNumber++;
    this.otRoundsPlayed = 0;
    const targetWin = 12 + (this.otNumber * 3) + 1;
    this.logEvent('OVERTIME', `Overtime ${this.otNumber} started (CS2 MR3 competitive rules). Target score: ${targetWin}. All players receive $10,000 start cash.`);

    for (const p of this.players.values()) {
      p.money = 10000;
      p.purchases = [];
      p.transactions = [{ type: 'overtime_start', amount: 10000, balance: 10000, reason: `Overtime ${this.otNumber} cash`, t: Date.now() }];
    }

    this.broadcast({
      type: 'overtime_start',
      otNumber: this.otNumber,
      targetWin,
      ctScore: this.ctScore,
      tScore: this.tScore,
      round: this.currentRound,
      message: `OVERTIME ${this.otNumber} (MR3) - $10,000 START CASH`
    });

    this.setupRoundState();
  }

  setupRoundState() {
    this.phase = 'freeze';
    this.phaseTimer = 15;
    this.phaseEndTime = Date.now() + 15000;
    this.roundStartTime = Date.now();
    this.buyEndsAt = this.roundStartTime + 30000; // 30s buy time from round start
    this.zeroTimerTicks = 0;
    this.c4Planted = false;
    this.c4PlantedThisRound = false;
    this.c4Site = null;
    this.c4Pos = null;
    this.c4DefuseProgress = 0;
    this.c4Defuser = null;
    this.droppedItems = [];

    const livingTs = [];
    let ctIdx = 0;
    let tIdx = 0;

    for (const p of this.players.values()) {
      const survived = (p.survivedRound === true);
      p.isAlive = true;
      p.inMatch = true;
      p.spawnedThisRound = true;
      p.health = 100;
      p.hasC4 = false;
      p.purchases = [];
      p.purchasedThisRound = {};
      p.fired = {};
      p.roundDamage = 0;

      if (survived && p.inventory) {
        p.inventory[1] = p.inventory[1] || null;
        p.inventory[2] = p.inventory[2] || (p.team === 'CT' ? 'usp' : 'glock');
        p.inventory[3] = 'knife';
        p.inventory[5] = null;
      } else {
        p.inventory = {
          1: null,
          2: (p.team === 'CT' ? 'usp' : 'glock'),
          3: 'knife',
          4: [],
          5: null
        };
        p.armor = 0;
        p.hasHelmet = false;
        p.hasDefuseKit = false;
      }
      p.activeWeapon = p.inventory[1] || p.inventory[2] || 'knife';
      p.survivedRound = false;

      const teamSpawns = DUST2_SPAWNS[p.team] || DUST2_SPAWNS.T;
      const sIdx = (p.team === 'CT') ? (ctIdx++ % teamSpawns.length) : (tIdx++ % teamSpawns.length);
      const sp = teamSpawns[sIdx];
      p.pos = { x: sp.x, y: sp.y, z: sp.z };
      p.yaw = sp.yaw;
      p.spawnIndex = sIdx;
      if (p.team === 'T') livingTs.push(p);
    }

    if (livingTs.length > 0) {
      const luckyT = livingTs[Math.floor(Math.random() * livingTs.length)];
      luckyT.hasC4 = true;
      luckyT.inventory[5] = 'c4';
      this.c4CarrierId = luckyT.id;
    } else {
      this.c4CarrierId = null;
    }

    this.logEvent('ROUND_START', `Round ${this.currentRound} started. C4 Carrier: ${this.c4CarrierId || 'none'}. CT: ${this.ctScore}, T: ${this.tScore}`);

    this.broadcast({
      type: 'round_start',
      round: this.currentRound,
      phase: 'freeze',
      timer: 15,
      phaseEndTime: this.phaseEndTime,
      buyEndsAt: this.buyEndsAt,
      buySecondsRemaining: 30,
      ctScore: this.ctScore,
      tScore: this.tScore,
      isOvertime: this.isOvertime,
      otNumber: this.otNumber,
      c4CarrierId: this.c4CarrierId,
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        team: p.team,
        inventory: p.inventory,
        armor: p.armor || 0,
        hasHelmet: !!p.hasHelmet,
        hasDefuseKit: !!p.hasDefuseKit,
        money: p.money
      }))
    });
  }

  endRound(winnerTeam, reason) {
    if (this.phase === 'round_over') return;

    this.phase = 'round_over';
    this.phaseTimer = 5;
    this.phaseEndTime = Date.now() + 5000;
    this.zeroTimerTicks = 0;

    const loserTeam = (winnerTeam === 'CT') ? 'T' : 'CT';
    this.consecutiveLosses[loserTeam] = (this.consecutiveLosses[loserTeam] || 0) + 1;
    this.consecutiveLosses[winnerTeam] = 0;

    if (winnerTeam === 'CT') {
      this.ctScore++;
    } else if (winnerTeam === 'T') {
      this.tScore++;
    }

    // Tag surviving players for loadout persistence
    for (const p of this.players.values()) {
      if (p.isAlive && p.spawnedThisRound) {
        p.survivedRound = true;
      }
    }

    // CS2 Economy Rewards
    const lossStreak = Math.min(4, this.consecutiveLosses[loserTeam]);
    const lossReward = 1400 + lossStreak * 500;
    let winReward = 3250;
    if (reason === 'BOMB_DEFUSED' || reason === 'TARGET_DESTROYED') {
      winReward = 3500;
    }

    // Compute Round MVP (player on winning team with most round damage)
    let roundMvp = null;
    let mvpPlayer = null;
    let maxDamage = -1;
    for (const p of this.players.values()) {
      if (p.team === winnerTeam && p.roundDamage > maxDamage && p.roundDamage > 0) {
        maxDamage = p.roundDamage;
        mvpPlayer = p;
        roundMvp = { name: p.callsign, reason: `most damage dealt (${p.roundDamage} dmg)` };
      }
    }
    if (!roundMvp) {
      const winPlayers = [...this.players.values()].filter(p => p.team === winnerTeam);
      const lucky = winPlayers.length > 0 ? winPlayers[0] : null;
      mvpPlayer = lucky;
      roundMvp = lucky ? { name: lucky.callsign, reason: 'round contribution' } : { name: 'Player', reason: 'objective win' };
    }
    if (mvpPlayer) {
      mvpPlayer.mvps = (mvpPlayer.mvps || 0) + 1;
    }

    for (const p of this.players.values()) {
      p.transactions = p.transactions || [];
      if (p.team === winnerTeam) {
        p.money = Math.min(16000, p.money + winReward);
        p.transactions.push({
          type: 'round_win',
          amount: winReward,
          balance: p.money,
          reason: `Round win (${reason})`,
          t: Date.now()
        });
      } else {
        p.money = Math.min(16000, p.money + lossReward);
        p.transactions.push({
          type: 'round_loss',
          amount: lossReward,
          balance: p.money,
          reason: `Round loss (${lossStreak} streak: +$${lossReward})`,
          t: Date.now()
        });
      }
      if (p.transactions.length > 20) p.transactions.shift();
    }

    this.lastWinner = winnerTeam;
    this.lastRoundReason = reason;
    this.lastMvp = roundMvp;
    this.logEvent('ROUND_OVER', `Winner: ${winnerTeam} (${reason}). Score: CT ${this.ctScore} - ${this.tScore} T. MVP: ${roundMvp.name}`);

    this.broadcast({
      type: 'round_over',
      winner: winnerTeam,
      reason: reason,
      ctScore: this.ctScore,
      tScore: this.tScore,
      round: this.currentRound,
      isOvertime: this.isOvertime,
      otNumber: this.otNumber,
      timer: 5,
      phaseEndTime: this.phaseEndTime,
      mvp: roundMvp
    });
  }

  onBombExploded() {
    const bombPos = this.c4Pos || { x: 0, y: 0, z: 0 };
    for (const player of this.players.values()) {
      if (player.isAlive && player.pos) {
        const dist = Math.hypot(player.pos.x - bombPos.x, player.pos.y - bombPos.y, player.pos.z - bombPos.z);
        if (dist < 40) {
          const blastDamage = Math.round(500 * Math.max(0, 1 - dist / 40));
          player.health = Math.max(0, player.health - blastDamage);
          if (player.health <= 0) {
            player.isAlive = false;
            player.deaths++;
            this.broadcast({
              type: 'player_killed',
              targetId: player.id,
              victimId: player.id,
              victimName: player.callsign,
              victimTeam: player.team,
              attackerName: 'C4 Explosive',
              weapon: 'c4',
              isHeadshot: false
            });
          }
        }
      }
    }
  }

  onBombDefused(defuserId) {
    const defuser = this.players.get(defuserId);
    if (defuser) {
      defuser.money = Math.min(16000, defuser.money + 300);
      defuser.transactions = defuser.transactions || [];
      defuser.transactions.push({
        type: 'defuse_reward',
        amount: 300,
        balance: defuser.money,
        reason: 'Bomb defusal bonus',
        t: Date.now()
      });
    }
    this.endRound('CT', 'BOMB_DEFUSED');
  }

  endMatch(winnerSide) {
    if (this.phase === 'match_over') return;
    this.phase = 'match_over';
    const winner = winnerSide || (this.ctScore > this.tScore ? 'CT' : (this.tScore > this.ctScore ? 'T' : 'TIE'));
    const winnerTitle = (winner === 'CT') ? 'COUNTER-TERRORISTS WIN' : ((winner === 'T') ? 'TERRORISTS WIN' : 'MATCH TIED');

    let mvp = null;
    let highestKills = -1;
    for (const p of this.players.values()) {
      if (p.kills > highestKills) {
        highestKills = p.kills;
        mvp = { name: p.callsign, reason: `${p.kills} kills in the match` };
      }
    }
    if (!mvp) mvp = { name: 'Player', reason: 'match MVP' };

    this.logEvent('MATCH_OVER', `Match concluded! Winner: ${winnerTitle}. Final Score: CT ${this.ctScore} - ${this.tScore} T. MVP: ${mvp.name}`);

    this.broadcast({
      type: 'match_over',
      winner: winner,
      winnerTitle: winnerTitle,
      ctScore: this.ctScore,
      tScore: this.tScore,
      mvp: mvp
    });

    // 8-second victory celebration then start new match
    setTimeout(() => {
      this.startNewMatch();
    }, 8000);
  }

  startNewMatch() {
    this.lastMatchIdResetReason = 'match_completed_reset';
    this.matchId = crypto.randomBytes(6).toString('hex');
    this.currentRound = 1;
    this.ctScore = 0;
    this.tScore = 0;
    this.isOvertime = false;
    this.otNumber = 0;
    this.otRoundsPlayed = 0;

    for (const p of this.players.values()) {
      p.money = 800;
      p.kills = 0;
      p.deaths = 0;
      p.roundDamage = 0;
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
      p.transactions = [{ type: 'match_reset', amount: 800, balance: 800, reason: 'New match start', t: Date.now() }];
    }

    this.logEvent('NEW_MATCH', `New match started. Fresh match ID: ${this.matchId}`);
    this.setupRoundState();
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
        mvps: p.mvps || 0,
        money: p.money,
        inventory: p.inventory,
        transactions: p.transactions ? p.transactions.slice(-5) : []
      });
    }

    const snapshot = {
      type: 'snapshot',
      t: Date.now(),
      serverTime: Date.now(),
      phase: this.phase,
      timer: this.phaseTimer,
      phaseEndTime: this.phaseEndTime,
      buyEndsAt: this.buyEndsAt,
      buySecondsRemaining: Math.max(0, Math.ceil((this.buyEndsAt - Date.now()) / 1000)),
      matchId: this.matchId,
      ctScore: this.ctScore,
      tScore: this.tScore,
      round: this.currentRound,
      isOvertime: this.isOvertime,
      otNumber: this.otNumber,
      c4Planted: this.c4Planted,
      c4Pos: this.c4Pos,
      c4Site: this.c4Site,
      dropsCount: this.droppedItems.length,
      drops: this.droppedItems,
      players: playersData
    };

    this.broadcast(snapshot);
  }

  addPlayer(id, ws, callsign, team = 'CT', sessionId = null) {
    this.ensureSimulationRunning();
    if (this.emptyRoomGraceTimer) {
      clearTimeout(this.emptyRoomGraceTimer);
      this.emptyRoomGraceTimer = null;
      this.logEvent('ROOM_RESUME', 'Player rejoined during grace period. Preserved match.');
    }

    const isFirstPlayer = (this.players.size === 0);
    const cleanCallsign = (typeof callsign === 'string' && callsign.trim().length >= 2)
      ? callsign.trim().substring(0, 16).replace(/[<>&"']/g, '')
      : `Agent_${id.substring(0, 5)}`;

    // Reconnection via persistent sessionId: rebind socket and maintain state without clone
    if (sessionId) {
      for (const [existingId, p] of this.players.entries()) {
        if (p.sessionId === sessionId) {
          this.logEvent('RECONNECT_SESSION', `Player ${cleanCallsign} (${id}) reconnected to session ${sessionId} (replacing socket ${existingId})`);
          if (p.ws && p.ws !== ws) {
            try { p.ws.close(1000, 'Replaced by new connection'); } catch (e) {}
          }
          p.ws = ws;
          p.id = id;
          p.callsign = cleanCallsign;
          p.lastInputAt = Date.now();
          this.players.delete(existingId);
          this.players.set(id, p);

          ws.send(JSON.stringify({
            type: 'match_sync',
            matchId: this.matchId,
            playerId: id,
            callsign: p.callsign,
            team: p.team,
            inMatch: p.inMatch,
            money: p.money,
            inventory: p.inventory,
            activeWeapon: p.activeWeapon,
            isAlive: p.isAlive,
            pos: p.pos,
            ctScore: this.ctScore,
            tScore: this.tScore,
            currentRound: this.currentRound,
            phase: this.phase,
            phaseTimer: this.phaseTimer,
            phaseEndTime: this.phaseEndTime,
            buyEndsAt: this.buyEndsAt
          }));
          return;
        }
      }
    }

    // Callsign deduplication starting at _1 (Rule 9)
    let finalCallsign = cleanCallsign;
    let disambigCounter = 1;
    while ([...this.players.values()].some(p => p.callsign && p.callsign.toLowerCase() === finalCallsign.toLowerCase())) {
      finalCallsign = `${cleanCallsign}_${disambigCounter++}`;
    }

    if (isFirstPlayer) {
      this.currentRound = 1;
      this.ctScore = 0;
      this.tScore = 0;
      this.phase = 'freeze';
      this.phaseTimer = 15;
      this.phaseEndTime = Date.now() + 15000;
      this.roundStartTime = Date.now();
      this.buyEndsAt = this.roundStartTime + 30000;
      this.c4Planted = false;
      this.c4CarrierId = (team === 'T') ? id : null;
      this.c4Pos = null;
      this.c4Site = null;
      this.droppedItems = [];
    }

    // Rule 6: Player who connects during live or round_over must NOT spawn: they spectate until next round_start!
    const shouldSpawn = isFirstPlayer || (this.phase === 'freeze');

    let tCount = 0;
    let ctCount = 0;
    for (const p of this.players.values()) {
      if (p.team === 'T') tCount++;
      else ctCount++;
    }

    let assignedTeam = (team === 'T') ? 'T' : (team === 'CT' ? 'CT' : (tCount <= ctCount ? 'T' : 'CT'));
    if (this.players.size === 0 && !team) {
      assignedTeam = 'T';
    }

    const playerTeam = assignedTeam;
    const teamSpawns = DUST2_SPAWNS[playerTeam] || DUST2_SPAWNS.T;
    const initialSpawn = teamSpawns[0];

    const player = {
      id: id,
      ws: ws,
      callsign: finalCallsign,
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
      hasC4: (playerTeam === 'T' && shouldSpawn && (isFirstPlayer || (!this.c4CarrierId && !this.c4Planted))),
      pos: { x: initialSpawn.x, y: initialSpawn.y, z: initialSpawn.z },
      yaw: initialSpawn.yaw,
      pitch: 0,
      spawnIndex: 0,
      crouch: false,
      sessionId: sessionId,
      lastInputAt: Date.now()
    };

    if (player.hasC4) {
      player.inventory[5] = 'c4';
      this.c4CarrierId = id;
    }

    this.players.set(id, player);
    this.startLoops();

    this.logEvent('PLAYER_JOIN', `${player.callsign} (${id}) joined ${player.team}. Spawning=${shouldSpawn} (phase: ${this.phase}). Total: ${this.players.size}`);

    ws.send(JSON.stringify({
      type: 'match_sync',
      matchId: this.matchId,
      playerId: id,
      callsign: player.callsign,
      team: player.team,
      phase: this.phase,
      phaseTimer: this.phaseTimer,
      phaseEndTime: this.phaseEndTime,
      buyEndsAt: this.buyEndsAt,
      buySecondsRemaining: Math.max(0, Math.ceil((this.buyEndsAt - Date.now()) / 1000)),
      currentRound: this.currentRound,
      ctScore: this.ctScore,
      tScore: this.tScore,
      isOvertime: this.isOvertime,
      otNumber: this.otNumber,
      isAlive: player.isAlive,
      inMatch: player.inMatch,
      money: player.money,
      inventory: player.inventory,
      activeWeapon: player.activeWeapon,
      hasC4: player.hasC4,
      c4Planted: this.c4Planted,
      c4CarrierId: this.c4CarrierId,
      dropsCount: this.droppedItems.length,
      drops: this.droppedItems
    }));

    this.broadcast({
      type: 'player_joined',
      id: id,
      callsign: player.callsign,
      team: player.team,
      isAlive: player.isAlive,
      inMatch: player.inMatch
    }, ws);
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;

    if (p.hasC4 && !this.c4Planted) {
      p.hasC4 = false;
      this.c4CarrierId = null;
      const dropPos = p.pos || { x: -65.0, y: 7.96, z: 35.0 };
      const dropItem = {
        id: `c4_drop_${Date.now()}`,
        weaponId: 'c4',
        slot: 5,
        pos: dropPos,
        droppedBy: id,
        droppedAt: Date.now()
      };
      this.droppedItems.push(dropItem);
      this.broadcast({ type: 'item_dropped', item: dropItem });
      this.broadcast({ type: 'c4_dropped', pos: dropPos });
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

const dust2Room = new GameRoom('dust2');

// ============================================================================
// HTTP SERVER (Health check & CORS)
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
      bootId: dust2Room.bootId,
      processStartTime: PROCESS_START_TIME,
      uptimeSeconds: Math.floor((Date.now() - PROCESS_START_TIME) / 1000),
      memory: process.memoryUsage(),
      matchId: dust2Room.matchId,
      lastMatchIdResetReason: dust2Room.lastMatchIdResetReason,
      activePlayers: dust2Room.players.size,
      round: dust2Room.currentRound,
      phase: dust2Room.phase,
      ctScore: dust2Room.ctScore,
      tScore: dust2Room.tScore,
      isOvertime: dust2Room.isOvertime,
      otNumber: dust2Room.otNumber,
      serverTime: Date.now(),
      buyEndsAt: dust2Room.buyEndsAt,
      buySecondsRemaining: Math.max(0, Math.ceil((dust2Room.buyEndsAt - Date.now()) / 1000)),
      lastWinner: dust2Room.lastWinner || null,
      lastRoundReason: dust2Room.lastRoundReason || null,
      lastMvp: dust2Room.lastMvp || null,
      eventLog: dust2Room.eventLog.slice(-50)
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status, null, 2));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

// ============================================================================
// WEBSOCKET SERVER
// ============================================================================

const wss = new WebSocketServer({
  server,
  verifyClient: (info, cb) => cb(true)
});

wss.on('connection', (ws, req) => {
  const playerId = 'p_' + crypto.randomBytes(4).toString('hex');
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    let packet;
    try {
      packet = JSON.parse(data);
    } catch (e) {
      return;
    }

    const player = dust2Room.players.get(playerId);

    switch (packet.type) {
      case 'join': {
        dust2Room.addPlayer(playerId, ws, packet.callsign, packet.team, packet.sessionId);
        break;
      }

      case 'player_input':
      case 'movement': {
        if (!player || !player.isAlive || !player.inMatch) break;
        player.lastInputAt = Date.now();
        if (packet.pos) {
          const p = packet.pos;
          const inBounds = (p.x >= -115.0 && p.x <= 85.0 && p.z >= -170.0 && p.z <= 70.0 && p.y >= -12.0 && p.y <= 25.0);
          if (inBounds) {
            player.pos = { x: p.x, y: p.y, z: p.z };
          }
        }
        if (typeof packet.yaw === 'number') player.yaw = packet.yaw;
        if (typeof packet.pitch === 'number') player.pitch = packet.pitch;
        if (typeof packet.crouch === 'boolean') player.crouch = packet.crouch;
        if (packet.weapon) player.weapon = packet.weapon;
        break;
      }

      case 'select_team': {
        if (!player) break;
        player.lastInputAt = Date.now();
        const targetTeam = (packet.team === 'T' || packet.team === 'CT') ? packet.team : (player.team === 'CT' ? 'T' : 'CT');
        player.team = targetTeam;
        const canSpawn = (dust2Room.phase === 'freeze') || (dust2Room.players.size <= 1);
        player.isAlive = canSpawn;
        player.inMatch = canSpawn;
        player.health = canSpawn ? 100 : 0;
        player.hasHelmet = false;
        player.armor = 0;
        player.hasDefuseKit = false;
        player.purchases = [];
        player.purchasedThisRound = {};
        player.fired = {};

        let count = 0;
        for (const [id, p] of dust2Room.players.entries()) {
          if (p.team === targetTeam && id !== playerId) count++;
        }
        const spawnList = DUST2_SPAWNS[targetTeam] || DUST2_SPAWNS.CT;
        const spawnIdx = count % spawnList.length;
        const spawn = spawnList[spawnIdx];
        player.pos = { x: spawn.x, y: spawn.y, z: spawn.z };
        player.yaw = spawn.yaw;

        const isT = (targetTeam === 'T');
        let giveC4 = false;
        if (isT) {
          const hasC4Any = [...dust2Room.players.values()].some(p => p.hasC4 && p.isAlive && p.id !== playerId);
          if (!hasC4Any) {
            giveC4 = true;
            dust2Room.c4CarrierId = playerId;
          }
        } else {
          if (player.hasC4) {
            player.hasC4 = false;
            dust2Room.c4CarrierId = null;
          }
        }
        player.hasC4 = giveC4;

        player.inventory = {
          1: null,
          2: isT ? 'glock' : 'usp',
          3: 'knife',
          4: [],
          5: giveC4 ? 'c4' : null
        };
        player.activeWeapon = player.inventory[2];

        dust2Room.logEvent('SELECT_TEAM', `${player.callsign} (${playerId}) selected team ${targetTeam} at spawn index ${spawnIdx}`);

        ws.send(JSON.stringify({
          type: 'team_changed',
          playerId: playerId,
          team: targetTeam,
          spawnIdx: spawnIdx,
          pos: player.pos,
          yaw: player.yaw,
          hasC4: giveC4,
          inventory: player.inventory,
          activeWeapon: player.activeWeapon
        }));

        dust2Room.broadcast({
          type: 'team_swapped',
          playerId: playerId,
          team: targetTeam,
          callsign: player.callsign,
          pos: player.pos,
          inventory: player.inventory,
          activeWeapon: player.activeWeapon
        });
        dust2Room.broadcastSnapshot();
        break;
      }

      case 'team_swap': {
        if (!player) break;
        player.lastInputAt = Date.now();
        const oldTeam = player.team;
        const newTeam = (oldTeam === 'CT') ? 'T' : 'CT';
        player.team = newTeam;
        player.hasHelmet = false;
        player.armor = 0;
        player.hasDefuseKit = false;
        player.purchases = [];
        player.fired = {};
        player.inventory = {
          1: null,
          2: (newTeam === 'CT' ? 'usp' : 'glock'),
          3: 'knife',
          4: [],
          5: null
        };
        player.activeWeapon = player.inventory[2];

        const spawns = DUST2_SPAWNS[newTeam];
        const s = spawns[Math.floor(Math.random() * spawns.length)];
        player.pos = { x: s.x, y: s.y, z: s.z };
        player.yaw = s.yaw;

        dust2Room.logEvent('TEAM_SWAP', `${player.callsign} (${playerId}) switched from ${oldTeam} to ${newTeam}`);

        dust2Room.broadcast({
          type: 'team_swapped',
          playerId: playerId,
          team: newTeam,
          callsign: player.callsign,
          pos: player.pos,
          inventory: player.inventory,
          activeWeapon: player.activeWeapon
        });
        break;
      }

      case 'buy_item':
      case 'buy_weapon': {
        if (!player || !player.isAlive) break;
        player.lastInputAt = Date.now();
        const wepId = String(packet.weaponId).toLowerCase();
        const wepDef = WEAPON_REGISTRY[wepId];

        if (!wepDef) {
          const reason = `Unknown weapon: ${wepId}`;
          dust2Room.logEvent('BUY_REJECT', `${player.callsign} (${playerId}): ${reason}`);
          ws.send(JSON.stringify({ type: 'buy_error', reason, weaponId: wepId }));
          break;
        }

        const now = Date.now();
        if (now > dust2Room.buyEndsAt) {
          const reason = 'Buy time expired (30s limit reached)';
          dust2Room.logEvent('BUY_REJECT', `${player.callsign} (${playerId}): ${reason}`);
          ws.send(JSON.stringify({ type: 'buy_error', reason, weaponId: wepId }));
          break;
        }

        if (wepDef.team !== 'ANY' && wepDef.team !== player.team) {
          const reason = `Weapon ${wepId} is restricted to ${wepDef.team} team`;
          dust2Room.logEvent('BUY_REJECT', `${player.callsign} (${playerId}): ${reason}`);
          ws.send(JSON.stringify({ type: 'buy_error', reason, weaponId: wepId }));
          break;
        }

        const price = wepDef.price || 0;
        if (player.money < price) {
          const reason = `Insufficient funds for ${wepId} (Need $${price}, have $${player.money})`;
          dust2Room.logEvent('BUY_REJECT', `${player.callsign} (${playerId}): ${reason}`);
          ws.send(JSON.stringify({ type: 'buy_error', reason, weaponId: wepId }));
          break;
        }

        player.money -= price;
        player.inventory = player.inventory || {};
        if (typeof wepDef.slot === 'number') {
          player.inventory[wepDef.slot] = wepId;
          player.activeWeapon = wepId;
        } else if (wepDef.slot === 'armor') {
          player.armor = 100;
        } else if (wepDef.slot === 'helmet') {
          player.armor = 100;
          player.hasHelmet = true;
        } else if (wepDef.slot === 'kit') {
          player.hasDefuseKit = true;
        }

        player.transactions = player.transactions || [];
        player.transactions.push({
          type: 'buy',
          amount: -price,
          balance: player.money,
          reason: `Bought ${wepId}`,
          t: Date.now()
        });
        if (player.transactions.length > 20) player.transactions.shift();

        player.purchasedThisRound = player.purchasedThisRound || {};
        player.purchasedThisRound[wepId] = { price, slot: wepDef.slot };

        dust2Room.logEvent('BUY_ACCEPT', `${player.callsign} bought ${wepId} for $${price}. Balance: $${player.money}`);

        ws.send(JSON.stringify({
          type: 'buy_success',
          weaponId: wepId,
          money: player.money,
          inventory: player.inventory,
          armor: player.armor,
          hasHelmet: player.hasHelmet,
          hasDefuseKit: player.hasDefuseKit
        }));
        break;
      }

      case 'refund_item': {
        if (!player || !player.isAlive) break;
        player.lastInputAt = Date.now();
        const now = Date.now();
        const inBuyWindow = (dust2Room.phase === 'freeze') || (dust2Room.phase === 'live' && now <= dust2Room.buyEndsAt);
        if (!inBuyWindow) {
          const reason = 'Buy and refund period has expired';
          ws.send(JSON.stringify({ type: 'refund_error', reason }));
          break;
        }

        const wepId = packet.weaponId ? String(packet.weaponId).toLowerCase() : null;
        if (!wepId) {
          ws.send(JSON.stringify({ type: 'refund_error', reason: 'Invalid weapon ID' }));
          break;
        }

        player.purchasedThisRound = player.purchasedThisRound || {};
        const purchase = player.purchasedThisRound[wepId];
        if (!purchase) {
          const reason = `Weapon ${wepId} was not purchased in this round and cannot be refunded`;
          ws.send(JSON.stringify({ type: 'refund_error', reason }));
          break;
        }

        const slot = purchase.slot;
        if (typeof slot === 'number') {
          if (!player.inventory || player.inventory[slot] !== wepId) {
            const reason = `Weapon ${wepId} is no longer in inventory to refund`;
            ws.send(JSON.stringify({ type: 'refund_error', reason }));
            break;
          }
          if (slot === 1) {
            player.inventory[1] = null;
          } else if (slot === 2) {
            player.inventory[2] = player.team === 'CT' ? 'usp' : 'glock';
          }
          player.activeWeapon = player.inventory[1] || player.inventory[2] || 'knife';
        }

        const refundAmount = purchase.price || 0;
        player.money = Math.min(16000, player.money + refundAmount);
        delete player.purchasedThisRound[wepId];

        player.transactions = player.transactions || [];
        player.transactions.push({
          type: 'refund',
          amount: refundAmount,
          balance: player.money,
          reason: `Refunded ${wepId}`,
          t: Date.now()
        });
        if (player.transactions.length > 20) player.transactions.shift();

        dust2Room.logEvent('REFUND_ACCEPT', `${player.callsign} refunded ${wepId} (+$${refundAmount}). Balance: $${player.money}`);

        ws.send(JSON.stringify({
          type: 'refund_success',
          weaponId: wepId,
          slot: slot,
          refundAmount: refundAmount,
          remainingMoney: player.money,
          inventory: player.inventory
        }));
        break;
      }

      case 'plant_c4': {
        if (!player || !player.isAlive || player.team !== 'T' || dust2Room.phase !== 'live' || dust2Room.c4Planted) break;
        player.lastInputAt = Date.now();
        const site = packet.site || isInsideBombsite(packet.pos);
        if (!site) {
          dust2Room.logEvent('PLANT_REJECT', `${player.callsign} tried planting outside bombsite`);
          break;
        }

        dust2Room.c4Planted = true;
        dust2Room.c4PlantedThisRound = true;
        dust2Room.c4CarrierId = null;
        player.hasC4 = false;
        if (player.inventory) player.inventory[5] = null;
        dust2Room.c4Site = site;
        dust2Room.c4Pos = packet.pos;
        dust2Room.c4ExplodeTime = Date.now() + 40000;
        dust2Room.phaseTimer = 40;

        dust2Room.logEvent('PLANT_ACCEPT', `C4 planted on site ${site} by ${player.callsign} (${playerId}). 40s to detonation.`);

        dust2Room.broadcast({
          type: 'c4_planted',
          site: site,
          pos: packet.pos,
          planterId: playerId,
          planterName: player.callsign,
          timer: 40
        });
        break;
      }

      case 'defuse_progress': {
        if (!player || !player.isAlive || player.team !== 'CT' || !dust2Room.c4Planted) break;
        player.lastInputAt = Date.now();
        const progress = Math.min(1.0, Math.max(0, packet.progress || 0));
        dust2Room.c4DefuseProgress = progress;
        dust2Room.c4Defuser = playerId;

        if (progress >= 1.0) {
          dust2Room.logEvent('DEFUSE_SUCCESS', `C4 successfully defused by ${player.callsign} (${playerId})`);
          dust2Room.broadcast({
            type: 'c4_defused',
            defuserId: playerId,
            defuserName: player.callsign
          });
          dust2Room.onBombDefused(playerId);
        }
        break;
      }

      case 'damage_hit': {
        if (!player || !player.isAlive || !player.inMatch || !packet.targetId) break;
        if (dust2Room.phase !== 'live') {
          dust2Room.logEvent('DAMAGE_REJECT', `Shooter ${player.callsign} fired outside live round (phase: ${dust2Room.phase})`);
          break;
        }
        const target = dust2Room.players.get(packet.targetId);
        if (!target || !target.isAlive || !target.inMatch || target.team === player.team) {
          dust2Room.logEvent('DAMAGE_REJECT', `Invalid target for ${player.callsign}`);
          break;
        }
        player.lastInputAt = Date.now();
        const wepKey = String(packet.weapon || player.activeWeapon || 'glock').toLowerCase();
        const isStab = !!packet.isStab;
        const hitgroup = packet.hitgroup || (packet.isHeadshot ? 'head' : 'chest');

        // Authoritative ReGameDLL_CS damage calculation
        const res = calculateDamage(wepKey, hitgroup, target.health, target.armor, target.hasHelmet, isStab);

        target.health = res.victimHealthAfter;
        target.armor = res.newArmor;
        player.roundDamage += res.effectiveDamage; // strictly clamped to health removed!

        dust2Room.logEvent('HIT', `${player.callsign} [${wepKey}] -> ${target.callsign} (${res.hitgroup}): base ${res.baseDamage} * ${res.multiplier}x = ${res.hitgroupDamage}dmg, armor-${res.armorDamage} => final ${res.rawFinalDamage}dmg, dealt ${res.effectiveDamage}hp (victim HP: ${res.victimHealthBefore} -> ${res.victimHealthAfter})`);

        dust2Room.broadcast({
          type: 'player_damaged',
          targetId: target.id,
          attackerId: player.id,
          health: target.health,
          armor: target.armor,
          damage: res.effectiveDamage,
          rawDamage: res.rawFinalDamage,
          hitgroup: res.hitgroup,
          isHeadshot: (res.hitgroup === 'head')
        });

        if (target.health <= 0) {
          target.isAlive = false;
          target.deaths++;
          player.kills++;

          const wepDef = CS16_WEAPONS[wepKey] || { reward: 300 };
          const reward = wepDef.reward !== undefined ? wepDef.reward : 300;
          player.money = Math.min(16000, player.money + reward);
          player.transactions = player.transactions || [];
          player.transactions.push({
            type: 'kill',
            amount: reward,
            balance: player.money,
            reason: `Kill with ${wepKey} (+$$${reward})`,
            t: Date.now()
          });
          if (player.transactions.length > 20) player.transactions.shift();

          dust2Room.logEvent('KILL', `${player.callsign} [${wepKey}${res.hitgroup === 'head' ? ' HS' : ''}] ${target.callsign} (Reward: +$$${reward})`);

          const dropPos = target.pos || { x: 0, y: 0, z: 0 };
          if (target.inventory) {
            [1, 2].forEach(slot => {
              const wepId = target.inventory[slot];
              if (wepId) {
                target.inventory[slot] = null;
                const dropItem = {
                  id: `drop_${wepId}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                  weaponId: wepId,
                  slot: slot,
                  pos: { x: dropPos.x + (Math.random() - 0.5) * 0.8, y: dropPos.y, z: dropPos.z + (Math.random() - 0.5) * 0.8 },
                  droppedBy: target.id,
                  droppedAt: Date.now()
                };
                dust2Room.droppedItems.push(dropItem);
                dust2Room.broadcast({ type: 'item_dropped', item: dropItem });
              }
            });
            if (Array.isArray(target.inventory[4]) && target.inventory[4].length > 0) {
              const nade = target.inventory[4].shift();
              if (nade) {
                const dropItem = {
                  id: `drop_${nade}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                  weaponId: nade,
                  slot: 4,
                  pos: { x: dropPos.x + (Math.random() - 0.5) * 0.8, y: dropPos.y, z: dropPos.z + (Math.random() - 0.5) * 0.8 },
                  droppedBy: target.id,
                  droppedAt: Date.now()
                };
                dust2Room.droppedItems.push(dropItem);
                dust2Room.broadcast({ type: 'item_dropped', item: dropItem });
              }
            } else if (typeof target.inventory[4] === 'string' && target.inventory[4]) {
              const nade = target.inventory[4];
              target.inventory[4] = null;
              const dropItem = {
                id: `drop_${nade}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                weaponId: nade,
                slot: 4,
                pos: { x: dropPos.x + (Math.random() - 0.5) * 0.8, y: dropPos.y, z: dropPos.z + (Math.random() - 0.5) * 0.8 },
                droppedBy: target.id,
                droppedAt: Date.now()
              };
              dust2Room.droppedItems.push(dropItem);
              dust2Room.broadcast({ type: 'item_dropped', item: dropItem });
            }
          }

          if (target.hasC4) {
            target.hasC4 = false;
            dust2Room.c4CarrierId = null;
            const c4Item = {
              id: `drop_c4_${Date.now()}`,
              weaponId: 'c4',
              slot: 5,
              pos: { x: dropPos.x + (Math.random() - 0.5) * 0.5, y: dropPos.y, z: dropPos.z + (Math.random() - 0.5) * 0.5 },
              droppedBy: target.id,
              droppedAt: Date.now()
            };
            dust2Room.droppedItems.push(c4Item);
            dust2Room.broadcast({ type: 'item_dropped', item: c4Item });
            dust2Room.logEvent('C4_DROPPED', `C4 dropped at death of carrier ${target.callsign}`);
          }

          dust2Room.broadcast({
            type: 'player_killed',
            targetId: target.id,
            victimId: target.id,
            victimName: target.callsign,
            victimTeam: target.team,
            attackerId: player.id,
            attackerName: player.callsign,
            attackerTeam: player.team,
            weapon: wepKey,
            isHeadshot: (res.hitgroup === 'head')
          });

          dust2Room.checkElimination();
        }
        break;
      }

      case 'grenade_thrown': {
        if (!player || !player.isAlive || !packet.pos) break;
        player.lastInputAt = Date.now();
        dust2Room.broadcast({
          type: 'grenade_thrown',
          throwerId: playerId,
          throwerName: player.callsign,
          grenadeType: packet.grenadeType,
          pos: packet.pos,
          velocity: packet.velocity
        }, ws);
        break;
      }

      case 'flash_detonated': {
        if (!player || !packet.pos) break;
        player.lastInputAt = Date.now();
        dust2Room.broadcast({
          type: 'flash_detonated',
          pos: packet.pos,
          throwerId: playerId
        });
        break;
      }

      case 'drop_weapon': {
        if (!player || !player.isAlive || !packet.weaponId) break;
        player.lastInputAt = Date.now();
        const dropWepId = String(packet.weaponId).toLowerCase();
        if (dropWepId === 'knife') break;

        const dropPos = packet.pos || player.pos || { x: 0, y: 0, z: 0 };
        const dropItem = {
          id: `drop_${Date.now()}_${Math.random().toString(16).substring(2, 6)}`,
          weaponId: dropWepId,
          pos: dropPos,
          droppedBy: player.id,
          droppedAt: Date.now()
        };

        if (dropWepId === 'c4') {
          player.hasC4 = false;
          dust2Room.c4CarrierId = null;
          if (player.inventory) player.inventory[5] = null;
          dust2Room.broadcast({ type: 'c4_dropped', pos: dropPos });
        }

        dust2Room.droppedItems.push(dropItem);
        dust2Room.logEvent('DROP', `${player.callsign} dropped ${dropWepId}`);
        dust2Room.broadcast({ type: 'item_dropped', item: dropItem });
        break;
      }

      case 'pickup_weapon': {
        if (!player || !player.isAlive || !packet.weaponId) break;
        player.lastInputAt = Date.now();
        const pickWepId = String(packet.weaponId).toLowerCase();

        const idx = dust2Room.droppedItems.findIndex(d => (packet.itemId && d.id === packet.itemId) || (d.weaponId === pickWepId));
        if (idx === -1) {
          ws.send(JSON.stringify({ type: 'pickup_error', reason: 'Item no longer exists on ground' }));
          break;
        }

        const item = dust2Room.droppedItems[idx];
        if (pickWepId === 'c4' || item.weaponId === 'c4') {
          if (player.team !== 'T') {
            const reason = 'Only Terrorists can pick up C4';
            dust2Room.logEvent('PICKUP_REJECT', `${player.callsign} (CT) rejected picking up C4`);
            ws.send(JSON.stringify({ type: 'pickup_error', reason }));
            break;
          }
          player.hasC4 = true;
          dust2Room.c4CarrierId = player.id;
          player.inventory = player.inventory || {};
          player.inventory[5] = 'c4';
          dust2Room.droppedItems.splice(idx, 1);
          dust2Room.logEvent('PICKUP_C4', `${player.callsign} picked up C4`);
          dust2Room.broadcast({
            type: 'c4_picked_up',
            carrierId: player.id,
            carrierName: player.callsign,
            itemId: item.id
          });
          dust2Room.broadcast({
            type: 'item_picked_up',
            itemId: item.id,
            weaponId: 'c4',
            pickerId: player.id,
            inventory: player.inventory
          });
          break;
        }

        // Standard weapon pickup
        player.inventory = player.inventory || {};
        const def = WEAPON_REGISTRY[pickWepId] || { slot: 1 };
        const slot = def.slot || 1;
        player.inventory[slot] = pickWepId;
        player.activeWeapon = pickWepId;
        dust2Room.droppedItems.splice(idx, 1);

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
        if (!player || !player.isAlive || dust2Room.c4Planted || dust2Room.c4CarrierId) break;
        player.lastInputAt = Date.now();
        if (player.team !== 'T') {
          const reason = 'Only Terrorists can pick up C4';
          dust2Room.logEvent('PICKUP_REJECT', `${player.callsign} (CT) rejected picking up C4`);
          ws.send(JSON.stringify({ type: 'pickup_error', reason }));
          break;
        }
        player.hasC4 = true;
        dust2Room.c4CarrierId = player.id;
        player.inventory = player.inventory || {};
        player.inventory[5] = 'c4';

        const c4Idx = dust2Room.droppedItems.findIndex(d => d.weaponId === 'c4');
        const c4ItemId = (c4Idx !== -1) ? dust2Room.droppedItems[c4Idx].id : `c4_item_${Date.now()}`;
        if (c4Idx !== -1) dust2Room.droppedItems.splice(c4Idx, 1);

        dust2Room.logEvent('PICKUP_C4', `${player.callsign} picked up C4`);
        dust2Room.broadcast({
          type: 'c4_picked_up',
          carrierId: player.id,
          carrierName: player.callsign,
          itemId: c4ItemId
        });
        dust2Room.broadcast({
          type: 'item_picked_up',
          itemId: c4ItemId,
          weaponId: 'c4',
          pickerId: player.id,
          inventory: player.inventory
        });
        break;
      }

      case 'ping': {
        ws.send(JSON.stringify({ type: 'pong', t: Date.now() }));
        break;
      }
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
  console.log(`CS2 DEDICATED WEBSOCKET SERVER ACTIVE (v12 Engine)`);
  console.log(`Listening on http://${HOST}:${PORT} (ws://${HOST}:${PORT})`);
  console.log(`Health Check: GET http://${HOST}:${PORT}/health`);
  console.log(`================================================================`);
});
