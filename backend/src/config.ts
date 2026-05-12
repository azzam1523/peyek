
export const GAME_CONFIG = {
    INITIAL_BALANCE: 2000.00,
    MAX_FISH_ON_SCREEN: 18,
    SPAWN_INTERVAL_MS: 1200,
    JACKPOT_INCREMENT: 0.08,         
    JACKPOT_TAX: 0.015,
    FROZEN_DURATION_MS: 5000,
    STAGE_DURATION_MS: 180000,
    JACKPOT_LIMITS: {
        SPEED: 0.2,
        LUCKY: 0.8,
        JILI: 5.0
    },
    JACKPOT_TRIGGER_CHANCE: {
        SPEED: 0.008,
        LUCKY: 0.003,
        JILI: 0.0012
    },
    JACKPOT_PAYOUT_RATIO: {
        SPEED: 0.008,
        LUCKY: 0.03,
        JILI: 0.12
    },
    JACKPOT_PAYOUT_CAP: {
        SPEED: 800,
        LUCKY: 4000,
        JILI: 25000
    },
    JACKPOT_POOL_FLOOR: 5000,
    ELECTRIC_CANNON_THRESHOLD: 100,
    ENERGY_PER_BET_RATIO: 1.0,
    MAX_KILL_PROBABILITY: 0.92,
    MIN_KILL_PROBABILITY: 0.01,
    SMALL_FISH_MAX_HP: 60,
    MEDIUM_FISH_MAX_HP: 150,
    SMALL_FISH_KILL_BOOST: 1.65,
    MEDIUM_FISH_KILL_BOOST: 1.25,
    BOSS_SPAWN_COOLDOWN_MS: 90000,
    BOSS_INITIAL_COOLDOWN_MS: 45000,
    TYPE_SPAWN_COOLDOWN_MS: 900,
    LUCKY_ORB_HIT_CHANCE: 0.62,
    LUCKY_ORB_RADIUS: 1400,
    LUCKY_ORB_MIN_KILLS: 8,
    LUCKY_ORB_MAX_KILLS: 40,
    MAX_ACTIVE_PER_TYPE: {
        fish1: 4,
        fish2: 4,
        fish3: 3,
        fish4: 3,
        fish5: 2,
        fish6: 2,
        fish7: 2,
        fish8: 2,
        fish9: 1,
        fish10: 1,
        shark1: 1,
        shark2: 1,
        sharkjumbo_v2: 1
    } as Record<string, number>,
};

export type FishCategory = 'NORMAL' | 'GOLDEN' | 'SPECIAL' | 'BOSS';

export interface FishStat {
    hp: number;
    score: number;
    probability: number;
    category: FishCategory;
    effect?: 'LIGHTNING' | 'EXPLOSION' | 'WHIRLPOOL';
}
export const FISH_CONFIGS: Record<string, FishStat> = {
    'fish1':      { hp: 1,    score: 2,    probability: 0.30,  category: 'NORMAL' },
    'fish2':      { hp: 2,    score: 3,    probability: 0.20,  category: 'NORMAL' },
    'fish3':      { hp: 3,    score: 5,    probability: 0.15,  category: 'NORMAL' },
    'fish4':      { hp: 4,    score: 8,    probability: 0.10,  category: 'NORMAL' },
    'fish5':      { hp: 6,    score: 12,   probability: 0.08,  category: 'NORMAL' },
    'fish6':      { hp: 10,   score: 15,   probability: 0.05,  category: 'NORMAL' },
    'fish7':      { hp: 15,   score: 25,   probability: 0.04,  category: 'NORMAL' },
    'fish8':      { hp: 20,   score: 35,   probability: 0.03,  category: 'NORMAL' },
    'fish9':      { hp: 40,   score: 50,   probability: 0.02,  category: 'GOLDEN' },
    'fish10':     { hp: 50,   score: 60,   probability: 0.015, category: 'GOLDEN' },
    'shark1':     { hp: 80,   score: 80,   probability: 0.008, category: 'SPECIAL', effect: 'LIGHTNING' },
    'shark2':     { hp: 100,  score: 100,  probability: 0.005, category: 'SPECIAL', effect: 'EXPLOSION' },
    'sharkjumbo_v2': { hp: 1000, score: 500,  probability: 0.002, category: 'BOSS' }
};
export const STAGES = [
    { 
        name: 'Coral Reef', 
        bg: 'bg1', 
        spawnRates: { NORMAL: 0.82, GOLDEN: 0.12, SPECIAL: 0.055, BOSS: 0.005 } 
    },
    { 
        name: 'Deep Ocean', 
        bg: 'bg2', 
        spawnRates: { NORMAL: 0.72, GOLDEN: 0.18, SPECIAL: 0.095, BOSS: 0.005 } 
    },
    { 
        name: 'Stormy Sea', 
        bg: 'bg3', 
        spawnRates: { NORMAL: 0.64, GOLDEN: 0.22, SPECIAL: 0.135, BOSS: 0.005 } 
    }
];
