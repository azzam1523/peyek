import * as Phaser from 'phaser';
import { io, Socket } from 'socket.io-client';

interface FishConfig {
    key: string;
    hp: number;
    score: number;
    speed: { min: number, max: number };
    scale: number;
    probability: number;
    facesRightByDefault: boolean;
    tint?: number;
    textureKey?: string;
}

type SpawnPatternMode = 'chaos' | 'formation' | 'zigzag';

interface ScenePhaseConfig {
    name: string;
    durationMs: number;
    spawnMode: SpawnPatternMode;
    bgTint: number;
    ambientColor: number;
    ambientAlpha: number;
}

interface SpawnOptions {
    x?: number;
    y?: number;
    side?: 'left' | 'right';
    disableWave?: boolean;
    forceGolden?: boolean;
    skipWarning?: boolean;
}

export default class MainGame extends Phaser.Scene {
    private uiFontFamily: string = '"Trebuchet MS", "Arial Black", Verdana, Arial, sans-serif';
    private playerCannon!: Phaser.GameObjects.Sprite;
    private bullets!: Phaser.Physics.Arcade.Group;
    private fishGroup!: Phaser.Physics.Arcade.Group;
    private score: number = 2000;
    private dummyScore: number = 472.00;
    private betAmount: number = 0.10;
    private dummyBetAmount: number = 0.10;
    private scoreText!: Phaser.GameObjects.Text;
    private dummyScoreText!: Phaser.GameObjects.Text;
    private betText!: Phaser.GameObjects.Text;
    private dummyBetText!: Phaser.GameObjects.Text;
    private socket!: Socket;
    private isOfflineMode: boolean = true; // Set ke true untuk mode offline

    // --- FITUR SKILL ---
    private isTargetMode: boolean = false;
    private isAutoMode: boolean = false;
    private isTorpedoMode: boolean = false;
    private isFrozen: boolean = false;
    private selectedAutoTargets: Set<string> = new Set();
    private autoFishingUI: Phaser.GameObjects.Container | null = null;
    private sideMenuUI: Phaser.GameObjects.Container | null = null;
    private isSideMenuOpen: boolean = false;

    // --- MULTIPLAYER DUMMIES ---

    private lockedTarget: Phaser.Physics.Arcade.Sprite | null = null;
    private targetCrosshair!: Phaser.GameObjects.Graphics;
    private targetCrosshairFocusX: number = 0;
    private targetCrosshairFocusY: number = 0;
    private autoShootEvent!: Phaser.Time.TimerEvent;

    // --- FITUR JACKPOT ---
    private speedJackpot: number = 56.06;
    private jiliJackpot: number = 6157.65;
    private luckyJackpot: number = 463.17;
    private speedJackpotText!: Phaser.GameObjects.Text;
    private jiliJackpotText!: Phaser.GameObjects.Text;
    private luckyJackpotText!: Phaser.GameObjects.Text;
    private jackpotPool: number = 88888.88;
    private jackpotText!: Phaser.GameObjects.Text;
    private lastLaserFireShotAt: number = -99999;
    private lastCoinEnterSoundAt: number = -99999;
    private laserLoopSound: Phaser.Sound.BaseSound | null = null;
    private laserLoopStartDelay: Phaser.Time.TimerEvent | null = null;
    private bgmSound: Phaser.Sound.BaseSound | null = null;
    private goldenSharkBgmSound: Phaser.Sound.BaseSound | null = null;
    private lastGoldenMusicCheckAt: number = -99999;
    private isJumboActive: boolean = false; // Flag untuk membatasi 1 hiu jumbo saja

    private targetBtnBg!: Phaser.GameObjects.Shape;
    private torpedoBtnBg!: Phaser.GameObjects.Shape;
    private lightningGfx!: Phaser.GameObjects.Graphics;
    private laserBeamSegments: Phaser.GameObjects.Sprite[] = [];
    private laserImpactGlow!: Phaser.GameObjects.Sprite;
    private laserImpactCore!: Phaser.GameObjects.Sprite;
    private laserMuzzleGlow!: Phaser.GameObjects.Sprite;
    private backgroundImage!: Phaser.GameObjects.Image;
    private backgroundOverlay!: Phaser.GameObjects.Rectangle;
    private ambientLights: Phaser.GameObjects.Ellipse[] = [];
    private seaweedPatches: Phaser.GameObjects.Graphics[] = [];
    private spawnTimer?: Phaser.Time.TimerEvent;
    private scenePhaseTimer?: Phaser.Time.TimerEvent;
    private isSceneTransitioning: boolean = false;
    private isGoldenWarningActive: boolean = false;
    private lastGoldenSharkWarningTime: number = -99999;
    private formationWaveStep: number = 0;
    private zigzagWaveStep: number = 0;
    private currentScenePhaseIndex: number = 0;

    private scenePhases: ScenePhaseConfig[] = [
        { name: 'Wild Waters', durationMs: 180000, spawnMode: 'chaos', bgTint: 0xa8f5ff, ambientColor: 0x39e5ff, ambientAlpha: 0.13 },
        { name: 'Battle Formation', durationMs: 180000, spawnMode: 'formation', bgTint: 0x9fd2ff, ambientColor: 0xffcc55, ambientAlpha: 0.14 },
        { name: 'Cyclone Rush', durationMs: 180000, spawnMode: 'zigzag', bgTint: 0xb7c5ff, ambientColor: 0xff7a5c, ambientAlpha: 0.15 }
    ];

    private safePlaySound(key: string, config?: any) {
        // Permintaan UX: saat Target aktif, jangan putar suara squit/hit.
        if (this.isTargetMode && key === 'snd_hit') {
            return;
        }
        if (this.cache.audio.exists(key)) {
            this.sound.play(key, config);
        } else if (this.cache.audio.exists('snd_shoot')) {
            // Fallback: Jika suara utama gagal muat, gunakan suara tembakan dengan volume pelan
            this.sound.play('snd_shoot', { ...config, volume: (config.volume || 0.5) * 0.5 });
        }
    }

    private playUiClick(volume: number = 0.45) {
        this.safePlaySound('snd_click', { volume });
    }

    private hideLaserBeam() {
        this.laserBeamSegments.forEach(seg => seg.setVisible(false));
        if (this.laserImpactGlow) {
            this.laserImpactGlow.setVisible(false);
        }
        if (this.laserImpactCore) {
            this.laserImpactCore.setVisible(false);
        }
        if (this.laserMuzzleGlow) {
            this.laserMuzzleGlow.setVisible(false);
        }
    }

    private isGoldenSharkMusicFish(fish: Phaser.Physics.Arcade.Sprite): boolean {
        return !!fish && !!fish.active && fish.texture.key === 'sharkjumbo_v2' && !!fish.getData('isGoldenShark');
    }

    private playNormalBgm() {
        if (!this.cache.audio.exists('bgm')) return;
        if (!this.bgmSound) {
            this.bgmSound = this.sound.add('bgm', { loop: true, volume: 0.3 });
        }
        if (this.goldenSharkBgmSound && this.goldenSharkBgmSound.isPlaying) {
            this.goldenSharkBgmSound.stop();
        }
        if (!this.bgmSound.isPlaying) {
            this.bgmSound.play();
        }
    }

    private playGoldenSharkBgm() {
        if (!this.cache.audio.exists('bgm_golden_shark')) {
            this.playNormalBgm();
            return;
        }
        if (!this.goldenSharkBgmSound) {
            this.goldenSharkBgmSound = this.sound.add('bgm_golden_shark', { loop: true, volume: 0.45 });
        }
        if (this.bgmSound && this.bgmSound.isPlaying) {
            this.bgmSound.stop();
        }
        if (!this.goldenSharkBgmSound.isPlaying) {
            this.goldenSharkBgmSound.play();
        }
    }

    private refreshGoldenSharkMusic() {
        const hasGoldenShark = this.fishGroup
            .getChildren()
            .some((f: any) => this.isGoldenSharkMusicFish(f as Phaser.Physics.Arcade.Sprite));

        if (hasGoldenShark) {
            this.playGoldenSharkBgm();
        } else {
            this.playNormalBgm();
        }
    }

    private stopAllBgmTracks() {
        if (this.bgmSound && this.bgmSound.isPlaying) {
            this.bgmSound.stop();
        }
        if (this.goldenSharkBgmSound && this.goldenSharkBgmSound.isPlaying) {
            this.goldenSharkBgmSound.stop();
        }
    }

    private canSpawnGoldenSharkNow(): boolean {
        // Golden shark menggunakan sharkjumbo_v2, jadi hanya boleh warning
        // kalau slot jumbo sedang kosong.
        return !this.isJumboActive;
    }

    private stopLaserFireSounds() {
        if (this.laserLoopStartDelay) {
            this.laserLoopStartDelay.remove(false);
            this.laserLoopStartDelay = null;
        }
        if (this.laserLoopSound && this.laserLoopSound.isPlaying) {
            this.laserLoopSound.stop();
        }
        this.sound.stopByKey('snd_laser_fire_start');
        this.sound.stopByKey('snd_laser_fire_loop');
    }

    private ensureLaserLoopSound() {
        if (!this.cache.audio.exists('snd_laser_fire_loop')) return;
        if (!this.laserLoopSound) {
            this.laserLoopSound = this.sound.add('snd_laser_fire_loop', { loop: true, volume: 0.28 });
        }
        if (!this.laserLoopSound.isPlaying) {
            this.laserLoopSound.play();
        }
    }

    private playLaserFireShotSound() {
        const now = this.time.now;
        const isFirstShotInBurst = now - this.lastLaserFireShotAt > 450;
        this.lastLaserFireShotAt = now;
        if (isFirstShotInBurst) {
            if (this.laserLoopSound && this.laserLoopSound.isPlaying) {
                this.laserLoopSound.stop();
            }
            this.safePlaySound('snd_laser_fire_start', { volume: 0.34 });
            if (this.laserLoopStartDelay) {
                this.laserLoopStartDelay.remove(false);
            }
            this.laserLoopStartDelay = this.time.delayedCall(120, () => {
                if (this.time.now - this.lastLaserFireShotAt <= 520) {
                    this.ensureLaserLoopSound();
                }
                this.laserLoopStartDelay = null;
            });
            return;
        }

        this.ensureLaserLoopSound();
    }


    private toggleTorpedoMode() {
        this.isTorpedoMode = !this.isTorpedoMode;
        if (this.torpedoBtnBg) {
            this.torpedoBtnBg.setStrokeStyle(this.isTorpedoMode ? 6 : 2, this.isTorpedoMode ? 0xffffff : 0xff8800);
        }
    }

    private getCannonKey(): string {
        if (this.betAmount <= 0.02) return 'cannon1';
        if (this.betAmount <= 0.05) return 'cannon2';
        if (this.betAmount <= 0.10) return 'cannon3';
        if (this.betAmount <= 0.20) return 'cannon4';
        if (this.betAmount <= 0.50) return 'cannon5';
        if (this.betAmount <= 1.00) return 'cannon6';
        return 'cannon7';
    }

    private fishConfigs: FishConfig[] = [
        // Profil payout dibuat lebih linear-risk agar teori RTP lebih stabil untuk audit.
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
        { key: 'sharkjumbo_v2', hp: 240, score: 60.00, speed: { min: 6, max: 14 }, scale: 2.2, probability: 0.001, facesRightByDefault: false }
    ];

    constructor() {
        super('MainGame');
    }

    create() {
        this.setupDynamicBackground();
        
        // --- MANUAL FRAME DEFINITION FOR SHARK JUMBO (1 Column Strip) ---
        const jumboTex = this.textures.get('sharkjumbo_v2');
        if (jumboTex) {
            const totalW = jumboTex.getSourceImage().width;
            const totalH = jumboTex.getSourceImage().height;
            const frameW = totalW;
            const frameH = totalH / 8; // 8 rows in new asset
            for (let r = 0; r < 8; r++) {
                jumboTex.add(`sj_${r}_0`, 0, 0, r * frameH, frameW, frameH);
            }
        }

        // Start BGM normal
        this.playNormalBgm();

        // Generate Bubble Texture
        const bubbleGraphics = this.add.graphics();
        bubbleGraphics.fillStyle(0xffffff, 0.3);
        bubbleGraphics.fillCircle(10, 10, 10);
        bubbleGraphics.lineStyle(2, 0xffffff, 0.5);
        bubbleGraphics.strokeCircle(10, 10, 10);
        bubbleGraphics.fillStyle(0xffffff, 0.6);
        bubbleGraphics.fillCircle(6, 6, 3); // Highlight
        bubbleGraphics.generateTexture('bubble', 20, 20);
        bubbleGraphics.destroy();

        // Procedural torpedo sprite (mirip roket biru-silver pada referensi)
        if (!this.textures.exists('torpedo_projectile')) {
            const tg = this.add.graphics();
            // Body utama biru
            tg.fillStyle(0x0f63de, 1);
            tg.fillRoundedRect(26, 24, 124, 44, 22);
            // Highlight cyan
            tg.fillStyle(0x43d6ff, 0.92);
            tg.fillRoundedRect(40, 31, 76, 14, 7);
            // Ring body
            tg.lineStyle(4, 0x174f98, 0.95);
            tg.strokeRoundedRect(26, 24, 124, 44, 22);
            tg.lineStyle(3, 0x2c7cff, 0.9);
            tg.strokeLineShape(new Phaser.Geom.Line(86, 24, 86, 68));
            // Nose silver dengan core biru
            tg.fillStyle(0xd2d9e3, 1);
            tg.fillTriangle(150, 24, 214, 46, 150, 68);
            tg.fillStyle(0x9ca8b8, 0.9);
            tg.fillTriangle(157, 31, 200, 46, 157, 61);
            tg.fillStyle(0x68caff, 0.85);
            tg.fillCircle(166, 46, 6);
            // Fin atas/bawah putih-silver
            tg.fillStyle(0xf1f4f8, 1);
            tg.fillTriangle(78, 24, 58, 4, 104, 24);
            tg.fillTriangle(78, 68, 58, 88, 104, 68);
            tg.fillStyle(0xc6ced9, 1);
            tg.fillTriangle(70, 24, 58, 11, 92, 24);
            tg.fillTriangle(70, 68, 58, 81, 92, 68);
            // Cap belakang
            tg.fillStyle(0x8a95a2, 1);
            tg.fillRoundedRect(18, 29, 14, 34, 7);
            tg.fillStyle(0xc0c8d2, 0.9);
            tg.fillRoundedRect(22, 35, 8, 22, 4);
            tg.generateTexture('torpedo_projectile', 220, 92);
            tg.destroy();
        }

        if (!this.textures.exists('torpedo_flame')) {
            const fg = this.add.graphics();
            fg.fillStyle(0xffffff, 1);
            fg.fillEllipse(48, 28, 92, 48);
            fg.fillStyle(0xfff4a0, 0.95);
            fg.fillEllipse(43, 28, 74, 36);
            fg.fillStyle(0xff8d32, 0.92);
            fg.fillEllipse(35, 28, 54, 25);
            fg.fillStyle(0xff3c22, 0.9);
            fg.fillEllipse(27, 28, 30, 14);
            fg.generateTexture('torpedo_flame', 100, 56);
            fg.destroy();
        }

        // Texture glow lembut untuk ujung laser (impact)
        if (!this.textures.exists('laser_impact_soft')) {
            const impactGfx = this.add.graphics();
            impactGfx.fillStyle(0xffffff, 0.95);
            impactGfx.fillCircle(64, 64, 12);
            impactGfx.fillStyle(0xe9fdff, 0.6);
            impactGfx.fillCircle(64, 64, 24);
            impactGfx.fillStyle(0xc9f4ff, 0.32);
            impactGfx.fillCircle(64, 64, 38);
            impactGfx.fillStyle(0xb56dff, 0.2);
            impactGfx.fillCircle(64, 64, 52);
            impactGfx.generateTexture('laser_impact_soft', 128, 128);
            impactGfx.destroy();
        }

        // Spawn Bubbles Timer
        this.setupEffects();

        // Crosshair untuk mode Target
        this.targetCrosshair = this.add.graphics().setDepth(50);
        this.targetCrosshair.setVisible(false);

        this.lightningGfx = this.add.graphics().setDepth(25);
        this.lightningGfx.setBlendMode(Phaser.BlendModes.ADD);

        this.bullets = this.physics.add.group({ defaultKey: 'bullet', maxSize: 50 });
        this.fishGroup = this.physics.add.group();

        this.setupFishingWarUI();
        this.setupSideMenuUI();
        this.setupCannon();

        // Inisialisasi Saldo & Mode Offline
        if (this.isOfflineMode) {
            const savedBalance = localStorage.getItem('fishGame_balance');
            this.score = savedBalance ? parseFloat(savedBalance) : 2000;
            this.updateScoreDisplay();

            // Update Jackpot Lokal
            this.time.addEvent({
                delay: 1000,
                callback: () => {
                    this.speedJackpot += Phaser.Math.FloatBetween(0.01, 0.05);
                    this.jiliJackpot += Phaser.Math.FloatBetween(0.05, 0.20);
                    this.luckyJackpot += Phaser.Math.FloatBetween(0.01, 0.08);
                    this.updateJackpotDisplay();
                },
                loop: true
            });
        } else {
            this.socket = io('http://localhost:3000');

            this.socket.on('init-game', (data: any) => {
                this.score = data.balance;
                this.updateScoreDisplay();
                this.jackpotPool = data.jackpot;
                if (data.isFrozen) this.activateFrozenSkill(false);
            });

            this.socket.on('jackpot-update', (value: number) => {
                this.jackpotPool = value;
                if (this.jackpotText) {
                    this.jackpotText.setText('GRAND JACKPOT: ' + this.jackpotPool.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                }
            });

            this.socket.on('game-frozen', (data: { duration: number, newBalance: number, activatorId: string }) => {
                if (data.activatorId === this.socket.id) {
                    this.score = data.newBalance;
                    this.updateScoreDisplay();
                }
                this.activateFrozenSkill(true);
            });

            this.socket.on('fish-killed', (data: { fishId: string, killerId: string, winAmount: number }) => {
                const fish = this.fishGroup.getChildren().find(f => f.getData('id') === data.fishId) as Phaser.Physics.Arcade.Sprite;
                if (fish) {
                    const isLocal = data.killerId === this.socket.id;
                    const killerId = isLocal ? 'local_p1' : 'dummy_p2'; // Map killerId ke posisi UI
                    this.killFish(fish, isLocal, killerId);
                }
            });

            this.socket.on('shoot-result', (data: any) => {
                if (data.newBalance !== undefined) {
                    this.score = data.newBalance;
                    this.updateScoreDisplay();
                }
                if (data.killed) {
                    const fish = this.fishGroup.getChildren().find(f => f.getData('id') === data.fishId) as Phaser.Physics.Arcade.Sprite;
                    if (fish) this.killFish(fish);
                }
            });

            this.socket.on('spawn-fish', (fishData: any) => {
                this.spawnFishFromServer(fishData);
            });
        }

        // --- LASER TARGET BEAM ---
        // Segment sprite lama dinonaktifkan karena menyebabkan beam terlihat pecah/kotak.
        this.laserBeamSegments = [];

        // Glow putih di ujung beam (impact ke ikan)
        this.laserImpactGlow = this.add.sprite(0, 0, 'laser_impact_soft')
            .setDepth(220)
            .setVisible(false);
        this.laserImpactGlow.setBlendMode(Phaser.BlendModes.ADD);
        this.laserImpactGlow.setScale(1.0);

        // Core impact biru agar ujung laser terlihat "nempel" seperti referensi
        this.laserImpactCore = this.add.sprite(0, 0, 'laser_impact_soft')
            .setDepth(221)
            .setVisible(false);
        this.laserImpactCore.setBlendMode(Phaser.BlendModes.ADD);
        this.laserImpactCore.setTint(0x8adfff);
        this.laserImpactCore.setScale(0.56);

        // Cahaya di mulut meriam saat target laser aktif
        this.laserMuzzleGlow = this.add.sprite(0, 0, 'laser_impact_soft')
            .setDepth(210)
            .setVisible(false);
        this.laserMuzzleGlow.setBlendMode(Phaser.BlendModes.ADD);
        this.laserMuzzleGlow.setTint(0xc5f2ff);
        this.laserMuzzleGlow.setScale(0.5);

        this.startScenePhaseCycle();
        // Create standard fish animations
        this.fishConfigs.forEach(config => {
            if (config.key === 'sharkjumbo_v2') return; // Handled separately

            if (this.anims.exists(config.key + '_anim')) {
                this.anims.remove(config.key + '_anim');
            }
            const frames = this.anims.generateFrameNumbers(config.key, {});
            if (frames && frames.length > 0) {
                this.anims.create({
                    key: config.key + '_anim',
                    frames: frames,
                    frameRate: 10,
                    repeat: -1
                });
            }
        });

        if (!this.anims.exists('sharkjumbo_v2_anim')) {
            const sjFrames: any[] = [];
            for (let r = 0; r < 8; r++) {
                sjFrames.push({ key: 'sharkjumbo_v2', frame: `sj_${r}_0` });
            }
            this.anims.create({
                key: 'sharkjumbo_v2_anim',
                frames: sjFrames,
                frameRate: 12,
                repeat: -1
            });
        }

        if (!this.anims.exists('coin_anim')) {
            this.anims.create({
                key: 'coin_anim',
                frames: this.anims.generateFrameNumbers('coinAni2', {}),
                frameRate: 15,
                repeat: -1
            });
        }



        // Auto Shoot Event (Mati secara default)
        this.autoShootEvent = this.time.addEvent({
            delay: 300, // Balanced arcade speed
            callback: this.autoShootLogic,
            callbackScope: this,
            loop: true,
            paused: true
        });

        // Event Interaksi Ikan untuk Fitur Target
        this.input.on('gameobjectdown', (_pointer: any, gameObject: any) => {
            if (this.isTargetMode && this.fishGroup.contains(gameObject)) {
                this.lockedTarget = gameObject;
                this.updateAutoShootState();
            }
        });

        this.physics.add.overlap(this.bullets, this.fishGroup, this.handleCollision as any, undefined, this);
        this.physics.world.on('worldbounds', this.handleBulletWorldBounds, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.physics.world.off('worldbounds', this.handleBulletWorldBounds, this);
            this.stopLaserFireSounds();
            this.stopAllBgmTracks();
        });
    }


