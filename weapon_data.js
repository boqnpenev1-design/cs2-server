// Authentic CS 1.6 Weapon Data & Physics Constants
// Sources:
// 1. Valve GoldSrc SDK 2.3 / ReGameDLL_CS (dlls/weapons.cpp, dlls/player.cpp)
// 2. ReGameDLL_CS weapon classes: CBasePlayerWeapon::KickBack, CBasePlayer::TraceAttack
// 3. Official Counter-Strike 1.6 Weapon Specifications

const CS16_WEAPONS = {
  // Melee
  'knife': {
    id: 'knife',
    name: 'Knife',
    category: 'melee',
    slot: 3,
    price: 0,
    reward: 1500,
    team: 'ANY',
    damageSlash: 15, // ReGameDLL_CS: CKnife::PrimaryAttack (15 base)
    damageStab: 65,  // ReGameDLL_CS: CKnife::SecondaryAttack (65 base)
    damage: 15,
    armorRatio: 0.85,
    clip: null,
    maxReserve: null,
    cycleTime: 0.40,
    reloadTime: 0,
    canScope: false,
    recoil: { vertical: 0, horizontal: 0 }
  },

  // Pistols
  'glock': {
    id: 'glock',
    name: 'Glock-18 Select Fire',
    category: 'pistols',
    slot: 2,
    price: 400,
    reward: 300,
    team: 'T',
    damage: 25, // ReGameDLL_CS: CGlock::FireRemaining (25 semi / 18 burst)
    armorRatio: 0.47,
    clip: 20,
    maxReserve: 120,
    cycleTime: 0.20,
    reloadTime: 2.20,
    canScope: false,
    recoil: { vertical: 2.1, horizontal: 0.4 }
  },
  'usp': {
    id: 'usp',
    name: 'KM .45 Tactical (USP)',
    category: 'pistols',
    slot: 2,
    price: 500,
    reward: 300,
    team: 'CT',
    damage: 34, // ReGameDLL_CS: CUSP::FireRemaining (34 unsilenced, 30 silenced)
    armorRatio: 0.50,
    clip: 12,
    maxReserve: 100,
    cycleTime: 0.225,
    reloadTime: 2.70,
    canScope: false,
    recoil: { vertical: 2.4, horizontal: 0.5 }
  },
  'deagle': {
    id: 'deagle',
    name: 'Night Hawk .50C (Desert Eagle)',
    category: 'pistols',
    slot: 2,
    price: 650,
    reward: 300,
    team: 'ANY',
    damage: 54, // ReGameDLL_CS: CDeagle (54 base damage)
    armorRatio: 0.75,
    clip: 7,
    maxReserve: 35,
    cycleTime: 0.225,
    reloadTime: 2.20,
    canScope: false,
    recoil: { vertical: 4.5, horizontal: 0.8 }
  },
  'p228': {
    id: 'p228',
    name: '228 Compact',
    category: 'pistols',
    slot: 2,
    price: 600,
    reward: 300,
    team: 'ANY',
    damage: 32,
    armorRatio: 0.65,
    clip: 13,
    maxReserve: 52,
    cycleTime: 0.20,
    reloadTime: 2.80,
    canScope: false,
    recoil: { vertical: 2.6, horizontal: 0.5 }
  },
  'fiveseven': {
    id: 'fiveseven',
    name: 'ES Five-Seven',
    category: 'pistols',
    slot: 2,
    price: 750,
    reward: 300,
    team: 'CT',
    damage: 20,
    armorRatio: 0.825,
    clip: 20,
    maxReserve: 100,
    cycleTime: 0.18,
    reloadTime: 2.70,
    canScope: false,
    recoil: { vertical: 2.0, horizontal: 0.4 }
  },
  'elite': {
    id: 'elite',
    name: '.40 Dual Elites',
    category: 'pistols',
    slot: 2,
    price: 800,
    reward: 300,
    team: 'T',
    damage: 36,
    armorRatio: 0.525,
    clip: 30,
    maxReserve: 120,
    cycleTime: 0.14,
    reloadTime: 4.50,
    canScope: false,
    recoil: { vertical: 3.0, horizontal: 0.7 }
  },

  // Rifles
  'ak47': {
    id: 'ak47',
    name: 'CV-47 (AK-47)',
    category: 'rifles',
    slot: 1,
    price: 2500,
    reward: 300,
    team: 'T',
    damage: 36, // ReGameDLL_CS: CAK47 (36 base damage)
    armorRatio: 0.775,
    clip: 30,
    maxReserve: 90,
    cycleTime: 0.0955,
    reloadTime: 2.45,
    canScope: false,
    recoil: { vertical: 7.2, horizontal: 2.4 }
  },
  'm4a1': {
    id: 'm4a1',
    name: 'Maverick M4A1 Carbine',
    category: 'rifles',
    slot: 1,
    price: 3100,
    reward: 300,
    team: 'CT',
    damage: 33, // ReGameDLL_CS: CM4A1 (33 unsilenced, 32 silenced)
    armorRatio: 0.70,
    clip: 30,
    maxReserve: 90,
    cycleTime: 0.0875,
    reloadTime: 3.16,
    canScope: false,
    recoil: { vertical: 5.8, horizontal: 1.8 }
  },
  'galil': {
    id: 'galil',
    name: 'IDF Defender (Galil)',
    category: 'rifles',
    slot: 1,
    price: 2000,
    reward: 300,
    team: 'T',
    damage: 30,
    armorRatio: 0.775,
    clip: 35,
    maxReserve: 90,
    cycleTime: 0.090,
    reloadTime: 3.05,
    canScope: false,
    recoil: { vertical: 6.2, horizontal: 2.1 }
  },
  'famas': {
    id: 'famas',
    name: 'Clarion 5.56 (FAMAS)',
    category: 'rifles',
    slot: 1,
    price: 2250,
    reward: 300,
    team: 'CT',
    damage: 30,
    armorRatio: 0.70,
    clip: 25,
    maxReserve: 90,
    cycleTime: 0.0825,
    reloadTime: 3.30,
    canScope: false,
    recoil: { vertical: 5.5, horizontal: 1.6 }
  },
  'aug': {
    id: 'aug',
    name: 'Bullpup (AUG)',
    category: 'rifles',
    slot: 1,
    price: 3500,
    reward: 300,
    team: 'CT',
    damage: 32,
    armorRatio: 0.70,
    clip: 30,
    maxReserve: 90,
    cycleTime: 0.090,
    reloadTime: 3.30,
    canScope: true,
      zoomLevels: [55],
    scopeLevels: [55],
    recoil: { vertical: 5.4, horizontal: 1.7 }
  },
  'sg552': {
    id: 'sg552',
    name: 'Krieg 552',
    category: 'rifles',
    slot: 1,
    price: 3500,
    reward: 300,
    team: 'T',
    damage: 33,
    armorRatio: 0.70,
    clip: 30,
    maxReserve: 90,
    cycleTime: 0.085,
    reloadTime: 3.30,
    canScope: true,
      zoomLevels: [55],
    scopeLevels: [55],
    recoil: { vertical: 5.6, horizontal: 1.9 }
  },

  // Snipers
  'awp': {
    id: 'awp',
    name: 'Magnum Sniper Rifle (AWP)',
    category: 'snipers',
    slot: 1,
    price: 4750,
    reward: 100,
    team: 'ANY',
    damage: 115, // ReGameDLL_CS: CAWP (115 base damage)
    armorRatio: 0.975,
    clip: 10,
    maxReserve: 30,
    cycleTime: 1.45,
    reloadTime: 2.75,
    canScope: true,
      zoomLevels: [40, 12],
    scopeLevels: [40, 10],
    recoil: { vertical: 8.5, horizontal: 0.5 }
  },
  'scout': {
    id: 'scout',
    name: 'Schmidt Scout',
    category: 'snipers',
    slot: 1,
    price: 1700,
    reward: 300,
    team: 'ANY',
    damage: 75,
    armorRatio: 0.70,
    clip: 10,
    maxReserve: 90,
    cycleTime: 1.25,
    reloadTime: 2.00,
    canScope: true,
      zoomLevels: [40, 12],
    scopeLevels: [40, 15],
    recoil: { vertical: 4.5, horizontal: 0.3 }
  },
  'g3sg1': {
    id: 'g3sg1',
    name: 'D3/AU-1 (G3SG1)',
    category: 'snipers',
    slot: 1,
    price: 5000,
    reward: 300,
    team: 'T',
    damage: 80,
    armorRatio: 0.825,
    clip: 20,
    maxReserve: 90,
    cycleTime: 0.25,
    reloadTime: 3.50,
    canScope: true,
      zoomLevels: [40, 12],
    scopeLevels: [40, 15],
    recoil: { vertical: 6.5, horizontal: 1.2 }
  },
  'sg550': {
    id: 'sg550',
    name: 'Krieg 550 Commando',
    category: 'snipers',
    slot: 1,
    price: 4200,
    reward: 300,
    team: 'CT',
    damage: 70,
    armorRatio: 0.825,
    clip: 30,
    maxReserve: 90,
    cycleTime: 0.25,
    reloadTime: 3.35,
    canScope: true,
      zoomLevels: [40, 12],
    scopeLevels: [40, 15],
    recoil: { vertical: 6.0, horizontal: 1.1 }
  },

  // SMGs
  'mp5': {
    id: 'mp5',
    name: 'KM Sub-Machine Gun (MP5)',
    category: 'smgs',
    slot: 1,
    price: 1500,
    reward: 600,
    team: 'ANY',
    damage: 26,
    armorRatio: 0.50,
    clip: 30,
    maxReserve: 120,
    cycleTime: 0.075,
    reloadTime: 2.63,
    canScope: false,
    recoil: { vertical: 4.2, horizontal: 1.2 }
  },
  'p90': {
    id: 'p90',
    name: 'ES C90 (P90)',
    category: 'smgs',
    slot: 1,
    price: 2350,
    reward: 300,
    team: 'ANY',
    damage: 21,
    armorRatio: 0.65,
    clip: 50,
    maxReserve: 100,
    cycleTime: 0.066,
    reloadTime: 3.40,
    canScope: false,
    recoil: { vertical: 4.8, horizontal: 2.2 }
  },
  'ump45': {
    id: 'ump45',
    name: 'KM UMP45',
    category: 'smgs',
    slot: 1,
    price: 1700,
    reward: 600,
    team: 'ANY',
    damage: 30,
    armorRatio: 0.50,
    clip: 25,
    maxReserve: 90,
    cycleTime: 0.10,
    reloadTime: 2.70,
    canScope: false,
    recoil: { vertical: 3.8, horizontal: 1.0 }
  },
  'mac10': {
    id: 'mac10',
    name: 'Ingram MAC-10',
    category: 'smgs',
    slot: 1,
    price: 1400,
    reward: 600,
    team: 'T',
    damage: 29,
    armorRatio: 0.475,
    clip: 30,
    maxReserve: 100,
    cycleTime: 0.070,
    reloadTime: 3.15,
    canScope: false,
    recoil: { vertical: 5.2, horizontal: 2.5 }
  },
  'tmp': {
    id: 'tmp',
    name: 'Schmidt Tactical SMG (TMP)',
    category: 'smgs',
    slot: 1,
    price: 1250,
    reward: 600,
    team: 'CT',
    damage: 20,
    armorRatio: 0.475,
    clip: 30,
    maxReserve: 120,
    cycleTime: 0.070,
    reloadTime: 2.12,
    canScope: false,
    recoil: { vertical: 3.2, horizontal: 0.9 }
  },

  // Shotguns & Machine Guns
  'm3': {
    id: 'm3',
    name: 'Leone 12 Gauge Super (M3)',
    category: 'shotguns',
    slot: 1,
    price: 1700,
    reward: 900,
    team: 'ANY',
    damage: 20,
    pellets: 8,
    armorRatio: 0.50,
    clip: 8,
    maxReserve: 32,
    cycleTime: 0.88,
    reloadTime: 0.50,
    canScope: false,
    recoil: { vertical: 6.0, horizontal: 1.0 }
  },
  'xm1014': {
    id: 'xm1014',
    name: 'Leone YG1265 Auto Shotgun (XM1014)',
    category: 'shotguns',
    slot: 1,
    price: 3000,
    reward: 900,
    team: 'ANY',
    damage: 18,
    pellets: 6,
    armorRatio: 0.50,
    clip: 7,
    maxReserve: 32,
    cycleTime: 0.25,
    reloadTime: 0.50,
    canScope: false,
    recoil: { vertical: 5.0, horizontal: 1.2 }
  },
  'm249': {
    id: 'm249',
    name: 'M249 Para',
    category: 'machineguns',
    slot: 1,
    price: 5750,
    reward: 300,
    team: 'ANY',
    damage: 32,
    armorRatio: 0.70,
    clip: 100,
    maxReserve: 200,
    cycleTime: 0.080,
    reloadTime: 4.69,
    canScope: false,
    recoil: { vertical: 7.5, horizontal: 3.0 }
  },

  // Utilities
  'c4': {
    id: 'c4',
    name: 'C4 Explosive',
    category: 'equipment',
    slot: 5,
    price: 0,
    team: 'T',
    damage: 500,
    blastRadius: 25.0
  },
  'flashbang': {
    id: 'flashbang',
    name: 'Flashbang',
    category: 'equipment',
    slot: 4,
    price: 200,
    team: 'ANY',
    maxCarried: 2
  },
  'hegrenade': {
    id: 'hegrenade',
    name: 'HE Grenade',
    category: 'equipment',
    slot: 4,
    price: 300,
    team: 'ANY',
    damage: 50,
    blastRadius: 10.0,
    maxCarried: 1
  },
  'smokegrenade': {
    id: 'smokegrenade',
    name: 'Smoke Grenade',
    category: 'equipment',
    slot: 4,
    price: 300,
    team: 'ANY',
    maxCarried: 1
  },
  'molotov': {
    id: 'molotov',
    name: 'Molotov Cocktail',
    category: 'equipment',
    slot: 4,
    price: 400,
    team: 'T',
    damage: 40,
    maxCarried: 1
  }
};

