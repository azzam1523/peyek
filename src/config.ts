
export interface FishConfig {
    key: string;
    hp: number;
    score: number;
    speed: {
        min: number;
        max: number;
    };
    scale: number;
    probability: number;
    facesRightByDefault: boolean;
    tint?: number;
    textureKey?: string;
}

export type SpawnPatternMode = 'chaos' | 'formation' | 'zigzag';

export interface ScenePhaseConfig {
    name: string;
    durationMs: number;
    spawnMode: SpawnPatternMode;
    bgTint: number;
    ambientColor: number;
    ambientAlpha: number;
}

export interface SpawnOptions {
    x?: number;
    y?: number;
    side?: 'left' | 'right' | 'top' | 'bottom';
    disableWave?: boolean;
    forceGolden?: boolean;
    skipWarning?: boolean;
    id?: string;
}

export const GOLDEN_SHARK_COOLDOWN = 15000;

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
export const UI_FONT_FAMILY = '"Trebuchet MS", "Arial Black", Verdana, Arial, sans-serif';
export const DEFAULT_BET = 0.1;
export const BET_LEVELS: number[] = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5];

const resolveDefaultSocketUrl = (): string => {
    if (typeof window === 'undefined') {
        return 'http://localhost:3000';
    }

    const host = window.location.hostname || 'localhost';
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${host}:3000`;
};

const configuredSocketUrl = import.meta.env.VITE_SOCKET_URL?.trim();
export const SOCKET_SERVER_URL = configuredSocketUrl && configuredSocketUrl.length > 0
    ? configuredSocketUrl
    : resolveDefaultSocketUrl();

export const FISH_CONFIGS: FishConfig[] = [
    { key: 'fish1', hp: 1, score: 0.02, speed: { min: 80, max: 150 }, scale: 1, probability: 0.30, facesRightByDefault: true },
    { key: 'fish2', hp: 2, score: 0.03, speed: { min: 70, max: 130 }, scale: 1, probability: 0.20, facesRightByDefault: true },
    { key: 'fish3', hp: 3, score: 0.05, speed: { min: 60, max: 120 }, scale: 1, probability: 0.15, facesRightByDefault: true },
    { key: 'fish4', hp: 4, score: 0.08, speed: { min: 50, max: 110 }, scale: 1, probability: 0.10, facesRightByDefault: true },
    { key: 'fish5', hp: 5, score: 0.12, speed: { min: 40, max: 90 }, scale: 1, probability: 0.07, facesRightByDefault: true },
    { key: 'fish6', hp: 6, score: 0.18, speed: { min: 35, max: 80 }, scale: 1, probability: 0.05, facesRightByDefault: true },
    { key: 'fish7', hp: 8, score: 0.28, speed: { min: 30, max: 70 }, scale: 1, probability: 0.03, facesRightByDefault: true },
    { key: 'fish8', hp: 10, score: 0.45, speed: { min: 25, max: 60 }, scale: 1, probability: 0.02, facesRightByDefault: true },
    { key: 'fish9', hp: 12, score: 0.75, speed: { min: 20, max: 50 }, scale: 1, probability: 0.015, facesRightByDefault: true },
    { key: 'fish10', hp: 15, score: 1.20, speed: { min: 15, max: 40 }, scale: 1, probability: 0.01, facesRightByDefault: true },
    { key: 'shark1', hp: 22, score: 1.80, speed: { min: 16, max: 34 }, scale: 1, probability: 0.012, facesRightByDefault: true },
    { key: 'shark2', hp: 30, score: 3.20, speed: { min: 13, max: 28 }, scale: 1, probability: 0.007, facesRightByDefault: true },
    { key: 'sharkjumbo_v2', hp: 240, score: 60.00, speed: { min: 6, max: 14 }, scale: 1.65, probability: 0.0005, facesRightByDefault: false }
];

export const SCENE_PHASES: ScenePhaseConfig[] = [
    { name: 'Wild Waters', durationMs: 180000, spawnMode: 'chaos', bgTint: 0xa8f5ff, ambientColor: 0x39e5ff, ambientAlpha: 0.13 },
    { name: 'Battle Formation', durationMs: 180000, spawnMode: 'formation', bgTint: 0x9fd2ff, ambientColor: 0xffcc55, ambientAlpha: 0.14 },
    { name: 'Cyclone Rush', durationMs: 180000, spawnMode: 'zigzag', bgTint: 0xb7c5ff, ambientColor: 0xff7a5c, ambientAlpha: 0.15 }
];