    private setupCannon() {
        const w = this.cameras.main.width;
        const h = this.cameras.main.height;

        // --- MAIN PLAYER (KITA) - CENTER BOTTOM ---
        this.playerCannon = this.add.sprite(250, h - 55, this.getCannonKey());
        this.playerCannon.setOrigin(0.5, 0.6);
        this.playerCannon.setScale(1.4);
        this.playerCannon.setDepth(20);

        // Player 2 Dummy Cannon
        const p2Cannon = this.add.sprite(w - 250, h - 55, 'cannon1');
        p2Cannon.setOrigin(0.5, 0.6);
        p2Cannon.setScale(1.4);
        p2Cannon.setDepth(20);
        p2Cannon.setRotation(0);
        p2Cannon.setName('p2_cannon');

        // --- USER LAIN (KIRI & KANAN) ---
        // dummy cannons removed

        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, currentlyOver: any[]) => {
            if (currentlyOver.length > 0) {
                // Mengecek apakah yang diklik adalah ikan
                const fish = currentlyOver.find(go => go.getData && go.getData('hp') !== undefined);
                if (fish) {
                    if (this.isTorpedoMode) {
                        this.shoot(fish.x, fish.y, true, fish as Phaser.Physics.Arcade.Sprite);
                    } else if (this.isTargetMode) {
                        this.lockedTarget = fish as Phaser.Physics.Arcade.Sprite;
                        this.targetCrosshairFocusX = this.lockedTarget.x;
                        this.targetCrosshairFocusY = this.lockedTarget.y;
                        this.targetCrosshair.setVisible(true);
                        this.updateAutoShootState();
                    }
                }
                if (this.isTorpedoMode || this.isTargetMode) return;
            }

            // Torpedo mode: klik area kosong/UI tidak menembak.
            // Harus klik ikan baru boleh menembak.
            if (this.isTorpedoMode) return;

            if (pointer.y > h - 80) return;
            if (pointer.x > w - 100) return; // Area skill kanan

            // Jika sedang tidak mengunci target, tidak auto, dan TIDAK sedang pegang Torpedo
            if (!this.lockedTarget && !this.isAutoMode && !this.isTorpedoMode) {
                this.shoot(pointer.x, pointer.y);
            }
        });

        // --- SIMULASI DUMMY PLAYER SHOOTING (Offline Mode) ---
        if (this.isOfflineMode) {
            this.time.addEvent({
                delay: 2000,
                callback: () => {
                    if (this.isSceneTransitioning || this.dummyScore < this.dummyBetAmount) return;
                    
                    const fishList = this.fishGroup.getChildren();
                    if (fishList.length === 0) return;

                    const target = Phaser.Utils.Array.GetRandom(fishList) as Phaser.Physics.Arcade.Sprite;
                    if (!target.active || target.y > h + 50) return;

                    this.dummyScore -= this.dummyBetAmount;
                    this.updateScoreDisplay();

                    const p2CannonX = w - 250;
                    const p2CannonY = h - 45;
                    const angle = Phaser.Math.Angle.Between(p2CannonX, p2CannonY, target.x, target.y);

                    this.fireSingleBullet(p2CannonX, p2CannonY, angle, false, 'dummy_p2');

                    const p2Cannon = this.children.getByName('p2_cannon') as Phaser.GameObjects.Sprite;
                    if (p2Cannon) {
                        p2Cannon.setRotation(angle + Math.PI / 2);
                        this.tweens.add({ targets: p2Cannon, y: p2Cannon.y + 12, duration: 50, yoyo: true });
                    }
                    
                    const muzzleX = p2CannonX + Math.cos(angle) * 60;
                    const muzzleY = p2CannonY + Math.sin(angle) * 60;
                    const flash = this.add.sprite(muzzleX, muzzleY, 'muzzle').setDepth(41).setRotation(angle).setScale(0.2);
                    this.tweens.add({ targets: flash, scale: 0.6, alpha: 0, duration: 100, onComplete: () => flash.destroy() });
                },
                callbackScope: this,
                loop: true
            });
        }
    }

    private updateAutoShootState() {
        if (this.isAutoMode || (this.isTargetMode && this.lockedTarget)) {
            this.autoShootEvent.paused = false;
        } else {
            this.autoShootEvent.paused = true;
            this.stopLaserFireSounds();
        }
    }

    private isFishInWarArea(fish: Phaser.Physics.Arcade.Sprite | null): boolean {
        if (!fish || !fish.active) return false;
        const w = this.cameras.main.width;
        const h = this.cameras.main.height;
        return fish.x >= 0 && fish.x <= w && fish.y >= 0 && fish.y <= h;
    }

    private findReplacementTargetByType(
        sourceFish: Phaser.Physics.Arcade.Sprite,
        focusX: number,
        focusY: number
    ): Phaser.Physics.Arcade.Sprite | null {
        const sameTypeTargets = this.fishGroup.getChildren()
            .filter((f: any) =>
                f !== sourceFish &&
                f.active &&
                f.texture &&
                f.texture.key === sourceFish.texture.key &&
                this.isFishInWarArea(f as Phaser.Physics.Arcade.Sprite)
            ) as Phaser.Physics.Arcade.Sprite[];

        if (sameTypeTargets.length === 0) return null;

        sameTypeTargets.sort((a, b) =>
            Phaser.Math.Distance.Between(focusX, focusY, a.x, a.y) -
            Phaser.Math.Distance.Between(focusX, focusY, b.x, b.y)
        );
        return sameTypeTargets[0];
    }

    private isRegularSharkType(key: string): boolean {
        return key === 'shark1' || key === 'shark2';
    }

    private resolveSharkSpawnLane(
        side: 'left' | 'right',
        spawnX: number,
        desiredY: number
    ): { allowed: boolean; y: number } {
        const h = this.cameras.main.height || 720;
        const minY = 150;
        const maxY = Math.max(minY + 40, h - 300);
        const clampY = (value: number) => Phaser.Math.Clamp(value, minY, maxY);

        const candidates = [
            desiredY,
            desiredY - 170,
            desiredY + 170,
            desiredY - 90,
            desiredY + 90
        ].map(clampY);

        const movingRight = side === 'left';
        const sharksSameDirection = this.fishGroup.getChildren().filter((f: any) => {
            if (!f || !f.active || !f.texture) return false;
            if (!this.isRegularSharkType(f.texture.key)) return false;
            const body = f.body as Phaser.Physics.Arcade.Body | undefined;
            if (!body) return false;
            if (movingRight && body.velocity.x <= 0) return false;
            if (!movingRight && body.velocity.x >= 0) return false;
            return true;
        }) as Phaser.Physics.Arcade.Sprite[];

        if (sharksSameDirection.length === 0) {
            return { allowed: true, y: clampY(desiredY) };
        }

        const isLaneFree = (candidateY: number) => {
            for (const shark of sharksSameDirection) {
                const yTooClose = Math.abs(shark.y - candidateY) < 160;
                const xTooClose = Math.abs(shark.x - spawnX) < 720;
                if (yTooClose && xTooClose) return false;
            }
            return true;
        };

        for (const candidateY of candidates) {
            if (isLaneFree(candidateY)) {
                return { allowed: true, y: candidateY };
            }
        }

        return { allowed: false, y: clampY(desiredY) };
    }

    private isSharkKey(textureKey: string): boolean {
        return textureKey === 'shark1' || textureKey === 'shark2' || textureKey === 'sharkjumbo_v2';
    }

    private attachSharkShadow(fish: Phaser.Physics.Arcade.Sprite) {
        if (!this.isSharkKey(fish.texture.key) || fish.getData('shadow')) return;

        const shadow = this.add.sprite(fish.x + 16, fish.y + 22, fish.texture.key, fish.frame.name as string | number);
        shadow.setOrigin(fish.originX, fish.originY);
        shadow.setScale(fish.scaleX * 1.04, fish.scaleY * 0.86);
        shadow.setRotation(fish.rotation);
        shadow.setFlipX(fish.flipX);
        shadow.setTint(0x000000);
        shadow.setAlpha(0.28);
        shadow.setBlendMode(Phaser.BlendModes.MULTIPLY);
        shadow.setDepth(fish.depth - 0.1);

        fish.setData('shadow', shadow);
    }

    private syncSharkShadows() {
        this.fishGroup.getChildren().forEach((fishObj: Phaser.GameObjects.GameObject) => {
            const fish = fishObj as Phaser.Physics.Arcade.Sprite;
            const shadow = fish.getData('shadow') as Phaser.GameObjects.Sprite | undefined;
            if (!shadow) return;

            if (!fish.active) {
                shadow.destroy();
                fish.setData('shadow', null);
                return;
            }

            shadow.setPosition(fish.x + 16, fish.y + 22);
            shadow.setScale(fish.scaleX * 1.04, fish.scaleY * 0.86);
            shadow.setRotation(fish.rotation);
            shadow.setFlipX(fish.flipX);
            shadow.setDepth(fish.depth - 0.1);
            shadow.setFrame(fish.frame.name as string | number);
        });
    }

    private destroyFishShadow(fish: Phaser.Physics.Arcade.Sprite) {
        const shadow = fish.getData('shadow') as Phaser.GameObjects.Sprite | undefined;
        if (shadow) {
            shadow.destroy();
            fish.setData('shadow', null);
        }
    }

    private setupDynamicBackground() {
        const w = this.cameras.main.width;
        const h = this.cameras.main.height;

        // Ensure the background always fills the expanded screen area
        this.backgroundImage = this.add.image(this.cameras.main.centerX, this.cameras.main.centerY, 'bg_mentah').setDepth(-100);
        this.backgroundImage.setDisplaySize(w, h);

        this.backgroundOverlay = this.add.rectangle(this.cameras.main.centerX, this.cameras.main.centerY, w, h, 0x0a2a4a, 0.3)
            .setDepth(1)
            .setBlendMode(Phaser.BlendModes.MULTIPLY);

        for (let i = 0; i < 5; i++) {
            const orb = this.add.ellipse(
                Phaser.Math.Between(40, w - 40),
                Phaser.Math.Between(50, h - 120),
                Phaser.Math.Between(190, 260),
                Phaser.Math.Between(100, 170),
                0x39e5ff,
                0.12
            ).setDepth(2).setBlendMode(Phaser.BlendModes.ADD);

            this.ambientLights.push(orb);

            this.tweens.add({
                targets: orb,
                x: Phaser.Math.Between(60, w - 60),
                y: Phaser.Math.Between(60, h - 130),
                alpha: Phaser.Math.FloatBetween(0.07, 0.22),
                angle: Phaser.Math.Between(-12, 12),
                duration: Phaser.Math.Between(4500, 8500),
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }

        // Add subtle moving "inside background" elements (seaweed/grass sway) while keeping bg still.
        const patchCount = 8;
        for (let i = 0; i < patchCount; i++) {
            const patchX = Math.floor(((i + 0.5) / patchCount) * w);
            const baseY = h - Phaser.Math.Between(18, 48);
            const patch = this.add.graphics({ x: patchX, y: baseY }).setDepth(-50);
            patch.setAlpha(0.55);

            const stalks = Phaser.Math.Between(6, 10);
            for (let s = 0; s < stalks; s++) {
                const offsetX = Phaser.Math.Between(-28, 28);
                const height = Phaser.Math.Between(80, 200);
                const bend = Phaser.Math.Between(-55, 55);
                const widthPx = Phaser.Math.Between(2, 5);
                const palette = [0x21b36b, 0x2dd38b, 0x2aa07a, 0x1a8a63];
                const color = palette[Phaser.Math.Between(0, palette.length - 1)];

                patch.lineStyle(widthPx, color, 0.35);
                patch.beginPath();
                patch.moveTo(offsetX, 0);
                const segments = 12;
                for (let p = 1; p <= segments; p++) {
                    const t = p / segments;
                    const x = offsetX + Math.sin(t * Math.PI) * bend;
                    const y = -height * t;
                    patch.lineTo(x, y);
                }
                patch.strokePath();
            }

            patch.setRotation(Phaser.Math.FloatBetween(-0.05, 0.05));
            this.tweens.add({
                targets: patch,
                x: patchX + Phaser.Math.Between(-6, 6),
                rotation: patch.rotation + Phaser.Math.FloatBetween(-0.12, 0.12),
                duration: Phaser.Math.Between(2200, 4200),
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });

            this.seaweedPatches.push(patch);
        }
    }

    private applyScenePhaseVisuals(phase: ScenePhaseConfig) {
        this.backgroundImage.setTint(phase.bgTint);
        this.backgroundOverlay.setFillStyle(phase.ambientColor, phase.ambientAlpha);

        this.ambientLights.forEach((orb) => {
            orb.setFillStyle(phase.ambientColor, phase.ambientAlpha + 0.03);
        });

        this.refreshSpawnTimerForPhase(phase);
    }

    private refreshSpawnTimerForPhase(phase: ScenePhaseConfig) {
        if (!this.isOfflineMode) {
            console.log('[Timer] Skipped: Not in offline mode');
            return;
        }

        const delayByMode: Record<SpawnPatternMode, number> = {
            chaos: 1250,
            formation: 1650,
            zigzag: 1400
        };

        const delay = delayByMode[phase.spawnMode];
        console.log(`[Timer] Starting spawn timer for ${phase.name} (${phase.spawnMode}) with delay ${delay}ms`);

        if (this.spawnTimer) {
            console.log('[Timer] Destroying previous timer');
            this.spawnTimer.destroy();
        }

        this.spawnTimer = this.time.addEvent({
            delay: delay,
            callback: () => {
                try {
                    this.spawnFishByScenePhase();
                } catch (e) {
                    console.error('[Timer] Error in spawnFishByScenePhase:', e);
                }
            },
            loop: true
        });
        
        console.log('[Timer] Timer status:', this.spawnTimer.paused ? 'paused' : 'running');
    }

    private startScenePhaseCycle() {
        this.currentScenePhaseIndex = 0;
        this.applyScenePhaseVisuals(this.scenePhases[this.currentScenePhaseIndex]);
        this.scheduleNextScenePhase();
    }

    private scheduleNextScenePhase() {
        const currentPhase = this.scenePhases[this.currentScenePhaseIndex];
        if (this.scenePhaseTimer) {
            this.scenePhaseTimer.destroy();
        }
        this.scenePhaseTimer = this.time.delayedCall(currentPhase.durationMs, () => {
            this.advanceToNextScenePhase();
        });
    }

    private advanceToNextScenePhase() {
        if (this.isSceneTransitioning) return;

        const fromPhaseIndex = this.currentScenePhaseIndex;
        const toPhaseIndex = (this.currentScenePhaseIndex + 1) % this.scenePhases.length;
        const fromPhase = this.scenePhases[fromPhaseIndex];
        const toPhase = this.scenePhases[toPhaseIndex];

        this.isSceneTransitioning = true;

        // 1. Bersihkan ikan secara cepat sebelum transisi visual dimulai
        this.clearAllFishFast();

        // Tunggu sebentar agar ikan mulai bergerak keluar baru mulai transisi
        this.time.delayedCall(500, () => {
            this.playSceneClosingTransition(fromPhase, toPhase, () => {
                this.currentScenePhaseIndex = toPhaseIndex;
                this.formationWaveStep = 0;
                this.zigzagWaveStep = 0;
                this.applyScenePhaseVisuals(toPhase);
                this.isSceneTransitioning = false;
                this.scheduleNextScenePhase();
            });
        });
    }

    private clearAllFishFast() {
        this.fishGroup.getChildren().forEach((fishObj: any) => {
            const fish = fishObj as Phaser.Physics.Arcade.Sprite;
            if (fish.active) {
                // Hentikan semua tween aktif
                this.tweens.getTweensOf(fish).forEach(t => t.stop());
                
                // Pastikan ikan menghadap ke arah lari
                const speed = 1800;
                let vx = 0;
                
                if (fish.body) {
                    const currentVx = (fish.body as Phaser.Physics.Arcade.Body).velocity.x;
                    vx = currentVx >= 0 ? speed : -speed;
                    
                    // Kasus khusus ikan yang diam atau bergerak vertikal
                    if (Math.abs(currentVx) < 10) {
                        vx = fish.x < this.cameras.main.centerX ? -speed : speed;
                    }
                    
                    (fish.body as Phaser.Physics.Arcade.Body).setVelocity(vx, 0);
                    (fish.body as Phaser.Physics.Arcade.Body).moves = true;
                    
                    // Update flip agar terlihat lari ke depan
                    fish.setFlipX(vx > 0 ? (fish.getData('facesRightByDefault') === false) : (fish.getData('facesRightByDefault') === true));
                }
            }
        });
    }

    private playSceneClosingTransition(fromPhase: ScenePhaseConfig, toPhase: ScenePhaseConfig, onComplete: () => void) {
        const w = this.cameras.main.width;
        const h = this.cameras.main.height;
        const cx = w / 2;
        const cy = h / 2;

        this.fishGroup.clear(true, true);
        this.isSceneTransitioning = true;

        const deepOverlay = this.add.rectangle(cx, cy, w, h, 0x042d61, 0).setDepth(997);
        const leftWave = this.add.graphics().setDepth(1000);
        const rightWave = this.add.graphics().setDepth(1000);
        const foamLayer = this.add.graphics().setDepth(1001);
        
        const phaseTitle = this.add.text(cx, cy - 30, `SCENE CLEAR: ${fromPhase.name.toUpperCase()}`, {
            fontFamily: this.uiFontFamily, fontSize: '48px', color: '#ffea00', fontStyle: 'bold', stroke: '#000', strokeThickness: 10,
            shadow: { offsetX: 0, offsetY: 4, color: '#000', blur: 10, fill: true }
        }).setOrigin(0.5).setDepth(1002).setAlpha(0);

        const nextTitle = this.add.text(cx, cy + 40, `NEXT: ${toPhase.name.toUpperCase()}`, {
            fontFamily: this.uiFontFamily, fontSize: '32px', color: '#ffffff', fontStyle: 'bold', stroke: '#004488', strokeThickness: 6
        }).setOrigin(0.5).setDepth(1002).setAlpha(0);

        this.playWaterWhooshSound();
        this.safePlaySound('snd_scene_wave', { volume: 0.8 });

        const animData = { progress: 0, phase: 0 };
        this.tweens.add({
            targets: animData,
            progress: 1,
            duration: 1750,
            ease: 'Cubic.easeInOut',
            onUpdate: () => {
                const p = animData.progress;
                animData.phase += 0.2;

                const leftEdge = Phaser.Math.Linear(-220, cx + 28, p);
                const rightEdge = Phaser.Math.Linear(w + 220, cx - 28, p);
                const foamAlpha = 0.45 + p * 0.5;

                deepOverlay.setAlpha(0.12 + p * 0.42);

                leftWave.clear();
                leftWave.fillStyle(0x0f66bf, 0.88);
                leftWave.beginPath();
                leftWave.moveTo(0, 0);
                leftWave.lineTo(leftEdge, 0);
                for (let yPos = 0; yPos <= h; yPos += 8) {
                    const ripple = Math.sin((yPos * 0.038) + animData.phase) * 24
                        + Math.cos((yPos * 0.015) + animData.phase * 1.6) * 12;
                    leftWave.lineTo(leftEdge + ripple, yPos);
                }
                leftWave.lineTo(0, h);
                leftWave.closePath();
                leftWave.fillPath();

                rightWave.clear();
                rightWave.fillStyle(0x0f66bf, 0.88);
                rightWave.beginPath();
                rightWave.moveTo(w, 0);
                rightWave.lineTo(rightEdge, 0);
                for (let yPos = 0; yPos <= h; yPos += 8) {
                    const ripple = Math.sin((yPos * 0.038) + animData.phase + 0.9) * 24
                        + Math.cos((yPos * 0.015) + animData.phase * 1.6 + 0.7) * 12;
                    rightWave.lineTo(rightEdge - ripple, yPos);
                }
                rightWave.lineTo(w, h);
                rightWave.closePath();
                rightWave.fillPath();

                foamLayer.clear();
                foamLayer.lineStyle(5, 0xe9fbff, foamAlpha);
                foamLayer.beginPath();
                for (let yPos = 0; yPos <= h; yPos += 14) {
                    const lFoam = leftEdge
                        + Math.sin((yPos * 0.04) + animData.phase * 1.15) * 15
                        + Math.cos((yPos * 0.017) + animData.phase) * 7;
                    if (yPos === 0) foamLayer.moveTo(lFoam, yPos);
                    else foamLayer.lineTo(lFoam, yPos);
                }
                foamLayer.strokePath();

                foamLayer.lineStyle(5, 0xe9fbff, foamAlpha);
                foamLayer.beginPath();
                for (let yPos = 0; yPos <= h; yPos += 14) {
                    const rFoam = rightEdge
                        - Math.sin((yPos * 0.04) + animData.phase * 1.15 + 1.1) * 15
                        - Math.cos((yPos * 0.017) + animData.phase + 0.8) * 7;
                    if (yPos === 0) foamLayer.moveTo(rFoam, yPos);
                    else foamLayer.lineTo(rFoam, yPos);
                }
                foamLayer.strokePath();
            },
            onComplete: () => {
                this.cameras.main.shake(800, 0.03);
                this.safePlaySound('snd_scene_crash', { volume: 1.0 });

                const splashPieces: Phaser.GameObjects.GameObject[] = [];
                const coreSplash = this.add.ellipse(cx, cy, 180, h + 80, 0xe8fbff, 0.5).setDepth(1002);
                splashPieces.push(coreSplash);
                this.tweens.add({
                    targets: coreSplash,
                    width: 420,
                    alpha: 0,
                    duration: 750,
                    ease: 'Cubic.easeOut'
                });

                for (let i = 0; i < 170; i++) {
                    const size = Phaser.Math.Between(3, 16);
                    const droplet = this.add.circle(cx + Phaser.Math.Between(-70, 70), cy + Phaser.Math.Between(-120, 120), size, i % 3 === 0 ? 0xdff6ff : 0xffffff, 0.72);
                    droplet.setDepth(1001);
                    this.tweens.add({
                        targets: droplet,
                        x: droplet.x + Phaser.Math.Between(-620, 620),
                        y: droplet.y + Phaser.Math.Between(-460, 340),
                        alpha: 0,
                        scale: 0.16,
                        duration: Phaser.Math.Between(700, 1750),
                        ease: 'Cubic.easeOut',
                        onComplete: () => droplet.destroy()
                    });
                }

                this.applyScenePhaseVisuals(toPhase);

                this.tweens.add({
                    targets: [phaseTitle, nextTitle],
                    alpha: 1,
                    scale: { from: 0.5, to: 1 },
                    duration: 600,
                    ease: 'Back.easeOut',
                    onComplete: () => {
                        this.time.delayedCall(1800, () => {
                            this.tweens.add({
                                targets: [phaseTitle, nextTitle],
                                alpha: 0,
                                duration: 500
                            });

                            this.tweens.add({
                                targets: [deepOverlay, leftWave, rightWave, foamLayer, ...splashPieces as any[]],
                                alpha: 0,
                                duration: 900,
                                onComplete: () => {
                                    deepOverlay.destroy();
                                    leftWave.destroy();
                                    rightWave.destroy();
                                    foamLayer.destroy();
                                    splashPieces.forEach(piece => piece.destroy());
                                    phaseTitle.destroy();
                                    nextTitle.destroy();
                                    this.isSceneTransitioning = false;
                                    onComplete();
                                }
                            });
                        });
                    }
                });
            }
        });
    }

    private spawnFishByScenePhase() {
        if (!this.isOfflineMode || this.isSceneTransitioning || this.isGoldenWarningActive) return;

        const canWarn = this.time.now - this.lastGoldenSharkWarningTime > 25000;
        if (canWarn && this.canSpawnGoldenSharkNow() && Math.random() < 0.018) {
            this.triggerGoldenSharkWarning();
            return;
        }

        const scenePhase = this.scenePhases[this.currentScenePhaseIndex];
        if (scenePhase.spawnMode === 'formation') {
            this.spawnFormationWave();
        } else if (scenePhase.spawnMode === 'zigzag') {
            this.spawnZigzagWave();
        } else {
            this.spawnChaosWave();
        }
    }

    private spawnChaosWave() {
        const fishCount = Phaser.Math.Between(1, 2);
        for (let i = 0; i < fishCount; i++) {
            this.spawnRandomFish();
        }
    }

    private spawnFormationWave() {
        const w = this.cameras.main.width;
        const side: 'left' | 'right' = this.formationWaveStep % 2 === 0 ? 'left' : 'right';
        const startX = side === 'left' ? -260 : w + 260;
        const rowYs = [190, 310, 430];

        rowYs.forEach((rowY, rowIndex) => {
            const config = this.pickRandomFishConfig(['fish1', 'fish2', 'fish3', 'fish4', 'fish5', 'fish6', 'fish7']);
            if (!config) return;

            this.spawnFish(config, {
                x: startX + (side === 'left' ? -70 * rowIndex : 70 * rowIndex),
                y: rowY + Phaser.Math.Between(-10, 10),
                side: side,
                disableWave: true
            });
        });

        this.formationWaveStep++;
    }

    private spawnZigzagWave() {
        const w = this.cameras.main.width;
        const h = this.cameras.main.height;
        const spawnCount = 3;

        for (let i = 0; i < spawnCount; i++) {
            const side: 'left' | 'right' = (this.zigzagWaveStep + i) % 2 === 0 ? 'left' : 'right';
            const normalized = (this.zigzagWaveStep * 0.8) + i * 0.75;
            const y = Phaser.Math.Clamp(h * 0.46 + Math.sin(normalized) * 190, 140, h - 280);
            const x = side === 'left' ? -220 - i * 80 : w + 220 + i * 80;
            const config = this.pickRandomFishConfig(['fish3', 'fish4', 'fish5', 'fish6', 'fish7', 'fish8', 'fish9', 'shark1']);
            if (!config) continue;

            this.spawnFish(config, {
                x,
                y,
                side
            });
        }

        this.zigzagWaveStep++;
    }

    private pickRandomFishConfig(allowedKeys?: string[]): FishConfig | null {
        const pool = allowedKeys ? this.fishConfigs.filter(f => allowedKeys.includes(f.key)) : this.fishConfigs;
        if (pool.length === 0) return null;

        const totalProb = pool.reduce((acc, config) => acc + config.probability, 0);
        const rand = Math.random() * totalProb;

        let cumulative = 0;
        for (const config of pool) {
            cumulative += config.probability;
            if (rand <= cumulative) return config;
        }

        return pool[pool.length - 1];
    }

    private triggerGoldenSharkWarning() {
        if (this.isGoldenWarningActive) return;
        if (!this.canSpawnGoldenSharkNow()) return;

        const sharkConfig = this.fishConfigs.find(cfg => cfg.key === 'sharkjumbo_v2');
        if (!sharkConfig) return;

        this.showGoldenSharkWarning(() => {
            this.spawnFish(sharkConfig, { skipWarning: true });
        });
    }

    private showGoldenSharkWarning(onWarningComplete: () => void): boolean {
        if (this.isGoldenWarningActive) return false;

        this.isGoldenWarningActive = true;
        this.lastGoldenSharkWarningTime = this.time.now;

        const w = this.cameras.main.width;
        const h = this.cameras.main.height;
        const cx = this.cameras.main.centerX;
        const cy = this.cameras.main.centerY;

        const overlay = this.add.rectangle(cx, cy, w, h, 0x2b0000, 0).setDepth(89);
        const warningText = this.add.text(cx, cy - 24, 'WARNING!', {
            fontFamily: this.uiFontFamily,
            fontSize: '88px',
            color: '#ff2f2f',
            fontStyle: 'bold',
            stroke: '#ffffff',
            strokeThickness: 8
        }).setOrigin(0.5).setDepth(90).setScale(0.6).setAlpha(0);

        const detailText = this.add.text(cx, cy + 52, 'GOLDEN SHARK INCOMING', {
            fontFamily: this.uiFontFamily,
            fontSize: '42px',
            color: '#ffd54a',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5).setDepth(90).setScale(0.8).setAlpha(0);
        const countdownText = this.add.text(cx, cy + 132, '3', {
            fontFamily: this.uiFontFamily,
            fontSize: '64px',
            color: '#ffffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 8
        }).setOrigin(0.5).setDepth(90).setAlpha(0);

        this.playGoldenWarningSiren();
        this.safePlaySound('snd_incoming_golden_shark', { volume: 0.7 });
        this.cameras.main.shake(450, 0.009);

        this.tweens.add({
            targets: overlay,
            alpha: 0.38,
            duration: 150,
            yoyo: true,
            repeat: 2
        });

        this.tweens.add({
            targets: [warningText, detailText, countdownText],
            alpha: 1,
            scale: 1,
            duration: 280,
            ease: 'Back.easeOut',
            yoyo: true,
            repeat: 2
        });

        const countdownValues = ['3', '2', '1'];
        countdownValues.forEach((value, idx) => {
            this.time.delayedCall(idx * 450, () => {
                if (!countdownText.active) return;
                countdownText.setText(value);
                countdownText.setScale(1.25);
                this.tweens.add({
                    targets: countdownText,
                    scale: 0.92,
                    duration: 320,
                    ease: 'Cubic.easeOut'
                });
            });
        });

        this.time.delayedCall(1650, onWarningComplete);

        this.time.delayedCall(1950, () => {
            this.tweens.add({
                targets: [overlay, warningText, detailText, countdownText],
                alpha: 0,
                duration: 260,
                onComplete: () => {
                    overlay.destroy();
                    warningText.destroy();
                    detailText.destroy();
                    countdownText.destroy();
                    this.isGoldenWarningActive = false;
                }
            });
        });

        return true;
    }

    private playGoldenWarningSiren() {
        const audioContext = (this.sound as any).context as AudioContext | undefined;
        if (!audioContext) {
            this.safePlaySound('snd_jackpot', { volume: 0.45, rate: 0.7 });
            return;
        }

        const now = audioContext.currentTime;
        const gain = audioContext.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.12, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
        gain.connect(audioContext.destination);

        const osc = audioContext.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(650, now);
        osc.frequency.linearRampToValueAtTime(1100, now + 0.2);
        osc.frequency.linearRampToValueAtTime(620, now + 0.4);
        osc.frequency.linearRampToValueAtTime(1080, now + 0.6);
        osc.frequency.linearRampToValueAtTime(600, now + 0.8);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.82);

        osc.onended = () => {
            osc.disconnect();
            gain.disconnect();
        };
    }

    private playWaterWhooshSound() {
        const audioContext = (this.sound as any).context as AudioContext | undefined;
        if (!audioContext) {
            this.safePlaySound('snd_hit', { volume: 0.22, rate: 0.55 });
            return;
        }

        if (audioContext.state === 'suspended') {
            audioContext.resume().catch(() => {});
        }

        const now = audioContext.currentTime;
        const duration = 0.75;

        const noiseLength = Math.floor(audioContext.sampleRate * duration);
        const noiseBuffer = audioContext.createBuffer(1, noiseLength, audioContext.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseLength; i++) {
            const t = i / noiseLength;
            const envelope = Math.pow(1 - t, 2.2);
            data[i] = (Math.random() * 2 - 1) * envelope;
        }

        const noise = audioContext.createBufferSource();
        noise.buffer = noiseBuffer;

        const filter = audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1800, now);
        filter.frequency.exponentialRampToValueAtTime(420, now + duration);

        const hp = audioContext.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(80, now);

        const gain = audioContext.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.18, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        const delay = audioContext.createDelay(0.6);
        delay.delayTime.setValueAtTime(0.14, now);
        const feedback = audioContext.createGain();
        feedback.gain.setValueAtTime(0.18, now);

        noise.connect(filter);
        filter.connect(hp);
        hp.connect(gain);
        gain.connect(audioContext.destination);
        gain.connect(delay);
        delay.connect(audioContext.destination);
        delay.connect(feedback);
        feedback.connect(delay);

        noise.start(now);
        noise.stop(now + duration);

        noise.onended = () => {
            noise.disconnect();
            filter.disconnect();
            hp.disconnect();
            gain.disconnect();
            delay.disconnect();
            feedback.disconnect();
        };
    }

    private costTorpedoText!: Phaser.GameObjects.Text;
    private costFrozenText!: Phaser.GameObjects.Text;

    private updateSkillCosts() {
        if (this.costTorpedoText) this.costTorpedoText.setText((this.betAmount * 6).toFixed(2));
        if (this.costFrozenText) this.costFrozenText.setText((this.betAmount * 3).toFixed(2));

        const currentCannon = this.getCannonKey();
        if (this.playerCannon) this.playerCannon.setTexture(currentCannon);
    }

    private setupJackpotBars() {
        const w = this.cameras.main.width;
        const panelWidth = 800;
        const panelHeight = 60;
        const centerX = w / 2;
        const centerY = 40;

        // Background Panel
        const bg = this.add.graphics().setDepth(30);
        bg.fillStyle(0x000000, 0.6);
        bg.fillRoundedRect(centerX - panelWidth / 2, centerY - panelHeight / 2, panelWidth, panelHeight, 10);
        
        // JILI Jackpot (Center)
        this.add.text(centerX, centerY - 15, 'JILI Jackpot', {
            fontFamily: this.uiFontFamily, fontSize: '14px', color: '#ffd700', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(31);
        this.jiliJackpotText = this.add.text(centerX, centerY + 10, '0.00', {
            fontFamily: this.uiFontFamily, fontSize: '28px', color: '#ffcc00', fontStyle: 'bold', stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5).setDepth(31);

        // Speed Jackpot (Left)
        this.add.text(centerX - 250, centerY - 15, 'Speed Jackpot', {
            fontFamily: this.uiFontFamily, fontSize: '12px', color: '#ffd700'
        }).setOrigin(0.5).setDepth(31);
        this.speedJackpotText = this.add.text(centerX - 250, centerY + 10, '0.00', {
            fontFamily: this.uiFontFamily, fontSize: '22px', color: '#ffd700', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(31);

        // Lucky Jackpot (Right)
        this.add.text(centerX + 250, centerY - 15, 'Lucky Jackpot', {
            fontFamily: this.uiFontFamily, fontSize: '12px', color: '#ffd700'
        }).setOrigin(0.5).setDepth(31);
        this.luckyJackpotText = this.add.text(centerX + 250, centerY + 10, '0.00', {
            fontFamily: this.uiFontFamily, fontSize: '22px', color: '#ffd700', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(31);

        this.updateJackpotDisplay();
    }

    private updateJackpotDisplay() {
        if (this.speedJackpotText) this.speedJackpotText.setText(this.speedJackpot.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        if (this.jiliJackpotText) this.jiliJackpotText.setText(this.jiliJackpot.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        if (this.luckyJackpotText) this.luckyJackpotText.setText(this.luckyJackpot.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    }

    private setupEffects() {
        const w = this.cameras.main.width;
        const h = this.cameras.main.height;

        // Bubble Particles (Phaser 3.60+ / v4 API)
        this.add.particles(0, 0, 'bubble', {
            x: { min: 0, max: w },
            y: { min: h + 20, max: h + 100 },
            lifespan: 12000,
            speedY: { min: -40, max: -90 },
            scale: { start: 0.4, end: 0.1 },
            alpha: { start: 0.5, end: 0 },
            frequency: 450,
            blendMode: 'ADD'
        });

        // Light Beams (God Rays)
        const beamGfx = this.add.graphics().setDepth(-60).setAlpha(0.2);
        for (let i = 0; i < 4; i++) {
            const bx = Phaser.Math.Between(100, w - 100);
            const bw = Phaser.Math.Between(40, 100);
            beamGfx.fillStyle(0x39e5ff, 0.15);
            beamGfx.beginPath();
            beamGfx.moveTo(bx - bw, 0);
            beamGfx.lineTo(bx + bw, 0);
            beamGfx.lineTo(bx + bw * 2, h);
            beamGfx.lineTo(bx - bw * 2, h);
            beamGfx.closePath();
            beamGfx.fillPath();
        }

        this.tweens.add({
            targets: beamGfx,
            alpha: 0.1,
            duration: 3000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    private setupFishingWarUI() {
        const w = this.cameras.main.width;
        const h = this.cameras.main.height;

        this.setupJackpotBars();

        // --- TOP LEFT: User ID (Placeholder) ---
        // joyBtn removed as requested

        // --- TOP RIGHT: User Info ---
        this.add.text(w - 150, 20, '61700410801822304', { fontSize: '14px', color: '#fff' }).setOrigin(0.5).setDepth(100);

        // btn_play removed as requested

        // --- RIGHT SIDE: Skills ---
        const rightX = w - 60;
        const createSkillBtn = (y: number, label: string, iconKey: string, cost?: string) => {
            const bg = this.add.circle(rightX, y, 35, 0x001133, 0.7).setStrokeStyle(3, 0x0088ff).setDepth(29);
            this.add.image(rightX, y - 5, iconKey).setDepth(31).setScale(0.6);
            this.add.text(rightX, y + 22, label, { fontSize: '11px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(31);
            if (cost) {
                this.add.text(rightX + 20, y + 10, cost, { fontSize: '12px', color: '#ffd700', fontStyle: 'bold' }).setOrigin(0.5).setDepth(32);
            }
            const btn = this.add.circle(rightX, y, 35, 0, 0.01).setInteractive().setDepth(32);
            return { btn, bg };
        };

        const targetObj = createSkillBtn(100, 'Target', 'icon_target');
        const torpedoObj = createSkillBtn(180, 'Torpedo', 'icon_torpedo');
        const autoObj = createSkillBtn(260, 'Auto Fishing', 'icon_auto');
        const frozenObj = createSkillBtn(340, 'Frozen', 'icon_frozen', '30');

        this.targetBtnBg = targetObj.bg;
        this.torpedoBtnBg = torpedoObj.bg;

        targetObj.btn.on('pointerdown', () => {
            this.playUiClick();
            this.isTargetMode = !this.isTargetMode;
            this.targetBtnBg.setStrokeStyle(this.isTargetMode ? 6 : 3, this.isTargetMode ? 0xffffff : 0x0088ff);
            if (!this.isTargetMode) {
                this.stopLaserFireSounds();
            }
            this.updateAutoShootState();
        });

        autoObj.btn.on('pointerdown', () => {
            this.playUiClick();
            this.isAutoMode = !this.isAutoMode;
            autoObj.bg.setStrokeStyle(this.isAutoMode ? 6 : 3, this.isAutoMode ? 0xffffff : 0x0088ff);
            this.updateAutoShootState();
        });

        torpedoObj.btn.on('pointerdown', () => {
            this.playUiClick();
            this.toggleTorpedoMode();
        });
        frozenObj.btn.on('pointerdown', () => {
            this.playUiClick();
            this.activateFrozenSkill(true);
        });

        // --- BOTTOM CENTER: Waiting Panel ---
        const waitBg = this.add.graphics().setDepth(30);
        waitBg.fillStyle(0x001133, 0.8).fillRoundedRect(w/2 - 80, h - 50, 160, 40, 10);
        this.add.text(w/2, h - 30, 'WAITING TO JOIN', { fontSize: '14px', color: '#00ffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(31);

        // --- PLAYER 1 (BOTTOM LEFT) ---
        const p1X = 250;
        const p1Y = h - 45;

        // Minus/Plus and Bet display
        const betPanel = this.add.graphics().setDepth(30);
        betPanel.fillStyle(0x001133, 0.9).lineStyle(2, 0xffd700).fillRoundedRect(p1X - 100, p1Y - 20, 200, 40, 20).strokeRoundedRect(p1X - 100, p1Y - 20, 200, 40, 20);
        
        const btnMinus = this.add.circle(p1X - 90, p1Y, 18, 0x004488).setStrokeStyle(2, 0x00f2ff).setInteractive().setDepth(31);
        this.add.text(p1X - 90, p1Y, '-', { fontSize: '24px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(32);
        btnMinus.on('pointerdown', () => {
            this.playUiClick(0.4);
            if (this.betAmount > 0.1) this.betAmount -= 0.1;
            this.updateScoreDisplay();
        });

        const btnPlus = this.add.circle(p1X + 90, p1Y, 18, 0x004488).setStrokeStyle(2, 0x00f2ff).setInteractive().setDepth(31);
        this.add.text(p1X + 90, p1Y, '+', { fontSize: '24px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(32);
        btnPlus.on('pointerdown', () => {
            this.playUiClick(0.4);
            this.betAmount += 0.1;
            this.updateScoreDisplay();
        });

        this.betText = this.add.text(p1X - 40, p1Y, '0.10', { fontSize: '18px', color: '#00f2ff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(31);
        this.add.text(p1X + 20, p1Y, 'LV 1', { fontSize: '12px', color: '#fff', backgroundColor: '#008800' }).setOrigin(0.5).setDepth(31);

        // Balance display below bet
        const balPanel = this.add.graphics().setDepth(30);
        balPanel.fillStyle(0x000000, 0.6).fillRoundedRect(p1X - 80, p1Y + 25, 160, 20, 5);
        this.scoreText = this.add.text(p1X, p1Y + 35, '2,000.00', { fontSize: '16px', color: '#ffd700', fontStyle: 'bold' }).setOrigin(0.5).setDepth(31);

        // --- PLAYER 2 (BOTTOM RIGHT) ---
        const p2X = w - 250;
        const p2Y = h - 45;

        const p2Panel = this.add.graphics().setDepth(30);
        p2Panel.fillStyle(0x001133, 0.9).fillRoundedRect(p2X - 100, p2Y - 20, 200, 40, 20);
        this.dummyBetText = this.add.text(p2X - 60, p2Y, '0.10', { fontSize: '18px', color: '#00f2ff' }).setOrigin(0.5).setDepth(31);
        this.add.text(p2X + 20, p2Y, '*********959', { fontSize: '12px', color: '#ccc' }).setOrigin(0.5).setDepth(31);
        
        const p2BalPanel = this.add.graphics().setDepth(30);
        p2BalPanel.fillStyle(0x000000, 0.6).fillRoundedRect(p2X - 80, p2Y + 25, 160, 20, 5);
        this.dummyScoreText = this.add.text(p2X, p2Y + 35, '472.00', { fontSize: '16px', color: '#ffd700' }).setOrigin(0.5).setDepth(31);

        // --- SHOOTING BAR ---
        const shoBarX = 30;
        const shoBarY = h - 150;
        const shoBg = this.add.graphics().setDepth(30);
        shoBg.fillStyle(0x000000, 0.5).fillRoundedRect(shoBarX - 10, shoBarY - 10, 20, 120, 10);
        const shoFill = this.add.graphics().setDepth(31);
        shoFill.fillStyle(0x00f2ff, 1).fillRect(shoBarX - 5, shoBarY, 10, 60);
        this.add.text(shoBarX, shoBarY + 110, 'Sho', { fontSize: '10px', color: '#fff' }).setOrigin(0.5).setDepth(31);
    }

    private setupSideMenuUI() {
        // More Button (Hamburger) - Top Left
        const moreBtn = this.add.container(40, 40).setDepth(150);
        const moreBg = this.add.circle(0, 0, 25, 0x004488, 0.8).setStrokeStyle(3, 0x00f2ff).setInteractive();
        const burgerGfx = this.add.graphics();
        burgerGfx.lineStyle(3, 0xffffff);
        burgerGfx.lineBetween(-12, -8, 12, -8);
        burgerGfx.lineBetween(-12, 0, 12, 0);
        burgerGfx.lineBetween(-12, 8, 12, 8);
        moreBtn.add([moreBg, burgerGfx]);

        moreBg.on('pointerdown', () => {
            this.playUiClick();
            this.toggleSideMenu();
        });

        // Side Menu Container
        this.sideMenuUI = this.add.container(-300, 100).setDepth(160);
        this.sideMenuUI.setVisible(false);

        const menuWidth = 240;
        const topHeight = 220;
        const bottomHeight = 220;
        const spacing = 10;

        // --- TOP PANEL ---
        const topPanel = this.add.container(0, 0);
        const topBg = this.add.graphics();
        topBg.fillStyle(0x002266, 0.95);
        topBg.lineStyle(2, 0x0088ff, 1);
        topBg.fillRoundedRect(0, 0, menuWidth, topHeight, 15);
        topBg.strokeRoundedRect(0, 0, menuWidth, topHeight, 15);
        topPanel.add(topBg);

        const createMenuItem = (x: number, y: number, label: string, iconType: string, isRound: boolean = false) => {
            const item = this.add.container(x, y);
            
            if (isRound) {
                const circle = this.add.circle(0, 0, 30, 0x004488, 0.8).setStrokeStyle(2, 0xffd700);
                item.add(circle);
            }

            // Simple Icons using Graphics
            const iconGfx = this.add.graphics();
            if (iconType === 'coins') {
                iconGfx.fillStyle(0xffd700);
                iconGfx.fillCircle(0, -5, 10);
                iconGfx.fillCircle(-5, 5, 10);
                iconGfx.fillCircle(5, 5, 10);
            } else if (iconType === 'backpack') {
                iconGfx.fillStyle(0x8b4513);
                iconGfx.fillRoundedRect(-15, -15, 30, 30, 5);
                iconGfx.lineStyle(2, 0xffffff);
                iconGfx.strokeRoundedRect(-10, -10, 20, 20, 2);
            } else if (iconType === 'mask') {
                iconGfx.fillStyle(0x9932cc);
                iconGfx.fillEllipse(0, 0, 20, 10);
                iconGfx.fillStyle(0xffffff);
                iconGfx.fillCircle(-8, 0, 4);
                iconGfx.fillCircle(8, 0, 4);
            } else if (iconType === 'help') {
                iconGfx.fillStyle(0x00ff88);
                iconGfx.fillEllipse(0, 0, 15, 10);
                iconGfx.beginPath();
                iconGfx.moveTo(10, 0);
                iconGfx.lineTo(18, -8);
                iconGfx.lineTo(18, 8);
                iconGfx.closePath();
                iconGfx.fillPath();
            } else if (iconType === 'report') {
                iconGfx.fillStyle(0xffffff);
                iconGfx.fillRect(-10, -12, 20, 24);
                iconGfx.lineStyle(1, 0x000000);
                iconGfx.lineBetween(-6, -4, 6, -4);
                iconGfx.lineBetween(-6, 2, 6, 2);
            } else if (iconType === 'music') {
                iconGfx.fillStyle(0xffffff);
                iconGfx.fillRect(-10, -5, 5, 10);
                iconGfx.beginPath();
                iconGfx.moveTo(-5, -5);
                iconGfx.lineTo(5, -12);
                iconGfx.lineTo(5, 12);
                iconGfx.lineTo(-5, 5);
                iconGfx.closePath();
                iconGfx.fillPath();
            } else if (iconType === 'event') {
                iconGfx.fillStyle(0xff0000);
                iconGfx.fillRect(-15, -10, 30, 20);
                iconGfx.lineStyle(1, 0xffd700);
                iconGfx.lineBetween(-15, -10, 0, 0);
                iconGfx.lineBetween(15, -10, 0, 0);
            }
            item.add(iconGfx);

            const text = this.add.text(0, isRound ? 40 : 35, label, {
                fontFamily: this.uiFontFamily,
                fontSize: isRound ? '12px' : '14px',
                color: '#ffffff',
                fontStyle: 'bold',
                stroke: '#000',
                strokeThickness: 2
            }).setOrigin(0.5);
            item.add(text);

            const hitArea = this.add.rectangle(0, 10, 80, 80, 0, 0.01).setInteractive();
            item.add(hitArea);

            return { item, hitArea };
        };

        const winMore = createMenuItem(70, 60, 'WIN MORE', 'coins');
        const backpack = createMenuItem(170, 60, 'Backpack', 'backpack');
        const collection = createMenuItem(70, 150, 'Collection', 'mask');
        topPanel.add([winMore.item, backpack.item, collection.item]);

        // --- BOTTOM PANEL ---
        const bottomPanel = this.add.container(0, topHeight + spacing);
        const bottomBg = this.add.graphics();
        bottomBg.fillStyle(0x002266, 0.95);
        bottomBg.lineStyle(2, 0x0088ff, 1);
        bottomBg.fillRoundedRect(0, 0, menuWidth, bottomHeight, 15);
        bottomBg.strokeRoundedRect(0, 0, menuWidth, bottomHeight, 15);
        bottomPanel.add(bottomBg);

        const help = createMenuItem(60, 60, 'Help', 'help', true);
        const report = createMenuItem(180, 60, 'Report', 'report', true);
        const music = createMenuItem(60, 150, 'Music', 'music', true);
        const event = createMenuItem(60, bottomHeight - 30, 'Event', 'event', true); // Shifted like in image
        
        // Re-adjusting event for grid-like feel but matching image
        event.item.setPosition(60, 150); // Just for now
        // Let's do a better grid for bottom
        help.item.setPosition(60, 60);
        report.item.setPosition(180, 60);
        music.item.setPosition(180, 150);
        event.item.setPosition(60, 150);

        bottomPanel.add([help.item, report.item, music.item, event.item]);

        this.sideMenuUI.add([topPanel, bottomPanel]);

        // Interaction for music
        music.hitArea.on('pointerdown', () => {
            this.playUiClick();
            const isMuted = this.sound.mute;
            this.sound.setMute(!isMuted);
            music.item.setAlpha(this.sound.mute ? 0.5 : 1);
        });

        // Add some hover effects
        [winMore, backpack, collection, help, report, music, event].forEach(obj => {
            obj.hitArea.on('pointerover', () => obj.item.setScale(1.1));
            obj.hitArea.on('pointerout', () => obj.item.setScale(1.0));
        });
    }

    private toggleSideMenu() {
        this.isSideMenuOpen = !this.isSideMenuOpen;
        if (this.isSideMenuOpen) {
            this.sideMenuUI!.setVisible(true);
            this.tweens.add({
                targets: this.sideMenuUI,
                x: 20,
                duration: 300,
                ease: 'Back.easeOut'
            });
        } else {
            this.tweens.add({
                targets: this.sideMenuUI,
                x: -300,
                duration: 250,
                ease: 'Power2.easeIn',
                onComplete: () => this.sideMenuUI!.setVisible(false)
            });
        }
    }


    update() {
        this.lightningGfx.clear();
        if (this.lastLaserFireShotAt > 0 && this.time.now - this.lastLaserFireShotAt > 520) {
            this.stopLaserFireSounds();
            this.lastLaserFireShotAt = -99999;
        }
        if (this.time.now - this.lastGoldenMusicCheckAt > 200) {
            this.refreshGoldenSharkMusic();
            this.lastGoldenMusicCheckAt = this.time.now;
        }
        const pointer = this.input.activePointer;

        // Logika Mengikuti Target
        if (this.lockedTarget && this.lockedTarget.active) {
            if (!this.isFishInWarArea(this.lockedTarget)) {
                const replacementTarget = this.findReplacementTargetByType(
                    this.lockedTarget,
                    this.targetCrosshairFocusX || this.lockedTarget.x,
                    this.targetCrosshairFocusY || this.lockedTarget.y
                );
                if (replacementTarget) {
                    this.lockedTarget = replacementTarget;
                } else {
                    this.lockedTarget = null;
                    this.targetCrosshair.setVisible(false);
                    this.hideLaserBeam();
                    this.stopLaserFireSounds();
                    this.updateAutoShootState();
                }
            }
        }

        if (this.lockedTarget && this.lockedTarget.active) {
            this.targetCrosshairFocusX = this.lockedTarget.x;
            this.targetCrosshairFocusY = this.lockedTarget.y;
            // Gambar Crosshair
            this.targetCrosshair.clear();
            this.targetCrosshair.lineStyle(4, 0xff0000, 1);
            this.targetCrosshair.strokeCircle(this.lockedTarget.x, this.lockedTarget.y, 40);
            this.targetCrosshair.lineStyle(2, 0xffffff, 1);
            this.targetCrosshair.strokeCircle(this.lockedTarget.x, this.lockedTarget.y, 45);
            this.targetCrosshair.setVisible(true);

            // Putar meriam ke target
            const angle = Phaser.Math.Angle.Between(this.playerCannon.x, this.playerCannon.y, this.lockedTarget.x, this.lockedTarget.y);
            this.playerCannon.setRotation(angle + Math.PI / 2);

            // Gambar efek laser pengunci sasaran (Visual Only)
            if (this.isTargetMode) {
                this.drawLightning();
            } else {
                this.hideLaserBeam();
            }
        } else if (this.lockedTarget && !this.lockedTarget.active) {
            // Target mati/hilang
            this.lockedTarget = null;
            this.targetCrosshair.setVisible(false);
            this.hideLaserBeam();
            this.stopLaserFireSounds();
            this.updateAutoShootState();
        } else {
            // Putar meriam ke mouse jika tidak ada target
            const angle = Phaser.Math.Angle.Between(this.playerCannon.x, this.playerCannon.y, pointer.x, pointer.y);
            this.playerCannon.setRotation(angle + Math.PI / 2);
            this.hideLaserBeam();
            if (!this.isTargetMode) {
                this.stopLaserFireSounds();
            }
        }

        // Putaran Crosshair
        if (this.targetCrosshair.visible) {
            this.targetCrosshair.rotation += 0.05;
        }

        this.syncSharkShadows();

        this.bullets.getChildren().forEach((b: any) => {
            if (!b.active) return;

            if (b.getData('isTorpedo')) {
                const body = b.body as Phaser.Physics.Arcade.Body | null;
                const targetFish = b.getData('torpedoTargetFish') as Phaser.Physics.Arcade.Sprite | null;
                const fallbackX = (b.getData('torpedoAimX') as number) ?? b.x;
                const fallbackY = (b.getData('torpedoAimY') as number) ?? b.y;
                const aimX = targetFish && targetFish.active ? targetFish.x : fallbackX;
                const aimY = targetFish && targetFish.active ? targetFish.y : fallbackY;
                b.setData('torpedoAimX', aimX);
                b.setData('torpedoAimY', aimY);

                if (body) {
                    const desired = Phaser.Math.Angle.Between(b.x, b.y, aimX, aimY);
                    const rot = Phaser.Math.Angle.RotateTo(b.rotation, desired, 0.14);
                    b.setRotation(rot);
                    const bornAt = (b.getData('torpedoBornAt') as number) || this.time.now;
                    const age = this.time.now - bornAt;
                    const speed = age < 260 ? 760 + age * 1.65 : 1180;
                    this.physics.velocityFromRotation(rot, speed, body.velocity);

                    if (age > 2200) {
                        const flame = b.getData('torpedoFlame') as Phaser.GameObjects.Sprite | undefined;
                        if (flame && flame.active) flame.destroy();
                        const exp = this.add.sprite(b.x, b.y, 'explosion_v2').setDepth(41).setScale(1.2);
                        this.tweens.add({ targets: exp, scale: 3, alpha: 0, duration: 500, onComplete: () => exp.destroy() });
                        this.safePlaySound('snd_explosion', { volume: 0.5 });
                        this.bullets.killAndHide(b);
                        body.setVelocity(0, 0);
                        return;
                    }
                }

                const flame = b.getData('torpedoFlame') as Phaser.GameObjects.Sprite | undefined;
                if (flame && flame.active) {
                    const tailOffset = 42 * b.scaleX;
                    flame.setPosition(
                        b.x - Math.cos(b.rotation) * tailOffset,
                        b.y - Math.sin(b.rotation) * tailOffset
                    );
                    flame.setRotation(b.rotation + Math.PI);
                    flame.setScale(0.58 + Math.random() * 0.12);
                    flame.setAlpha(0.74 + Math.random() * 0.24);
                }
            }

            // Peluru pantul harus selalu menghadap arah gerak (kepala tetap di depan).
            if (b.body && b.getData('allowBounce')) {
                const body = b.body as Phaser.Physics.Arcade.Body;
                const vx = body.velocity.x;
                const vy = body.velocity.y;
                if ((Math.abs(vx) + Math.abs(vy)) > 8) {
                    b.setRotation(Math.atan2(vy, vx));
                }
            }

            if (b.x <= -50 || b.x >= this.cameras.main.width + 50 || b.y <= -50 || b.y >= this.cameras.main.height + 50) {
                const flame = b.getData('torpedoFlame') as Phaser.GameObjects.Sprite | undefined;
                if (flame && flame.active) flame.destroy();
                this.bullets.killAndHide(b);
            }
        });

        this.fishGroup.getChildren().forEach((f: any) => {
            if (!f.active) return;

            const camW = this.cameras.main.width || 1280;
            const camH = this.cameras.main.height || 720;

            if (f.x < -1000 || f.x > camW + 1000 || f.y < -1000 || f.y > camH + 1000) {
                if (f.texture && f.texture.key === 'sharkjumbo_v2') {
                    this.isJumboActive = false;
                }
                this.destroyFishShadow(f);
                f.destroy();
                this.refreshGoldenSharkMusic();
            }
        });

        // Dummy Multiplay Logic: P2 Cannon rotates and shoots
        const p2Cannon = this.children.getByName('p2_cannon') as Phaser.GameObjects.Sprite;
        if (p2Cannon) {
            const activeFish = this.fishGroup.getChildren().filter(f => f.active);
            if (activeFish.length > 0) {
                const targetFish = activeFish[0] as Phaser.Physics.Arcade.Sprite;
                const angle = Phaser.Math.Angle.Between(p2Cannon.x, p2Cannon.y, targetFish.x, targetFish.y);
                p2Cannon.setRotation(angle + Math.PI / 2);

                if (Math.random() < 0.01) { // Occasional shoot
                    this.fireDummyBullet(p2Cannon.x, p2Cannon.y, angle);
                }
            }
        }
    }

    private fireDummyBullet(x: number, y: number, angle: number) {
        const bullet = this.bullets.get(x, y) as Phaser.Physics.Arcade.Sprite;
        if (bullet) {
            bullet.setActive(true).setVisible(true);
            bullet.setRotation(angle);
            bullet.setTexture('bullet');
            bullet.setData('ownerId', 'dummy_p2'); // Tandai sebagai peluru Player 2
            bullet.setData('allowBounce', true);
            bullet.setData('bounceCount', 0);
            bullet.setData('maxBounceCount', 3);
            bullet.setScale(0.3).setTint(0x00ff00); // Greenish for P2
            if (bullet.body) {
                const body = bullet.body as Phaser.Physics.Arcade.Body;
                body.setSize(10, 10);
                body.setCollideWorldBounds(true, 1, 1, true);
                body.setBounce(1, 1);
                body.onWorldBounds = true;
                this.physics.velocityFromRotation(angle, 1000, body.velocity);
            }
        }
    }

    private drawLightning() {
        const cannon = this.playerCannon;
        const muzzleOffset = 45;
        const startX = cannon.x + Math.cos(cannon.rotation - Math.PI / 2) * muzzleOffset;
        const startY = cannon.y + Math.sin(cannon.rotation - Math.PI / 2) * muzzleOffset;

        const targetX = this.lockedTarget!.x;
        const targetY = this.lockedTarget!.y;

        const dist = Phaser.Math.Distance.Between(startX, startY, targetX, targetY);
        if (dist < 6) {
            this.lightningGfx.clear();
            this.hideLaserBeam();
            return;
        }

        const baseAngle = Phaser.Math.Angle.Between(startX, startY, targetX, targetY);
        const dx = Math.cos(baseAngle);
        const dy = Math.sin(baseAngle);
        const nx = -dy;
        const ny = dx;
        const phase = this.time.now * 0.0019;
        this.hideLaserBeam();
        this.lightningGfx.clear();

        // Nyaris lurus seperti referensi, hanya sedikit "bernapas"
        const pointCount = Phaser.Math.Clamp(Math.floor(dist / 24), 18, 58);
        const waveAmp = Phaser.Math.Clamp(dist * 0.0012, 0.55, 1.5);
        const points: Phaser.Math.Vector2[] = [];

        for (let i = 0; i <= pointCount; i++) {
            const n = i / pointCount;
            const travel = dist * n;
            const envelope = Math.pow(Math.sin(Math.PI * n), 1.45);
            const waveA = Math.sin(n * Math.PI * 4.0 + phase * 7.2);
            const waveB = Math.sin(n * Math.PI * 7.5 - phase * 11.0);
            const wave = (waveA * 0.75 + waveB * 0.25) * waveAmp * envelope;
            points.push(new Phaser.Math.Vector2(
                startX + dx * travel + nx * wave,
                startY + dy * travel + ny * wave
            ));
        }

        const drawLayer = (width: number, color: number, alpha: number) => {
            this.lightningGfx.lineStyle(width, color, alpha);
            this.lightningGfx.beginPath();
            this.lightningGfx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                this.lightningGfx.lineTo(points[i].x, points[i].y);
            }
            this.lightningGfx.strokePath();
        };

        const drawPulse = (centerN: number, span: number, width: number, color: number, alpha: number) => {
            const minN = Math.max(0, centerN - span);
            const maxN = Math.min(1, centerN + span);
            this.lightningGfx.lineStyle(width, color, alpha);
            this.lightningGfx.beginPath();
            let started = false;
            for (let i = 0; i < points.length; i++) {
                const n = i / (points.length - 1);
                if (n < minN || n > maxN) continue;
                if (!started) {
                    this.lightningGfx.moveTo(points[i].x, points[i].y);
                    started = true;
                } else {
                    this.lightningGfx.lineTo(points[i].x, points[i].y);
                }
            }
            if (started) this.lightningGfx.strokePath();
        };

        // Layer utama: ungu tipis + biru + putih (lebih rapih seperti contoh)
        drawLayer(15, 0xa15bff, 0.23);
        drawLayer(9, 0x6fdbff, 0.42);
        drawLayer(5, 0xaef3ff, 0.74);
        drawLayer(2.4, 0xffffff, 0.94);

        // Streak yang berjalan di core agar laser terlihat hidup
        const pulseA = (phase * 0.6) % 1;
        const pulseB = (pulseA + 0.38) % 1;
        drawPulse(pulseA, 0.12, 4.6, 0xffffff, 0.95);
        drawPulse(pulseB, 0.09, 3.6, 0x9ceeff, 0.82);

        // Muzzle flash di mulut meriam
        const muzzlePulse = 0.82 + Math.sin(phase * 18) * 0.14;
        this.laserMuzzleGlow.setVisible(true);
        this.laserMuzzleGlow.setPosition(startX + dx * 3, startY + dy * 3);
        this.laserMuzzleGlow.setAlpha(muzzlePulse);
        this.laserMuzzleGlow.setScale(0.55 + Math.sin(phase * 14) * 0.05);

        // Ujung beam sedikit ditarik ke belakang agar tidak ketutup badan ikan
        const tailPoint = points[points.length - 2] || points[points.length - 1];
        const tipPoint = points[points.length - 1];
        const tipAngle = Phaser.Math.Angle.Between(tailPoint.x, tailPoint.y, tipPoint.x, tipPoint.y);
        const impactPoint = {
            x: tipPoint.x - Math.cos(tipAngle) * 8,
            y: tipPoint.y - Math.sin(tipAngle) * 8
        };

        this.laserImpactGlow.setVisible(true);
        this.laserImpactGlow.setPosition(impactPoint.x, impactPoint.y);
        this.laserImpactGlow.setAlpha(0.62 + Math.sin(phase * 16) * 0.12);
        this.laserImpactGlow.setScale(1.22 + Math.sin(phase * 9.5) * 0.08);

        this.laserImpactCore.setVisible(true);
        this.laserImpactCore.setPosition(impactPoint.x, impactPoint.y);
        this.laserImpactCore.setAlpha(0.92 + Math.sin(phase * 17.5) * 0.06);
        this.laserImpactCore.setScale(0.68 + Math.sin(phase * 10.5) * 0.06);
    }

    private autoShootLogic() {
        if (this.isTorpedoMode) return; // Torpedo ditembakkan manual dengan klik

        // Jika Target Mode Aktif, ikuti lockedTarget
        if (this.isTargetMode && this.lockedTarget && this.lockedTarget.active) {
            if (!this.isFishInWarArea(this.lockedTarget)) {
                const replacementTarget = this.findReplacementTargetByType(
                    this.lockedTarget,
                    this.targetCrosshairFocusX || this.lockedTarget.x,
                    this.targetCrosshairFocusY || this.lockedTarget.y
                );
                if (replacementTarget) {
                    this.lockedTarget = replacementTarget;
                } else {
                    this.lockedTarget = null;
                    this.targetCrosshair.setVisible(false);
                    this.hideLaserBeam();
                    this.stopLaserFireSounds();
                    this.updateAutoShootState();
                    return;
                }
            }
            this.shoot(this.lockedTarget.x, this.lockedTarget.y, true);
            return;
        }

        // Jika Auto Mode Aktif
        if (this.isAutoMode) {
            let autoTargetX = this.input.activePointer.x;
            let autoTargetY = this.input.activePointer.y;

            // Filter ikan berdasarkan pilihan di UI Auto Fishing
            const activeFish = this.fishGroup.getChildren().filter((f: any) => {
                const isSelected = this.selectedAutoTargets.size === 0 || this.selectedAutoTargets.has(f.texture.key);
                return f.active && f.x > 0 && f.x < this.cameras.main.width && isSelected;
            });

            if (activeFish.length > 0) {
                // Urutkan berdasarkan score tertinggi (incar yang paling cuan)
                activeFish.sort((a: any, b: any) => b.getData('score') - a.getData('score'));
                const bestFish = activeFish[0] as Phaser.Physics.Arcade.Sprite;
                autoTargetX = bestFish.x;
                autoTargetY = bestFish.y;
            }

            this.shoot(autoTargetX, autoTargetY, false);
        }
    }

    private showAutoFishingUI(bgRect: Phaser.GameObjects.Rectangle) {
        const w = this.cameras.main.width;
        const h = this.cameras.main.height;

        const container = this.add.container(w / 2, h / 2).setDepth(100);
        this.autoFishingUI = container;

        const overlay = this.add.rectangle(0, 0, w, h, 0x000000, 0.6).setInteractive();
        container.add(overlay);

        const panelWidth = 600;
        const panelHeight = 450;
        const panel = this.add.rectangle(0, 0, panelWidth, panelHeight, 0x001133, 0.95).setStrokeStyle(4, 0x0088ff);
        container.add(panel);

        const title = this.add.text(0, -panelHeight / 2 + 30, 'AUTO FISHING SETTINGS', {
            fontFamily: this.uiFontFamily, fontSize: '24px', color: '#00ffff', fontStyle: 'bold'
        }).setOrigin(0.5);
        container.add(title);

        const gridX = -panelWidth / 2 + 60;
        const gridY = -panelHeight / 2 + 100;
        const cols = 5;
        const spacing = 110;

        this.fishConfigs.forEach((config, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const x = gridX + c * spacing;
            const y = gridY + r * 90;

            const fishIcon = this.add.sprite(x, y, config.key).setScale(0.6);
            if (config.key.includes('shark')) fishIcon.setScale(0.3);
            
            const isSelected = this.selectedAutoTargets.has(config.key);
            const check = this.add.circle(x + 25, y + 25, 10, isSelected ? 0x00ff00 : 0x666666).setStrokeStyle(2, 0xffffff);
            
            const btn = this.add.rectangle(x, y, 90, 80, 0, 0.01).setInteractive();
            btn.on('pointerdown', () => {
                this.playUiClick(0.38);
                if (this.selectedAutoTargets.has(config.key)) {
                    this.selectedAutoTargets.delete(config.key);
                    check.setFillStyle(0x666666);
                } else {
                    this.selectedAutoTargets.add(config.key);
                    check.setFillStyle(0x00ff00);
                }
            });

            container.add([fishIcon, check, btn]);
        });

        const btnStyle = { fontFamily: this.uiFontFamily, fontSize: '18px', color: '#fff', fontStyle: 'bold' };
        
        // Select All
        const selectAll = this.add.text(-100, panelHeight / 2 - 40, 'SELECT ALL', btnStyle).setOrigin(0.5).setInteractive();
        selectAll.on('pointerdown', () => {
            this.playUiClick();
            this.fishConfigs.forEach(c => this.selectedAutoTargets.add(c.key));
            container.destroy();
            this.showAutoFishingUI(bgRect); // Refresh UI
        });

        // Confirm
        const confirm = this.add.text(100, panelHeight / 2 - 40, 'CONFIRM', { ...btnStyle, color: '#00ff00' }).setOrigin(0.5).setInteractive();
        confirm.on('pointerdown', () => {
            this.playUiClick();
            this.isAutoMode = true;
            bgRect.setStrokeStyle(6, 0xffffff);
            this.updateAutoShootState();
            container.destroy();
            this.autoFishingUI = null;
        });

        container.add([selectAll, confirm]);
    }

    private spawnRandomFish() {
        const config = this.pickRandomFishConfig();
        if (!config) return;
        this.spawnFish(config);
    }

    private spawnFish1CompanionsForFish8(anchorX: number, anchorY: number, side: 'left' | 'right') {
        const fish1Config = this.fishConfigs.find(c => c.key === 'fish1');
        if (!fish1Config) return;

        const w = this.cameras.main.width;
        const h = this.cameras.main.height;
        const count = Phaser.Math.Between(4, 5);
        const leadX = side === 'left' ? anchorX + 180 : anchorX - 180;

        for (let i = 0; i < count; i++) {
            const offsetX = Phaser.Math.Between(-110, 110);
            const offsetY = Phaser.Math.Between(-150, 150);
            const spawnX = Phaser.Math.Clamp(leadX + offsetX, 40, w - 40);
            const spawnY = Phaser.Math.Clamp(anchorY + offsetY, 120, h - 240);
            this.spawnFish(fish1Config, {
                x: spawnX,
                y: spawnY,
                side,
                disableWave: false
            });
        }
    }

    private spawnFishFromServer(fishData: any) {
        const config = this.fishConfigs.find(c => c.key === fishData.type);
        if (!config) return;

        const side = Math.random() > 0.5 ? 'left' : 'right';
        const x = side === 'left' ? -200 : this.cameras.main.width + 200;
        const desiredY = Phaser.Math.Between(150, this.cameras.main.height - 300);
        let spawnY = desiredY;
        if (this.isRegularSharkType(config.key)) {
            const lane = this.resolveSharkSpawnLane(side, x, desiredY);
            if (!lane.allowed) return;
            spawnY = lane.y;
        }

        const spawnServerFish = () => {
            const textureKey = config.textureKey || config.key;
            if (!this.textures.exists(textureKey)) {
                console.warn(`[Spawn] Texture "${textureKey}" tidak ditemukan untuk ${config.key}. Spawn dilewati.`);
                return;
            }
            const fish = this.fishGroup.create(x, spawnY, textureKey) as Phaser.Physics.Arcade.Sprite;

            const animKey = config.key + '_anim';
            const anim = this.anims.get(animKey);
            if (anim && anim.frames.length > 0) {
                fish.play(animKey);
            }

            fish.setScale(config.scale);
            fish.setData('id', fishData.id);
            fish.setData('hp', fishData.hp);
            fish.setData('score', fishData.score);
            fish.setData('isGoldenShark', config.key === 'sharkjumbo_v2');

            fish.setInteractive();

            const speed = Phaser.Math.Between(config.speed.min, config.speed.max);
            const vx = side === 'left' ? speed : -speed;

            if (config.key === 'sharkjumbo_v2') {
                if (this.isJumboActive) return; // Cukup satu hiu jumbo
                this.isJumboActive = true;

                // Pergerakan Khusus Bolak-Balik 3x untuk Shark Jumbo
                const targetX = side === 'left' ? this.cameras.main.width + 100 : -100;
                this.tweens.add({
                    targets: fish,
                    x: targetX,
                    duration: 10000 / (speed / 10),
                    yoyo: true,
                    repeat: 2,
                    onYoyo: () => { fish.setFlipX(!fish.flipX); },
                    onRepeat: () => { fish.setFlipX(!fish.flipX); },
                    onComplete: () => {
                        this.isJumboActive = false;
                        if (fish.active) {
                            this.destroyFishShadow(fish);
                            fish.destroy();
                            this.refreshGoldenSharkMusic();
                        }
                    }
                });
            } else {
                fish.setVelocityX(vx);
            }

            const movingRight = vx > 0;
            const shouldFlip = (movingRight && !config.facesRightByDefault) || (!movingRight && config.facesRightByDefault);
            fish.setFlipX(shouldFlip);

            if (config.key === 'fish8') {
                this.spawnFish1CompanionsForFish8(fish.x, fish.y, side);
            }

            this.refreshGoldenSharkMusic();

            this.attachSharkShadow(fish);

            // Pergerakan Gelombang (Sinusoidal Curve)
            const waveAmp = Phaser.Math.Between(30, 80);
            const waveDuration = Phaser.Math.Between(1500, 3000);

            this.tweens.add({
                targets: fish,
                y: spawnY + waveAmp,
                duration: waveDuration,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        };

        if (config.key === 'sharkjumbo_v2') {
            const shown = this.showGoldenSharkWarning(spawnServerFish);
            if (!shown) spawnServerFish();
            return;
        }

        spawnServerFish();
    }

    private spawnFish(config: FishConfig, options: SpawnOptions = {}) {
        if (config.key === 'sharkjumbo_v2' && !options.skipWarning) {
            const shown = this.showGoldenSharkWarning(() => {
                this.spawnFish(config, { ...options, skipWarning: true });
            });
            if (shown) return;
        }

        // Cegah lebih dari 1 Shark Jumbo sekaligus
        if (config.key === 'sharkjumbo_v2' && this.isJumboActive) return;

        const side = options.side ?? (Math.random() > 0.5 ? 'left' : 'right');
        const x = options.x ?? (side === 'left' ? -200 : this.cameras.main.width + 200);
        const desiredY = options.y ?? Phaser.Math.Between(150, this.cameras.main.height - 300);
        let spawnY = desiredY;
        if (this.isRegularSharkType(config.key)) {
            const lane = this.resolveSharkSpawnLane(side, x, desiredY);
            if (!lane.allowed) return;
            spawnY = lane.y;
        }

        const textureKey = config.textureKey || config.key;
        if (!this.textures.exists(textureKey)) {
            console.warn(`[Spawn] Texture "${textureKey}" tidak ditemukan untuk ${config.key}. Spawn dilewati.`);
            return;
        }
        const fish = this.add.sprite(x, spawnY, textureKey) as Phaser.Physics.Arcade.Sprite;
        this.physics.add.existing(fish);
        this.fishGroup.add(fish);

        const animKey = config.key + '_anim';
        const anim = this.anims.get(animKey);
        if (anim && anim.frames.length > 0) {
            try {
                fish.play(animKey);
            } catch (e) {
                console.error(`[Animation] Failed to play ${animKey}:`, e);
            }
        }

        fish.setScale(config.scale);
        
        // Atur Hitbox Ikan agar lebih kecil dari gambarnya (Agar peluru terlihat 'masuk' ke tubuh)
        if (fish.body) {
            const body = fish.body as Phaser.Physics.Arcade.Body;
            body.setSize(fish.width * 0.7, fish.height * 0.6);
            body.setOffset(fish.width * 0.15, fish.height * 0.2);
        }
        fish.setData('hp', config.hp * (this.betAmount * 100));
        fish.setData('score', config.score);
        fish.setData('isGoldenShark', config.key === 'sharkjumbo_v2');
        fish.setDepth(15);
        fish.setVisible(true);
        fish.setActive(true);
        fish.setAlpha(1);

        // Buat ikan bisa diklik dan pastikan berada di depan background
        fish.setInteractive();
        fish.setDepth(15);
        
        const speed = Phaser.Math.Between(config.speed.min, config.speed.max);
        const vx = side === 'left' ? speed : -speed;

        if (config.key === 'sharkjumbo_v2') {
            this.isJumboActive = true;
            const targetX = side === 'left' ? this.cameras.main.width + 100 : -100;
            this.tweens.add({
                targets: fish,
                x: targetX,
                duration: 10000 / (speed / 10),
                yoyo: true,
                repeat: 2,
                onYoyo: () => { fish.setFlipX(!fish.flipX); },
                onRepeat: () => { fish.setFlipX(!fish.flipX); },
                onComplete: () => {
                    this.isJumboActive = false;
                    if (fish.active) {
                        this.destroyFishShadow(fish);
                        fish.destroy();
                        this.refreshGoldenSharkMusic();
                    }
                }
            });
        } else {
            if (fish.body) {
                (fish.body as Phaser.Physics.Arcade.Body).setVelocityX(vx);
            }
        }

        const movingRight = vx > 0;
        const shouldFlip = (movingRight && !config.facesRightByDefault) || (!movingRight && config.facesRightByDefault);
        fish.setFlipX(shouldFlip);

        // Golden shark didefinisikan khusus untuk sharkjumbo_v2

        if (config.key === 'fish8') {
            this.spawnFish1CompanionsForFish8(fish.x, fish.y, side);
        }

        this.refreshGoldenSharkMusic();

        this.attachSharkShadow(fish);

        // Pergerakan Gelombang (Sinusoidal Curve)
        if (!options.disableWave) {
            const waveAmp = Phaser.Math.Between(30, 80);
            const waveDuration = Phaser.Math.Between(1500, 3000);

            this.tweens.add({
                targets: fish,
                y: spawnY + waveAmp,
                duration: waveDuration,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }

        // Langsung bekukan jika sedang Frozen
        if (this.isFrozen) {
            if (fish.body) {
                (fish.body as Phaser.Physics.Arcade.Body).moves = false;
            }
            fish.anims.pause();
            this.tweens.getTweensOf(fish).forEach(t => t.pause());
        }
    }

    private shoot(
        targetX: number,
        targetY: number,
        isTargeted: boolean = false,
        torpedoTarget: Phaser.Physics.Arcade.Sprite | null = null
    ) {
        if (this.isTorpedoMode && (!torpedoTarget || !torpedoTarget.active)) {
            return;
        }

        const cost = this.isTorpedoMode ? this.betAmount * 6 : this.betAmount;
        if (this.score < cost) return;

        if (this.isOfflineMode) {
            this.score -= cost;
            this.updateScoreDisplay();
        } else {
            // Kirim tembakan ke server
            let targetId = "";
            if (this.isTorpedoMode && torpedoTarget && torpedoTarget.active) {
                targetId = torpedoTarget.getData('id') || "";
            } else if (this.lockedTarget && this.lockedTarget.active) {
                targetId = this.lockedTarget.getData('id');
            }
            this.socket.emit('shoot', { fishId: targetId, betAmount: cost, isTorpedo: this.isTorpedoMode });
        }

        const cannon = this.playerCannon;
        const angle = Phaser.Math.Angle.Between(cannon.x, cannon.y, targetX, targetY);
        const muzzleOffset = 60; // Geser lebih jauh ke atas (ujung laras)
        const muzzleX = cannon.x + Math.cos(cannon.rotation - Math.PI / 2) * muzzleOffset;
        const muzzleY = cannon.y + Math.sin(cannon.rotation - Math.PI / 2) * muzzleOffset;

        if (this.isTorpedoMode) {
            this.safePlaySound('snd_triple', { volume: 0.3 });
        } else if (isTargeted) {
            this.playLaserFireShotSound();
        } else {
            this.safePlaySound('snd_shoot', { volume: 0.3 });
        }

        if (this.isTorpedoMode) {
            this.fireTorpedo(muzzleX, muzzleY, targetX, targetY, 'local_p1', torpedoTarget);
        } else {
            this.fireSingleBullet(muzzleX, muzzleY, angle, isTargeted, 'local_p1');
        }

        this.tweens.add({ targets: cannon, y: cannon.y + 12, duration: 50, yoyo: true });

        // Efek Api (Muzzle Flash) menggunakan tembakan.png (muzzle)
        const flash = this.add.sprite(muzzleX, muzzleY, 'muzzle').setDepth(41).setRotation(angle);
        flash.setScale(0.2); // Diperbesar kembali sesuai permintaan
        this.tweens.add({ targets: flash, scale: 0.6, alpha: 0, duration: 100, onComplete: () => flash.destroy() });
    }

    private fireTorpedo(
        x: number,
        y: number,
        targetX: number,
        targetY: number,
        ownerId: string,
        torpedoTarget: Phaser.Physics.Arcade.Sprite | null = null
    ) {
        const torpedo = this.physics.add.sprite(x, y, 'torpedo_projectile').setDepth(48);
        torpedo.setScale(0.52);
        torpedo.setData('ownerId', ownerId); // Set ID Pemilik di sini

        // Hitbox Torpedo disesuaikan badan roket
        if (torpedo.body) {
            (torpedo.body as Phaser.Physics.Arcade.Body).setSize(72, 24);
            (torpedo.body as Phaser.Physics.Arcade.Body).setOffset(18, 34);
        }

        this.bullets.add(torpedo);
        torpedo.setData('isTorpedo', true);
        torpedo.setData('torpedoTargetFish', torpedoTarget);
        torpedo.setData('torpedoTargetId', torpedoTarget ? (torpedoTarget.getData('id') || null) : null);
        torpedo.setData('torpedoAimX', targetX);
        torpedo.setData('torpedoAimY', targetY);
        torpedo.setData('torpedoBornAt', this.time.now);

        const flame = this.add.sprite(x, y, 'torpedo_flame')
            .setDepth(47)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(0.62)
            .setAlpha(0.95);
        torpedo.setData('torpedoFlame', flame);

        // Efek Muzzle Flash (Torpedo)
        const flash = this.add.sprite(x, y, 'muzzle').setDepth(42).setScale(0.4).setTint(0xffaa00);
        this.tweens.add({ targets: flash, scale: 1.2, alpha: 0, duration: 150, onComplete: () => flash.destroy() });
        this.safePlaySound('snd_triple', { volume: 0.6 });
        const initialRot = Phaser.Math.Angle.Between(x, y, targetX, targetY);
        torpedo.setRotation(initialRot);
        if (torpedo.body) {
            this.physics.velocityFromRotation(initialRot, 940, (torpedo.body as Phaser.Physics.Arcade.Body).velocity);
        }
    }

    private fireSingleBullet(x: number, y: number, angle: number, isTargeted: boolean, ownerId: string) {
        const bullet = this.bullets.get(x, y) as Phaser.Physics.Arcade.Sprite;
        if (bullet) {
            // Target mode: peluru fisik tetap ada untuk hit-detection, tapi visual disembunyikan
            bullet.setActive(true).setVisible(!isTargeted);
            bullet.setRotation(angle);
            bullet.setData('isTargeted', isTargeted);
            bullet.setData('isTorpedo', false);
            bullet.setData('ownerId', ownerId); // Set ID Pemilik di sini
            bullet.setData('allowBounce', !isTargeted);
            bullet.setData('bounceCount', 0);
            bullet.setData('maxBounceCount', isTargeted ? 0 : 3);

            bullet.setTexture(isTargeted ? 'bullet_laser' : 'bullet');
            bullet.setScale(isTargeted ? 0.3 : 0.3);
            bullet.clearTint();
            if (bullet.body) {
                // Hitbox Peluru dibuat sekecil mungkin agar benar-benar masuk ke tubuh ikan
                const body = bullet.body as Phaser.Physics.Arcade.Body;
                body.setSize(10, 10);
                if (isTargeted) {
                    body.setCollideWorldBounds(false);
                    body.setBounce(0, 0);
                    body.onWorldBounds = false;
                } else {
                    body.setCollideWorldBounds(true, 1, 1, true);
                    body.setBounce(1, 1);
                    body.onWorldBounds = true;
                }
                this.physics.velocityFromRotation(angle, 1200, body.velocity);
            }
        }
    }

    private handleBulletWorldBounds(body: Phaser.Physics.Arcade.Body) {
        const bullet = body.gameObject as Phaser.Physics.Arcade.Sprite | undefined;
        if (!bullet || !bullet.active) return;
        if (!bullet.getData('allowBounce')) return;

        const bounceCount = (bullet.getData('bounceCount') || 0) + 1;
        const maxBounceCount = bullet.getData('maxBounceCount') || 3;
        bullet.setData('bounceCount', bounceCount);
        this.safePlaySound('snd_hit', { volume: 0.12, rate: 1.7 });

        if (bounceCount >= maxBounceCount) {
            this.bullets.killAndHide(bullet);
            if (bullet.body) {
                (bullet.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
            }
        }
    }

    private handleCollision(bullet: Phaser.Physics.Arcade.Sprite, fish: Phaser.Physics.Arcade.Sprite) {
        if (!bullet.active || !fish.active) return;

        const isTorpedoBullet = !!bullet.getData('isTorpedo');
        if (isTorpedoBullet) {
            const targetFish = bullet.getData('torpedoTargetFish') as Phaser.Physics.Arcade.Sprite | null;
            const targetId = bullet.getData('torpedoTargetId');
            if (targetFish && targetFish.active && fish !== targetFish) {
                return;
            }
            if ((!targetFish || !targetFish.active) && targetId && fish.getData('id') && fish.getData('id') !== targetId) {
                return;
            }
        }

        const isTargetedBullet = bullet.getData('isTargeted');
        if (isTargetedBullet && this.lockedTarget && fish !== this.lockedTarget) {
            return; // Tembus ikan lain!
        }

        const ownerId = bullet.getData('ownerId') || 'local_p1';

        // Efek Jaring (Web) muncul tepat menempel pada ikan
        // Buat peluru maju sedikit lagi ke arah ikan agar terlihat "menempel" sebelum meledak
        const angle = Phaser.Math.Angle.Between(bullet.x, bullet.y, fish.x, fish.y);
        bullet.x += Math.cos(angle) * 30;
        bullet.y += Math.sin(angle) * 30;

        // Efek Jaring (Web) muncul tepat menempel pada ikan
        const net = this.add.image(bullet.x, bullet.y, 'web').setDepth(35);
        net.setAlpha(0.7);
        net.setScale(fish.scale * 0.9); // Ukuran jaring menyesuaikan besar ikan
        net.setRotation(Phaser.Math.FloatBetween(-0.5, 0.5));
        this.tweens.add({ targets: net, scale: net.scale * 1.3, alpha: 0, rotation: net.rotation + 0.4, duration: 350, onComplete: () => net.destroy() });

        const flame = bullet.getData('torpedoFlame') as Phaser.GameObjects.Sprite | undefined;
        if (flame && flame.active) flame.destroy();
        this.bullets.killAndHide(bullet);
        if (bullet.body) {
            (bullet.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
        }

        let hp = fish.getData('hp') - 1; // Peluru standar damage 1
        fish.setData('hp', hp);

        // Kompatibilitas Phaser 4: setTintFill sudah dihapus, gunakan setTintMode
        (fish as any).setTint(0xffffff);
        if (typeof (fish as any).setTintMode === 'function') {
            (fish as any).setTintMode((Phaser as any).TintModes ? (Phaser as any).TintModes.FILL : 1);
        }

        this.time.delayedCall(80, () => {
            if (fish.active) {
                fish.clearTint();
                if (fish.getData('isGoldenShark')) {
                    fish.setTint(0xffd84d);
                }
            }
        });

        // Efek Visual Hit (Flash Ledakan Kecil)
        const flash = this.add.circle(bullet.x, bullet.y, 20, 0xffffff, 0.9).setDepth(25);
        this.tweens.add({ targets: flash, scale: 2.5, alpha: 0, duration: 150, onComplete: () => flash.destroy() });

        this.safePlaySound(bullet.getData('isTorpedo') ? 'snd_explosion' : 'snd_hit', { volume: 0.3 });

        if (bullet.getData('isTorpedo')) {
            const exp = this.add.sprite(bullet.x, bullet.y, 'explosion_v2').setDepth(40).setScale(0.5).setTint(0xff8800);
            this.tweens.add({ targets: exp, scale: 2.5, alpha: 0, duration: 400, onComplete: () => exp.destroy() });
            hp -= 10; // Extra damage for torpedo
        } else {
            hp -= 1;
        }
        fish.setData('hp', hp);

        if (hp <= 0) {
            if (this.isOfflineMode) {
                this.killFish(fish, true, ownerId);
            } else {
                // Tunggu konfirmasi server
                fish.setAlpha(0.5);
            }
        }
    }

    private flyCoinToBalance(coin: Phaser.GameObjects.Sprite, targetX: number, targetY: number) {
        const controlX = coin.x + Phaser.Math.Between(-150, 150);
        const controlY = coin.y - Phaser.Math.Between(150, 250);

        const curve = new Phaser.Curves.QuadraticBezier(
            new Phaser.Math.Vector2(coin.x, coin.y),
            new Phaser.Math.Vector2(controlX, controlY),
            new Phaser.Math.Vector2(targetX, targetY)
        );

        const path = { t: 0, vec: new Phaser.Math.Vector2() };
        this.tweens.add({
            targets: path,
            t: 1,
            ease: 'Sine.easeIn',
            duration: 800 + Math.random() * 600,
            onUpdate: () => {
                curve.getPoint(path.t, path.vec);
                coin.x = path.vec.x;
                coin.y = path.vec.y;
            },
            onComplete: () => {
                const now = this.time.now;
                if (now - this.lastCoinEnterSoundAt > 55) {
                    this.safePlaySound('snd_coin_enter', { volume: 0.38 });
                    this.lastCoinEnterSoundAt = now;
                }
                coin.destroy();
            }
        });
    }

    private killFish(fish: Phaser.Physics.Arcade.Sprite, addScore: boolean = true, killerId: string = 'local_p1') {
        // Jika ikan yang mati adalah target yang di-lock, matikan target mode
        if (fish === this.lockedTarget) {
            this.lockedTarget = null;
            this.targetCrosshair.setVisible(false);
            this.updateAutoShootState();
        }

        const betUsed = killerId === 'local_p1' ? this.betAmount : this.dummyBetAmount;
        let baseScore = fish.getData('score') * betUsed * 100;
        let finalScore = baseScore;
        const isGoldenShark = !!fish.getData('isGoldenShark');

        let isJackpot = false;
        let isSuperPrize = false;
        let superPrizeMultiplier = 1;

        // JACKPOT LOGIC (Berdasarkan riset Jackpot Fishing Cocos v2.4.6)
        // Aturan: Jackpot hanya terbuka jika bet mencukupi
        if (isGoldenShark) {
            finalScore = baseScore * 3.5;
        } else if (betUsed >= 5.0 && Math.random() < 0.001) {
            // JILI Jackpot (Paling Tinggi)
            isJackpot = true;
            const jackpotWin = this.jiliJackpot;
            finalScore += jackpotWin;
            this.jiliJackpot = 5000;
            if (killerId === 'local_p1') this.playJackpotAnimation(jackpotWin);
        } else if (betUsed >= 0.8 && Math.random() < 0.005) {
            // Lucky Jackpot
            isJackpot = true;
            const jackpotWin = this.luckyJackpot;
            finalScore += jackpotWin;
            this.luckyJackpot = 400;
            if (killerId === 'local_p1') this.playJackpotAnimation(jackpotWin);
        } else if (betUsed >= 0.2 && Math.random() < 0.01) {
            // Speed Jackpot
            isJackpot = true;
            const jackpotWin = this.speedJackpot;
            finalScore += jackpotWin;
            this.speedJackpot = 80;
            if (killerId === 'local_p1') this.playJackpotAnimation(jackpotWin);
        } else if (fish.getData('score') >= 0.10 && Math.random() < 0.20) {
            // SUPER PRIZE LOGIC (20% chance untuk ikan medium/besar)
            isSuperPrize = true;
            superPrizeMultiplier = Phaser.Math.Between(2, 5); // 2X - 5X multiplier
            finalScore = baseScore * superPrizeMultiplier;
        }

        // Guncangan Layar (Screen Shake) jika bunuh Hiu atau dapet fitur
        if (isGoldenShark) {
            this.cameras.main.shake(650, 0.02);
        } else if (isJackpot || isSuperPrize) {
            this.cameras.main.shake(800, 0.02);
        } else if (fish.texture.key === 'sharkjumbo_v2') {
            this.cameras.main.shake(1000, 0.03); // Jumbo shake!
        }

        const isBigKill = isGoldenShark || isJackpot || isSuperPrize;
        const killedFishKey = fish.texture.key;
        const isRegularSharkKill = killedFishKey === 'shark1' || killedFishKey === 'shark2';
        const isFish8Kill = killedFishKey === 'fish8';
        const deathX = fish.x;
        const deathY = fish.y;

        this.playFishDeathAnimation(fish, isBigKill, () => {
            // Posisi target koin (P1 vs P2)
            // Posisi target koin (P1 vs P2)
            const targetX = killerId === 'local_p1' ? 250 : this.cameras.main.width - 250;
            const targetY = this.cameras.main.height - 45;

            if (addScore) {
                if (killerId === 'local_p1') {
                    this.score += finalScore;
                } else {
                    this.dummyScore += finalScore;
                }
                this.updateScoreDisplay();
            }

            // Simpan ke database offline (localStorage)
            if (this.isOfflineMode && addScore && killerId === 'local_p1') {
                localStorage.setItem('fishGame_balance', this.score.toString());
            }

            // TAMPILKAN SKOR (Floating Text) - Muncul di posisi terakhir ikan mati
            const floatColor = isGoldenShark ? '#ffe067' : (isJackpot ? '#ff00ff' : (isSuperPrize ? '#ffdd00' : '#ffd700'));
            const floatSize = isGoldenShark ? '56px' : (isJackpot ? '64px' : (isSuperPrize ? '48px' : '36px'));
            const floatingText = this.add.text(deathX, deathY, `+${finalScore.toFixed(2)}`, {
                fontFamily: this.uiFontFamily,
                fontSize: floatSize, color: floatColor, fontStyle: 'bold', stroke: '#000', strokeThickness: isGoldenShark || isJackpot || isSuperPrize ? 8 : 4
            }).setOrigin(0.5).setDepth(40).setScale(0);

            this.tweens.add({
                targets: floatingText,
                scale: 1.5,
                y: fish.y - 50,
                duration: 400,
                ease: 'Back.easeOut',
                onComplete: () => {
                    this.tweens.add({
                        targets: floatingText,
                        y: fish.y - 120,
                        alpha: 0,
                        delay: 600,
                        duration: 800,
                        onComplete: () => floatingText.destroy()
                    });
                }
            });

            // Efek Super Prize / Golden Shark Text
            if (isGoldenShark) {
                this.safePlaySound('snd_jackpot', { volume: 0.7, rate: 1.05 });
                const goldenText = this.add.text(deathX, deathY - 96, 'GOLDEN SHARK BONUS!', {
                    fontFamily: this.uiFontFamily,
                    fontSize: '46px', color: '#ffe067', fontStyle: 'bold', stroke: '#8c3b00', strokeThickness: 8
                }).setOrigin(0.5).setDepth(45).setScale(0);

                this.tweens.add({
                    targets: goldenText,
                    scale: 1.15,
                    duration: 380,
                    ease: 'Back.easeOut',
                    onComplete: () => {
                        this.tweens.add({ targets: goldenText, y: goldenText.y - 80, alpha: 0, delay: 900, duration: 650, onComplete: () => goldenText.destroy() });
                    }
                });
            }

            if (isSuperPrize) {
                this.safePlaySound('snd_jackpot', { volume: 0.5 });
            if (isSuperPrize) {
                this.safePlaySound('snd_jackpot', { volume: 0.5 });
                const superText = this.add.text(deathX, deathY - 80, `${superPrizeMultiplier}X Super Prize`, {
                    fontFamily: this.uiFontFamily,
                    fontSize: '52px', color: '#ffdd00', fontStyle: 'bold', stroke: '#ff0000', strokeThickness: 10,
                    shadow: { offsetX: 0, offsetY: 0, color: '#ffaa00', blur: 20, fill: true }
                }).setOrigin(0.5).setDepth(45).setScale(0);

                this.tweens.add({
                    targets: superText,
                    scale: 1.2,
                    duration: 500,
                    ease: 'Back.easeOut',
                    onComplete: () => {
                        this.tweens.add({ targets: superText, y: superText.y - 100, alpha: 0, delay: 1500, duration: 800, onComplete: () => superText.destroy() });
                    }
                });
            }
            }

            // Animasi Koin Terbang
            if (!isJackpot && !isSuperPrize && !isGoldenShark) this.safePlaySound('snd_coin_drop', { volume: 0.6 });

            const coinCount = isGoldenShark
                ? 22
                : (isJackpot || isSuperPrize
                    ? 15
                    : (isFish8Kill
                        ? Phaser.Math.Between(24, 32)
                        : (isRegularSharkKill ? Phaser.Math.Between(14, 18) : 5)));
            for (let i = 0; i < coinCount; i++) {
                const coin = this.add.sprite(deathX, deathY, 'coinAni2');
                coin.play('coin_anim');
                if (isJackpot || isSuperPrize) {
                    coin.setScale(1.5);
                    coin.setDepth(35);

                    const angle = (Math.PI * 2 / coinCount) * i;
                    const radius = Phaser.Math.Between(80, 160);
                    const burstX = deathX + Math.cos(angle) * radius;
                    const burstY = deathY + Math.sin(angle) * radius;

                    this.tweens.add({
                        targets: coin, x: burstX, y: burstY, duration: 400, ease: 'Cubic.easeOut',
                        onComplete: () => this.flyCoinToBalance(coin, targetX, targetY)
                    });
                } else {
                    coin.x += Phaser.Math.Between(-40, 40);
                    coin.y += Phaser.Math.Between(-40, 40);
                    coin.setDepth(35);
                    this.flyCoinToBalance(coin, targetX, targetY);
                }
            }
        });
    }

    private playFishDeathAnimation(fish: Phaser.Physics.Arcade.Sprite, isBigKill: boolean, onComplete: () => void) {
        const isBoss = fish.texture.key === 'sharkjumbo_v2';
        const isElectricFish8 = fish.texture.key === 'fish8';
        const isEliteShark = fish.texture.key === 'shark1' || fish.texture.key === 'shark2';
        const isJumboShark = fish.texture.key === 'sharkjumbo_v2';
        const isGoldenSharkKill = !!fish.getData('isGoldenShark');
        const x = fish.x;
        const y = fish.y;

        // Hentikan pergerakan & animasi dasar
        if (fish.body) {
            (fish.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
            (fish.body as Phaser.Physics.Arcade.Body).moves = false;
        }
        
        this.tweens.getTweensOf(fish).forEach(t => t.stop());

        if (isBoss) {
            // --- ANIMASI BOSS DURASI PANJANG (5-7 DETIK) ---
            const chaosDuration = isJumboShark
                ? Phaser.Math.Between(4000, 7000)
                : (isGoldenSharkKill ? Phaser.Math.Between(3000, 5000) : 4000);
            const totalDuration = chaosDuration + 2400;
            
            // 1. Efek Slow Motion Awal
            this.time.timeScale = 0.2;
            this.time.delayedCall(850, () => { this.time.timeScale = 1.0; });

            // 2. FASE PERJUANGAN (0 - 2s): Shaking & Flashing Intens
            this.tweens.add({
                targets: fish,
                x: x + Phaser.Math.Between(-10, 10),
                y: y + Phaser.Math.Between(-10, 10),
                duration: 50,
                yoyo: true,
                repeat: 40, // 2 detik total
            });

            this.time.addEvent({
                delay: 100,
                callback: () => {
                    if (fish.tintTopLeft === 0xffffff) {
                        fish.clearTint();
                        if (fish.getData('isGoldenShark')) fish.setTint(0xffd84d);
                    } else {
                        fish.setTint(0xffffff);
                    }
                },
                repeat: Math.max(20, Math.floor(chaosDuration / 100))
            });

            if (isJumboShark) {
                // Efek body-rip sebelum hancur (tanpa heartbeat)
                this.tweens.add({
                    targets: fish,
                    angle: fish.flipX ? -8 : 8,
                    alpha: 0.85,
                    duration: 120,
                    yoyo: true,
                    repeat: Math.max(24, Math.floor(chaosDuration / 140)),
                    ease: 'Sine.easeInOut'
                });
            }

            // 3. FASE LEDAKAN BERUNTUN (ramai) hingga akhir chaosDuration
            const blastDelay = isJumboShark ? 170 : 400;
            const blastRepeat = isJumboShark
                ? Math.max(20, Math.floor(chaosDuration / blastDelay))
                : 8;
            this.time.addEvent({
                delay: blastDelay,
                callback: () => {
                    if (!fish.active) return;

                    const burstCount = isJumboShark ? Phaser.Math.Between(2, 4) : 1;
                    for (let n = 0; n < burstCount; n++) {
                        const offsetX = Phaser.Math.Between(-150, 150);
                        const offsetY = Phaser.Math.Between(-90, 90);
                        const useBigBomb = isJumboShark && Math.random() < 0.35;
                        const expKey = useBigBomb ? 'big_bomb' : 'explosion_v2';
                        const startScale = useBigBomb ? Phaser.Math.FloatBetween(0.5, 1.0) : Phaser.Math.FloatBetween(0.45, 0.85);
                        const endScale = useBigBomb ? Phaser.Math.FloatBetween(1.8, 2.8) : Phaser.Math.FloatBetween(1.8, 2.5);
                        const exp = this.add.sprite(fish.x + offsetX, fish.y + offsetY, expKey).setDepth(44).setScale(startScale);

                        this.tweens.add({
                            targets: exp,
                            scale: endScale,
                            alpha: 0,
                            angle: Phaser.Math.Between(-40, 40),
                            duration: Phaser.Math.Between(280, 650),
                            ease: 'Cubic.easeOut',
                            onComplete: () => exp.destroy()
                        });
                    }

                    // Pecahan/spray agar terlihat lebih brutal
                    const shardCount = isJumboShark ? Phaser.Math.Between(8, 16) : 6;
                    for (let i = 0; i < shardCount; i++) {
                        const shard = this.add.circle(
                            fish.x + Phaser.Math.Between(-100, 100),
                            fish.y + Phaser.Math.Between(-70, 70),
                            Phaser.Math.Between(3, 9),
                            Phaser.Math.RND.pick([0xffe9a3, 0xffffff, 0xa8efff]),
                            0.8
                        ).setDepth(45);
                        this.tweens.add({
                            targets: shard,
                            x: shard.x + Phaser.Math.Between(-280, 280),
                            y: shard.y + Phaser.Math.Between(-260, 260),
                            alpha: 0,
                            scale: 0.1,
                            duration: Phaser.Math.Between(420, 900),
                            ease: 'Cubic.easeOut',
                            onComplete: () => shard.destroy()
                        });
                    }

                    this.safePlaySound(Math.random() < 0.4 ? 'snd_explosion' : 'snd_hit', { volume: 0.55, rate: Phaser.Math.FloatBetween(0.55, 0.9) });
                    this.cameras.main.shake(isJumboShark ? 220 : 200, isJumboShark ? 0.015 : 0.01);
                },
                repeat: blastRepeat
            });

            // 4. FASE AKHIR: DISINTEGRASI CAHAYA (setelah fase hancur selesai)
            this.time.delayedCall(chaosDuration, () => {
                if (!fish.active) return;
                
                this.safePlaySound('snd_explosion', { volume: 1.2 });
                this.cameras.main.shake(1000, 0.04);

                // Ledakan Utama
                const mainExp = this.add.sprite(fish.x, fish.y, 'explosion_v2').setDepth(42).setScale(2);
                this.tweens.add({ targets: mainExp, scale: 6, alpha: 0, duration: 1500, onComplete: () => mainExp.destroy() });
                const megaBomb = this.add.sprite(fish.x, fish.y, 'big_bomb').setDepth(43).setScale(1.2).setAlpha(0.95);
                this.tweens.add({ targets: megaBomb, scale: 4.2, alpha: 0, duration: 1200, ease: 'Cubic.easeOut', onComplete: () => megaBomb.destroy() });

                if (isJumboShark) {
                    // Ring-ledakan tambahan di sekitar badan jumbo
                    for (let i = 0; i < 8; i++) {
                        const a = (Math.PI * 2 / 8) * i;
                        const px = fish.x + Math.cos(a) * Phaser.Math.Between(70, 170);
                        const py = fish.y + Math.sin(a) * Phaser.Math.Between(40, 120);
                        const ringExp = this.add.sprite(px, py, 'explosion_v2').setDepth(43).setScale(0.9);
                        this.tweens.add({
                            targets: ringExp,
                            scale: 2.4,
                            alpha: 0,
                            duration: Phaser.Math.Between(500, 900),
                            onComplete: () => ringExp.destroy()
                        });
                    }
                }

                // Rays Efek
                const rays = this.add.graphics().setDepth(55);
                this.tweens.add({
                    targets: rays,
                    alpha: 0,
                    scale: 3,
                    duration: 2500,
                    onUpdate: (tween) => {
                        const t = tween.getValue() || 0;
                        rays.clear();
                        for (let i = 0; i < 24; i++) {
                            const angle = (Math.PI * 2 / 24) * i + t * 2;
                            rays.lineStyle(10, 0xffd700, 0.8 * (1-t));
                            rays.lineBetween(fish.x, fish.y, fish.x + Math.cos(angle) * 500, fish.y + Math.sin(angle) * 500);
                        }
                    },
                    onComplete: () => rays.destroy()
                });

                // Ikan menghilang perlahan sambil membesar
                this.tweens.add({
                    targets: fish,
                    scale: fish.scale * 2.5,
                    alpha: 0,
                    angle: fish.flipX ? -360 : 360,
                    duration: 2000,
                    ease: 'Cubic.easeIn',
                    onComplete: () => {
                        if (isJumboShark) this.isJumboActive = false;
                        this.destroyFishShadow(fish);
                        fish.destroy();
                        this.refreshGoldenSharkMusic();
                        onComplete(); // Panggil callback untuk reward
                    }
                });
            });

            // Particle burst awal
            const emitter = this.add.particles(x, y, 'bubble', {
                speed: { min: 100, max: 500 },
                scale: { start: 1, end: 0 },
                alpha: { start: 1, end: 0 },
                lifespan: 2000,
                quantity: 100,
                blendMode: 'ADD',
                emitting: false
            });
            emitter.explode();
            this.time.delayedCall(totalDuration, () => emitter.destroy());

        } else if (isElectricFish8) {
            // --- ANIMASI KHUSUS FISH8: balon listrik biru antar fish1 (4-5 ikan) ---
            const fish1Targets = this.fishGroup.getChildren()
                .filter((f: any) =>
                    f !== fish &&
                    f.active &&
                    f.texture &&
                    f.texture.key === 'fish1' &&
                    Phaser.Math.Distance.Between(fish.x, fish.y, f.x, f.y) <= 380
                )
                .sort((a: any, b: any) =>
                    Phaser.Math.Distance.Between(fish.x, fish.y, a.x, a.y) -
                    Phaser.Math.Distance.Between(fish.x, fish.y, b.x, b.y)
                ) as Phaser.Physics.Arcade.Sprite[];

            const maxShock = Phaser.Math.Between(4, 5);
            const shockedTargets = fish1Targets.slice(0, maxShock);
            const electricDuration = shockedTargets.length > 0
                ? Phaser.Math.Between(2200, 3000)
                : 1200;
            const electricGfx = this.add.graphics().setDepth(46).setBlendMode(Phaser.BlendModes.ADD);
            const bubbleWraps: Phaser.GameObjects.Ellipse[] = [];
            const chainStartAt = this.time.now;

            this.tweens.add({
                targets: fish,
                scaleX: fish.scaleX * 1.1,
                scaleY: fish.scaleY * 1.1,
                duration: 170,
                yoyo: true,
                repeat: Math.max(12, Math.floor(electricDuration / 180)),
                ease: 'Sine.easeInOut'
            });

            // Bungkus fish1 dengan balon biru transparan
            for (const t of shockedTargets) {
                if (!t.active) continue;
                if (t.body) {
                    (t.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
                    (t.body as Phaser.Physics.Arcade.Body).moves = false;
                }
                t.anims.pause();
                this.tweens.getTweensOf(t).forEach(tw => tw.pause());

                const wrap = this.add.ellipse(
                    t.x, t.y,
                    Math.max(44, t.displayWidth * 1.3),
                    Math.max(36, t.displayHeight * 1.25),
                    0x4ec7ff,
                    0.14
                ).setDepth(45);
                wrap.setStrokeStyle(1.5, 0x8fdcff, 0.7);
                wrap.setBlendMode(Phaser.BlendModes.ADD);
                bubbleWraps.push(wrap);

                this.tweens.add({
                    targets: wrap,
                    scaleX: 1.06,
                    scaleY: 1.06,
                    alpha: 0.24,
                    duration: 220,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
            }

            this.safePlaySound('snd_laser_fire_loop', { volume: 0.32, rate: 1.0 });
            const shockSoundEvent = this.time.addEvent({
                delay: 380,
                loop: true,
                callback: () => {
                    this.safePlaySound('snd_laser_fire_loop', {
                        volume: 0.24,
                        rate: Phaser.Math.FloatBetween(0.98, 1.06)
                    });
                }
            });

            const arcEvent = this.time.addEvent({
                delay: 70,
                loop: true,
                callback: () => {
                    if (!fish.active) return;
                    electricGfx.clear();
                    // Update posisi balon agar menempel ke fish1
                    for (let i = bubbleWraps.length - 1; i >= 0; i--) {
                        const wrap = bubbleWraps[i];
                        const target = shockedTargets[i];
                        if (!wrap.active || !target || !target.active) continue;
                        wrap.setPosition(target.x, target.y);
                    }

                    if (shockedTargets.length >= 2) {
                        const elapsed = this.time.now - chainStartAt;
                        const progress = Phaser.Math.Clamp(elapsed / electricDuration, 0, 1);
                        const activeLinks = Math.max(1, Math.floor(progress * (shockedTargets.length - 1)) + 1);

                        for (let i = 0; i < Math.min(activeLinks, shockedTargets.length - 1); i++) {
                            const a = shockedTargets[i];
                            const b = shockedTargets[i + 1];
                            if (!a.active || !b.active) continue;

                            const midX = (a.x + b.x) * 0.5 + Phaser.Math.Between(-14, 14);
                            const midY = (a.y + b.y) * 0.5 + Phaser.Math.Between(-14, 14);
                            electricGfx.lineStyle(1.6, 0x4f8fff, 0.48);
                            electricGfx.beginPath();
                            electricGfx.moveTo(a.x, a.y);
                            const steps = 9;
                            for (let s = 1; s <= steps; s++) {
                                const p = s / steps;
                                const oneMinus = 1 - p;
                                const bx = (oneMinus * oneMinus * a.x) + (2 * oneMinus * p * midX) + (p * p * b.x);
                                const by = (oneMinus * oneMinus * a.y) + (2 * oneMinus * p * midY) + (p * p * b.y);
                                electricGfx.lineTo(bx, by);
                            }
                            electricGfx.strokePath();

                            electricGfx.lineStyle(0.8, 0xc8f5ff, 0.9);
                            electricGfx.beginPath();
                            electricGfx.moveTo(a.x, a.y);
                            const midX2 = midX + Phaser.Math.Between(-5, 5);
                            const midY2 = midY + Phaser.Math.Between(-5, 5);
                            for (let s = 1; s <= steps; s++) {
                                const p = s / steps;
                                const oneMinus = 1 - p;
                                const bx = (oneMinus * oneMinus * a.x) + (2 * oneMinus * p * midX2) + (p * p * b.x);
                                const by = (oneMinus * oneMinus * a.y) + (2 * oneMinus * p * midY2) + (p * p * b.y);
                                electricGfx.lineTo(bx, by);
                            }
                            electricGfx.strokePath();
                        }

                        for (const t of shockedTargets) {
                            if (!t.active) continue;
                            t.setTint(Phaser.Math.RND.pick([0xc7f0ff, 0xa7e3ff, 0xdaf8ff]));
                        }
                    }
                }
            });

            this.time.delayedCall(electricDuration, () => {
                if (!fish.active) return;
                arcEvent.remove(false);
                shockSoundEvent.remove(false);
                electricGfx.clear();
                bubbleWraps.forEach(w => { if (w.active) w.destroy(); });

                for (const t of shockedTargets) {
                    if (!t.active) continue;
                    const ex = this.add.sprite(t.x, t.y, 'explosion_v2').setDepth(45).setScale(0.7);
                    this.tweens.add({ targets: ex, scale: 2.1, alpha: 0, duration: 520, onComplete: () => ex.destroy() });
                }

                this.safePlaySound('snd_explosion', { volume: 0.92 });
                this.cameras.main.shake(450, 0.012);

                for (const t of shockedTargets) {
                    if (!t.active) continue;
                    t.clearTint();
                    this.destroyFishShadow(t);
                    t.destroy();
                }

                const finalBurst = this.add.sprite(fish.x, fish.y, 'big_bomb').setDepth(47).setScale(1.8).setAlpha(0.98);
                this.tweens.add({
                    targets: finalBurst,
                    scale: 5.2,
                    alpha: 0,
                    duration: 820,
                    ease: 'Cubic.easeOut',
                    onComplete: () => finalBurst.destroy()
                });

                this.tweens.add({
                    targets: fish,
                    scale: fish.scale * 2.35,
                    alpha: 0,
                    duration: 820,
                    ease: 'Cubic.easeIn',
                    onComplete: () => {
                        fish.clearTint();
                        this.destroyFishShadow(fish);
                        fish.destroy();
                        electricGfx.destroy();
                        bubbleWraps.forEach(w => { if (w.active) w.destroy(); });
                        this.refreshGoldenSharkMusic();
                        onComplete();
                    }
                });
            });
        } else if (isEliteShark) {
            // --- ANIMASI KHUSUS SHARK1/SHARK2 (4-5 DETIK) ---
            const sharkDeathDuration = Phaser.Math.Between(4000, 5000);

            this.tweens.add({
                targets: fish,
                angle: fish.flipX ? -7 : 7,
                x: x + Phaser.Math.Between(-8, 8),
                y: y + Phaser.Math.Between(-8, 8),
                duration: 110,
                yoyo: true,
                repeat: Math.max(18, Math.floor(sharkDeathDuration / 120)),
                ease: 'Sine.easeInOut'
            });

            this.time.addEvent({
                delay: 240,
                callback: () => {
                    if (!fish.active) return;
                    const ex = this.add.sprite(
                        fish.x + Phaser.Math.Between(-75, 75),
                        fish.y + Phaser.Math.Between(-50, 50),
                        'explosion_v2'
                    ).setDepth(43).setScale(Phaser.Math.FloatBetween(0.5, 0.9));
                    this.tweens.add({
                        targets: ex,
                        scale: Phaser.Math.FloatBetween(1.8, 2.6),
                        alpha: 0,
                        duration: Phaser.Math.Between(320, 560),
                        ease: 'Cubic.easeOut',
                        onComplete: () => ex.destroy()
                    });
                    this.safePlaySound(Math.random() < 0.5 ? 'snd_hit' : 'snd_explosion', {
                        volume: 0.38,
                        rate: Phaser.Math.FloatBetween(0.8, 1.05)
                    });
                    this.cameras.main.shake(120, 0.004);
                },
                repeat: Math.max(10, Math.floor(sharkDeathDuration / 240))
            });

            this.time.delayedCall(sharkDeathDuration - 900, () => {
                if (!fish.active) return;
                this.safePlaySound('snd_explosion', { volume: 0.85 });
                const finalExp = this.add.sprite(fish.x, fish.y, 'big_bomb').setDepth(44).setScale(0.9).setAlpha(0.95);
                this.tweens.add({
                    targets: finalExp,
                    scale: 2.8,
                    alpha: 0,
                    duration: 850,
                    ease: 'Cubic.easeOut',
                    onComplete: () => finalExp.destroy()
                });

                this.tweens.add({
                    targets: fish,
                    scale: fish.scale * 1.55,
                    alpha: 0,
                    angle: fish.flipX ? -180 : 180,
                    duration: 900,
                    ease: 'Cubic.easeIn',
                    onComplete: () => {
                        this.destroyFishShadow(fish);
                        fish.destroy();
                        this.refreshGoldenSharkMusic();
                        onComplete();
                    }
                });
            });
        } else {
            // --- ANIMASI IKAN BIASA (CEPAT) ---
            fish.setTint(0xffffff);
            
            this.add.particles(x, y, 'bubble', {
                speed: { min: 50, max: 200 },
                scale: { start: 0.8, end: 0 },
                alpha: { start: 1, end: 0 },
                lifespan: 800,
                quantity: 15,
                blendMode: 'ADD',
                emitting: false
            }).explode();

            this.tweens.add({
                targets: fish,
                y: y - 30,
                angle: 180,
                alpha: 0,
                duration: 600,
                ease: 'Power2.easeOut',
                onComplete: () => {
                    if (isJumboShark) this.isJumboActive = false;
                    this.destroyFishShadow(fish);
                    fish.destroy();
                    this.refreshGoldenSharkMusic();
                    onComplete(); // Panggil callback untuk reward
                }
            });
            
            if (isBigKill) {
                this.createBigBombEffect(x, y);
            }
        }
    }


    private createBigBombEffect(x: number, y: number) {
        const explosion = this.add.sprite(x, y, 'big_bomb').setDepth(60).setScale(0.5);
        this.tweens.add({
            targets: explosion,
            scale: 3,
            alpha: 0,
            duration: 800,
            ease: 'Cubic.easeOut',
            onComplete: () => explosion.destroy()
        });

        // Particle burst
        this.add.particles(x, y, 'bubble', {
            speed: { min: 100, max: 300 },
            scale: { start: 1, end: 0 },
            alpha: { start: 1, end: 0 },
            lifespan: 1000,
            quantity: 30,
            blendMode: 'ADD',
            emitting: false
        }).explode();

        this.cameras.main.shake(300, 0.01);
        this.safePlaySound('snd_explosion', { volume: 0.8 });
    }

    private playJackpotAnimation(amount: number) {
        this.safePlaySound('snd_jackpot', { volume: 1.0 });

        const cx = this.cameras.main.centerX;
        const cy = this.cameras.main.centerY;

        // Overlay gelap
        const bg = this.add.graphics().setDepth(90);
        bg.fillStyle(0x000000, 0.7);
        bg.fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);

        // Teks GRAND JACKPOT
        const title = this.add.text(cx, cy - 100, 'GRAND JACKPOT!!!', {
            fontFamily: this.uiFontFamily,
            fontSize: '80px', color: '#ffea00', fontStyle: 'bold', stroke: '#ff0000', strokeThickness: 10,
            shadow: { offsetX: 0, offsetY: 0, color: '#ffea00', blur: 20, fill: true }
        }).setOrigin(0.5).setDepth(91).setScale(0);

        // Nominal
        const amountText = this.add.text(cx, cy + 50, amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), {
            fontFamily: this.uiFontFamily,
            fontSize: '100px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 12,
            shadow: { offsetX: 0, offsetY: 0, color: '#ffffff', blur: 30, fill: true }
        }).setOrigin(0.5).setDepth(91).setScale(0);

        // Animasi Tampil membesar
        this.tweens.add({
            targets: [title, amountText],
            scale: 1,
            duration: 800,
            ease: 'Back.easeOut'
        });

        // Efek putaran cahaya di belakang teks
        const glow = this.add.circle(cx, cy, 300, 0xffaa00, 0.5).setDepth(90);
        this.tweens.add({
            targets: glow,
            scale: 1.5,
            alpha: 0,
            duration: 1000,
            yoyo: true,
            repeat: 3
        });

        // Hancurkan setelah 4 detik
        this.time.delayedCall(4000, () => {
            this.tweens.add({
                targets: [title, amountText, glow, bg],
                alpha: 0,
                duration: 500,
                onComplete: () => {
                    title.destroy();
                    amountText.destroy();
                    glow.destroy();
                    bg.destroy();
                }
            });
        });
    }

    private activateFrozenSkill(_isGlobal: boolean = false) {
        this.isFrozen = true;

        // Efek Visual: Overlay Layar Biru Beku
        const freezeBg = this.add.rectangle(0, 0, this.cameras.main.width, this.cameras.main.height, 0x00aaff, 0).setOrigin(0).setDepth(45);
        this.tweens.add({
            targets: freezeBg,
            alpha: 0.35,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        this.cameras.main.shake(300, 0.01);
        this.safePlaySound('snd_hit', { volume: 0.5 }); // Suara es pecah

        // Hentikan pergerakan semua ikan
        this.fishGroup.getChildren().forEach((f: any) => {
            if (f.active) {
                f.body.moves = false;
                f.anims.pause();
                this.tweens.getTweensOf(f).forEach(t => t.pause());
            }
        });

        // Durasi Frozen 10 detik
        this.time.delayedCall(10000, () => {
            this.isFrozen = false;
            freezeBg.destroy();
            // Kembalikan pergerakan ikan
            this.fishGroup.getChildren().forEach((f: any) => {
                if (f.active) {
                    f.body.moves = true;
                    f.anims.resume();
                    this.tweens.getTweensOf(f).forEach(t => t.resume());
                }
            });
        });
    }

    private updateScoreDisplay() {
        if (this.scoreText) this.scoreText.setText(this.score.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        if (this.betText) this.betText.setText(this.betAmount.toFixed(2));
        
        if (this.dummyScoreText) this.dummyScoreText.setText(this.dummyScore.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        if (this.dummyBetText) this.dummyBetText.setText(this.dummyBetAmount.toFixed(2));
        this.updateSkillCosts();
    }
}