const HITGROUP_MULTIPLIERS = {
  'head': 4.0,
  'chest': 1.0,
  'stomach': 1.25,
  'leftarm': 1.0,
  'rightarm': 1.0,
  'arms': 1.0,
  'leftleg': 0.75,
  'rightleg': 0.75,
  'legs': 0.75
};

function calculateDamage(weaponId, hitgroup, victimHealth, victimArmor = 0, victimHasHelmet = false, isStab = false) {
  const wep = CS16_WEAPONS[weaponId] || CS16_WEAPONS['glock'];
  const hg = (hitgroup || 'chest').toLowerCase();
  const mult = HITGROUP_MULTIPLIERS[hg] !== undefined ? HITGROUP_MULTIPLIERS[hg] : 1.0;

  let baseDmg = wep.damage;
  if (weaponId === 'knife') {
    baseDmg = isStab ? wep.damageStab : wep.damageSlash;
  }

  const hitgroupDamage = baseDmg * mult;
  let finalDamage = hitgroupDamage;
  let armorDamage = 0;
  let newArmor = victimArmor;

  const isHead = (hg === 'head');
  const isProtected = (isHead && victimHasHelmet && victimArmor > 0) || (!isHead && hg !== 'legs' && hg !== 'leftleg' && hg !== 'rightleg' && victimArmor > 0);

  if (isProtected) {
    const armorRatio = wep.armorRatio || 0.50;
    const flArmorBonus = 0.5;
    let flNewDamage = hitgroupDamage * armorRatio;
    let flArmorDmg = (hitgroupDamage - flNewDamage) * flArmorBonus;

    if (flArmorDmg > victimArmor) {
      flArmorDmg = victimArmor;
      flNewDamage = hitgroupDamage - (flArmorDmg / flArmorBonus);
      newArmor = 0;
    } else {
      newArmor = Math.max(0, victimArmor - flArmorDmg);
    }
    finalDamage = flNewDamage;
    armorDamage = flArmorDmg;
  }

  const roundedFinal = Math.max(1, Math.round(finalDamage));
  const effectiveDamage = Math.min(victimHealth, roundedFinal);
  const remainingHealth = Math.max(0, victimHealth - effectiveDamage);

  return {
    weaponId: wep.id,
    hitgroup: hg,
    baseDamage: baseDmg,
    multiplier: mult,
    hitgroupDamage: Math.round(hitgroupDamage),
    armorRatio: wep.armorRatio || 0.5,
    isProtected,
    armorDamage: Math.round(armorDamage),
    newArmor: Math.round(newArmor),
    rawFinalDamage: roundedFinal,
    effectiveDamage,
    victimHealthBefore: victimHealth,
    victimHealthAfter: remainingHealth,
    isKill: (remainingHealth <= 0)
  };
}

module.exports = {
  CS16_WEAPONS,
  HITGROUP_MULTIPLIERS,
  calculateDamage
};
