import * as Phaser from 'phaser';
import Fish from '../entities/Fish';
import GameUI from '../ui/GameUI';
import Bullet from '../entities/Bullet';
import NetworkManager from '../network/NetworkManager';
import { 
    FISH_CONFIGS, 
    SCENE_PHASES, 
    UI_FONT_FAMILY, 
    DEFAULT_BET, 
    SOCKET_SERVER_URL,
    GOLDEN_SHARK_COOLDOWN,
    type FishConfig, 
    type ScenePhaseConfig,
    type SpawnPatternMode,
    type SpawnOptions
} from '../config';

export default class MainGame extends Phaser.Scene {
    public playerCannon!: Phaser.GameObjects.Sprite;
    public bullets!: Phaser.Physics.Arcade.Group;
    public fishGroup!: Phaser.Physics.Arcade.Group;
    public ui!: GameUI;
    public network!: NetworkManager;
    public score: number = 0;
    public betAmount: number = DEFAULT_BET;
    public isOfflineMode: boolean = false;
    public isFrozen: boolean = false;
    public mySeatIndex: number = -1;
    public seatScores: number[] = [0, 0, 0];
    public seats: any[] = [null, null, null];
    public cannons: (Phaser.GameObjects.Sprite | null)[] = [];
    public isTargetMode: boolean = false;
    public isAutoMode: boolean = false;
    public isTorpedoMode: boolean = false;
    public lockedTarget: Fish | null = null;
    public targetCrosshair!: Phaser.GameObjects.Graphics;
    public autoShootEvent!: Phaser.Time.TimerEvent;
    public shootTimer: Phaser.Time.TimerEvent | null = null;
    private selectedAutoTargets: Set<string> = new Set();
    private targetCrosshairFocusX: number = 0;
    private targetCrosshairFocusY: number = 0;
    private currentStageName: string = "Ocean Reef";
    private autoFishingUI: Phaser.GameObjects.Container | null = null;
    public lightningGfx!: Phaser.GameObjects.Graphics;
    public laserBeamSegments: Phaser.GameObjects.Sprite[] = [];
    public laserImpactGlow!: Phaser.GameObjects.Sprite;
    public laserImpactCore!: Phaser.GameObjects.Sprite;
    public laserMuzzleGlow!: Phaser.GameObjects.Sprite;
    private lastGoldenSharkSpawnedAt: number = 0;
    private isJumboActive: boolean = false;
    private speedJackpot: number = 56.06;
    private jiliJackpot: number = 6157.65;
    private luckyJackpot: number = 463.17;
    private lastLaserFireShotAt: number = 0;
    private lastCoinEnterSoundAt: number = 0;
    private dummyBetAmount: number = DEFAULT_BET;

    private currentScenePhaseIndex: number = 0;
    private isSceneTransitioning: boolean = false;
    private lastGoldenMusicCheckAt: number = 0;
    private bgmSound: Phaser.Sound.BaseSound | null = null;
    private goldenSharkBgmSound: Phaser.Sound.BaseSound | null = null;
    private laserLoopSound: Phaser.Sound.BaseSound | null = null;
    private laserLoopStartDelay: Phaser.Time.TimerEvent | null = null;

    private targetBtnBg!: Phaser.GameObjects.Shape;
    private torpedoBtnBg!: Phaser.GameObjects.Shape;
    private energy: number = 0;
    private electricThreshold: number = 100;
    private energyBar!: Phaser.GameObjects.Graphics;
    private energyBtn: Phaser.GameObjects.Container | null = null;
    private backgroundImage!: Phaser.GameObjects.Image;
    private backgroundOverlay!: Phaser.GameObjects.Rectangle;
    private ambientLights: Phaser.GameObjects.Ellipse[] = [];
    private seaweedPatches: Phaser.GameObjects.Graphics[] = [];
    private spawnTimer?: Phaser.Time.TimerEvent;
    private scenePhaseTimer?: Phaser.Time.TimerEvent;
    private isGoldenWarningActive: boolean = false;
    private lastGoldenSharkWarningTime: number = -99999;
    private formationWaveStep: number = 0;
    private zigzagWaveStep: number = 0;
    private sideMenuUI: Phaser.GameObjects.Container | null = null;
    private isSideMenuOpen: boolean = false;

    private costTorpedoText!: Phaser.GameObjects.Text;
    private costFrozenText!: Phaser.GameObjects.Text;
    private networkStatusText!: Phaser.GameObjects.Text;
    private hasReceivedInitGame: boolean = false;
    private pendingServerBetAmount: number = 0;
    private activeLocalTorpedoTargetCounts: Map<string, number> = new Map();
    private deferredLocalTorpedoKills: Map<string, any> = new Map();

    private safePlaySound(key: string, config?: any) {
        if (this.isTargetMode && key === 'snd_hit') {
            return;
        }
        if (this.cache.audio.exists(key)) {
            this.sound.play(key, config);
        } else if (this.cache.audio.exists('snd_shoot')) {
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

    private isGoldenSharkMusicFish(fish: any): boolean {
        return !!fish && !!fish.active && (fish instanceof Fish) && fish.isGoldenShark;
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
        if (this.isJumboActive) return false;
        const now = this.time.now;
        if (now - this.lastGoldenSharkSpawnedAt < GOLDEN_SHARK_COOLDOWN) return false;
        return true;
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


    public toggleTargetMode() {
        this.playUiClick();
        this.isTargetMode = !this.isTargetMode;
        if (this.ui.targetBtnBg) {
            this.ui.targetBtnBg.setStrokeStyle(this.isTargetMode ? 6 : 3, this.isTargetMode ? 0xffffff : 0x0088ff);
        }
        if (!this.isTargetMode) {
            this.stopLaserFireSounds();
        }
        this.updateAutoShootState();
    }

    public toggleAutoMode() {
        this.playUiClick();
        this.isAutoMode = !this.isAutoMode;
        if (this.ui.autoBtnBg) {
            this.ui.autoBtnBg.setStrokeStyle(this.isAutoMode ? 6 : 3, this.isAutoMode ? 0xffffff : 0x0088ff);
        }
        this.updateAutoShootState();
    }

    public toggleTorpedoMode() {
        this.isTorpedoMode = !this.isTorpedoMode;
        if (this.ui.torpedoBtnBg) {
            this.ui.torpedoBtnBg.setStrokeStyle(this.isTorpedoMode ? 6 : 2, this.isTorpedoMode ? 0xffffff : 0xff8800);
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

    private updateLocalCannonByBet() {
        if (!this.playerCannon) return;
        const cannonKey = this.getCannonKey();
        if (this.playerCannon.texture.key !== cannonKey) {
            this.playerCannon.setTexture(cannonKey, 0);
        }
    }

    public increaseBet() {
        this.adjustBetByStep(1);
    }

    public decreaseBet() {
        this.adjustBetByStep(-1);
    }

    private adjustBetByStep(direction: 1 | -1) {
        const STEP = 0.1;
        const MIN_BET = 0.1;
        const MAX_BET = 5.0;
        const current = Math.round(this.betAmount * 100);
        const stepped = current + (direction * Math.round(STEP * 100));
        const clamped = Phaser.Math.Clamp(stepped, Math.round(MIN_BET * 100), Math.round(MAX_BET * 100));
        const nextBet = clamped / 100;
        if (Math.abs(nextBet - this.betAmount) < 0.0001) return;
        this.betAmount = nextBet;
        this.playUiClick(0.42);
        this.updateLocalCannonByBet();
        this.updateScoreDisplay();
    }

    constructor() {
        super('MainGame');
    }

    create() {
        this.setupDynamicBackground();
        
        const jumboTex = this.textures.get('sharkjumbo_v2');
        if (jumboTex) {
            const totalW = jumboTex.getSourceImage().width;
            const totalH = jumboTex.getSourceImage().height;
            const frameW = totalW;
            const frameH = totalH / 8;
            for (let r = 0; r < 8; r++) {
                jumboTex.add(`sj_${r}_0`, 0, 0, r * frameH, frameW, frameH);
            }
        }

        this.playNormalBgm();

        const bubbleGraphics = this.add.graphics();
        bubbleGraphics.fillStyle(0xffffff, 0.3);
        bubbleGraphics.fillCircle(10, 10, 10);
        bubbleGraphics.lineStyle(2, 0xffffff, 0.5);
        bubbleGraphics.strokeCircle(10, 10, 10);
        bubbleGraphics.fillStyle(0xffffff, 0.6);
        bubbleGraphics.fillCircle(6, 6, 3);
        bubbleGraphics.generateTexture('bubble', 20, 20);
        bubbleGraphics.destroy();

        if (!this.textures.exists('torpedo_projectile')) {
            const tg = this.add.graphics();
            tg.fillStyle(0x0f63de, 1);
            tg.fillRoundedRect(26, 24, 124, 44, 22);
            tg.fillStyle(0x43d6ff, 0.92);
            tg.fillRoundedRect(40, 31, 76, 14, 7);
            tg.lineStyle(4, 0x174f98, 0.95);
            tg.strokeRoundedRect(26, 24, 124, 44, 22);
            tg.lineStyle(3, 0x2c7cff, 0.9);
            tg.strokeLineShape(new Phaser.Geom.Line(86, 24, 86, 68));
            tg.fillStyle(0xd2d9e3, 1);
            tg.fillTriangle(150, 24, 214, 46, 150, 68);
            tg.fillStyle(0x9ca8b8, 0.9);
            tg.fillTriangle(157, 31, 200, 46, 157, 61);
            tg.fillStyle(0x68caff, 0.85);
            tg.fillCircle(166, 46, 6);
            tg.fillStyle(0xf1f4f8, 1);
            tg.fillTriangle(78, 24, 58, 4, 104, 24);
            tg.fillTriangle(78, 68, 58, 88, 104, 68);
            tg.fillStyle(0xc6ced9, 1);
            tg.fillTriangle(70, 24, 58, 11, 92, 24);
            tg.fillTriangle(70, 68, 58, 81, 92, 68);
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

        this.targetCrosshair = this.add.graphics().setDepth(50);
        this.targetCrosshair.setVisible(false);

        this.lightningGfx = this.add.graphics().setDepth(25);
        this.lightningGfx.setBlendMode(Phaser.BlendModes.ADD);

        this.bullets = this.physics.add.group({ defaultKey: 'bullet', maxSize: 50 });
        this.fishGroup = this.physics.add.group();

        this.ui = new GameUI(this);
        this.ui.setup();
        this.setupCannon();
        this.setupElectricCannonUI();
        this.setupNetworkStatusText();
        this.updateScoreDisplay();
        this.updateJackpotDisplay();

        if (this.isOfflineMode) {
            const savedBalance = localStorage.getItem('fishGame_balance');
            this.score = savedBalance ? parseFloat(savedBalance) : 2000;
            this.updateScoreDisplay();

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
            this.network = new NetworkManager(this);
            this.network.connect(SOCKET_SERVER_URL);
        }

        this.laserBeamSegments = [];
        this.laserImpactGlow = this.add.sprite(0, 0, 'laser_impact_soft')
            .setDepth(220)
            .setVisible(false);
        this.laserImpactGlow.setBlendMode(Phaser.BlendModes.ADD);
        this.laserImpactGlow.setScale(1.0);
        this.laserImpactCore = this.add.sprite(0, 0, 'laser_impact_soft')
            .setDepth(221)
            .setVisible(false);
        this.laserImpactCore.setBlendMode(Phaser.BlendModes.ADD);
        this.laserImpactCore.setTint(0x8adfff);
        this.laserImpactCore.setScale(0.56);
        this.laserMuzzleGlow = this.add.sprite(0, 0, 'laser_impact_soft')
            .setDepth(210)
            .setVisible(false);
        this.laserMuzzleGlow.setBlendMode(Phaser.BlendModes.ADD);
        this.laserMuzzleGlow.setTint(0xc5f2ff);
        this.laserMuzzleGlow.setScale(0.5);

        this.startScenePhaseCycle();
        FISH_CONFIGS.forEach(config => {
            if (config.key === 'sharkjumbo_v2') return;

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
        if (this.textures.exists('torpedo_projectile_custom') && !this.anims.exists('torpedo_projectile_spin')) {
            this.anims.create({
                key: 'torpedo_projectile_spin',
                frames: this.anims.generateFrameNumbers('torpedo_projectile_custom', { start: 0, end: 4 }),
                frameRate: 18,
                repeat: -1
            });
        }
        if (this.textures.exists('torpedo_explosion_custom') && !this.anims.exists('torpedo_explosion_burst')) {
            this.anims.create({
                key: 'torpedo_explosion_burst',
                frames: this.anims.generateFrameNumbers('torpedo_explosion_custom', { start: 0, end: 4 }),
                frameRate: 20,
                repeat: 0
            });
        }
        this.autoShootEvent = this.time.addEvent({
            delay: 300,
            callback: this.autoShootLogic,
            callbackScope: this,
            loop: true,
            paused: true
        });
        this.input.on('gameobjectdown', (_pointer: any, gameObject: any) => {
            if (this.isTargetMode && this.fishGroup.contains(gameObject)) {
                this.lockedTarget = gameObject;
                this.updateAutoShootState();
            }
        });

        this.physics.add.overlap(this.bullets, this.fishGroup, this.handleCollision as any, undefined, this);
        this.physics.world.on('worldbounds', this.handleBulletWorldBounds, this);
        
        this.scale.on('resize', this.handleResize, this);
        this.handleResize();

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.physics.world.off('worldbounds', this.handleBulletWorldBounds, this);
            this.scale.off('resize', this.handleResize, this);
            this.stopLaserFireSounds();
            this.stopAllBgmTracks();
        });
    }

    private handleResize() {
        const w = this.scale.width;
        const h = this.scale.height;

        this.cameras.main.setViewport(0, 0, w, h);

        if (this.backgroundImage) {
            this.backgroundImage.setPosition(w / 2, h / 2);
            const scaleX = w / this.backgroundImage.width;
            const scaleY = h / this.backgroundImage.height;
            const scale = Math.max(scaleX, scaleY);
            this.backgroundImage.setScale(scale);
        }

        if (this.backgroundOverlay) {
            this.backgroundOverlay.setPosition(w / 2, h / 2);
            this.backgroundOverlay.setSize(w, h);
        }
    }

    private toggleFullscreen() {
        if (this.scale.isFullscreen) {
            this.scale.stopFullscreen();
        } else {
            this.scale.startFullscreen();
        }
    }

    private setupNetworkStatusText() {
        if (this.isOfflineMode) return;

        this.networkStatusText = this.add.text(this.cameras.main.centerX, 92, 'Connecting to server...', {
            fontFamily: UI_FONT_FAMILY,
            fontSize: '20px',
            color: '#ffdf7b',
            fontStyle: 'bold',
            stroke: '#00122a',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(500);
    }

    private setNetworkStatusText(message: string, visible: boolean = true) {
        if (!this.networkStatusText) return;
        this.networkStatusText.setText(message);
        this.networkStatusText.setVisible(visible);
    }


    private setupCannon() {
        const w = this.cameras.main.width;
        const h = this.cameras.main.height;

        this.cannons = [null, null, null];

        const seatPos = [
            { x: 250, y: h - 55 },
            { x: w / 2, y: h - 55 },
            { x: w - 250, y: h - 55 }
        ];

        for (let i = 0; i < seatPos.length; i++) {
            const pos = seatPos[i];
            const cannon = this.add.sprite(pos.x, pos.y, 'cannon1');
            cannon.setName(`seat_cannon_${i}`);
            cannon.setData('baseY', pos.y);
            cannon.setOrigin(0.5, 0.6);
            cannon.setScale(1.4);
            cannon.setDepth(20);
            cannon.setRotation(0);
            this.cannons[i] = cannon;
        }
        
        this.playerCannon = this.cannons[0] as Phaser.GameObjects.Sprite;
        this.updateLocalCannonByBet();

        if (!this.isOfflineMode) {
            this.cannons.forEach((cannon, index) => {
                if (cannon) cannon.setVisible(index === 0);
            });
        }

        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, currentlyOver: any[]) => {
            if (currentlyOver.length > 0) {
                const fish = currentlyOver.find(go => go instanceof Fish) as Fish | undefined;
                if (fish && fish.active) {
                    if (this.isTorpedoMode) {
                        this.shoot(fish.x, fish.y, true, fish);
                    } else if (this.isTargetMode) {
                        this.lockedTarget = fish;
                        this.targetCrosshairFocusX = this.lockedTarget.x;
                        this.targetCrosshairFocusY = this.lockedTarget.y;
                        this.targetCrosshair.setVisible(true);
                        this.updateAutoShootState();
                    }
                }
                if (this.isTorpedoMode || this.isTargetMode) return;
            }
            if (this.isTorpedoMode) return;

            if (pointer.y > h - 80) return;
            if (pointer.x > w - 100) return;
            if (!this.lockedTarget && !this.isAutoMode && !this.isTorpedoMode) {
                this.shoot(pointer.x, pointer.y);
            }
        });
        if (this.isOfflineMode) {
            this.time.addEvent({
                delay: 2000,
                callback: () => {
                    const dummySeat = 2;
                    const myBet = this.betAmount;
                    if (this.isSceneTransitioning || this.seatScores[dummySeat] < myBet) return;
                    
                    const fishList = this.fishGroup.getChildren();
                    if (fishList.length === 0) return;

                    const target = Phaser.Utils.Array.GetRandom(fishList) as Fish;
                    if (!target.active || target.y > h + 50) return;

                    this.seatScores[dummySeat] -= myBet;
                    this.ui.updateScore(dummySeat, this.seatScores[dummySeat]);

                    const p2CannonX = w - 250;
                    const p2CannonY = h - 45;
                    const angle = Phaser.Math.Angle.Between(p2CannonX, p2CannonY, target.x, target.y);

                    this.fireSingleBullet(p2CannonX, p2CannonY, angle, false, 'dummy_p2');

                    const p2Cannon = this.children.getByName('p2_cannon') as Phaser.GameObjects.Sprite;
                    if (p2Cannon) {
                        const bY = p2Cannon.getData('baseY') || p2CannonY;
                        p2Cannon.setRotation(angle + Math.PI / 2);
                        p2Cannon.y = bY;
                        this.tweens.add({ targets: p2Cannon, y: bY + 12, duration: 50, yoyo: true });
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
            console.log(`[Timer] Online Mode: Spawning handled by server. Current Stage: ${this.currentStageName || 'Wild Waters'}`);
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
        this.applyScenePhaseVisuals(SCENE_PHASES[this.currentScenePhaseIndex]);
        this.scheduleNextScenePhase();
    }

    private scheduleNextScenePhase() {
        const currentPhase = SCENE_PHASES[this.currentScenePhaseIndex];
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
        const toPhaseIndex = (this.currentScenePhaseIndex + 1) % SCENE_PHASES.length;
        const fromPhase = SCENE_PHASES[fromPhaseIndex];
        const toPhase = SCENE_PHASES[toPhaseIndex];

        this.isSceneTransitioning = true;
        this.clearAllFishFast();
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
                this.tweens.getTweensOf(fish).forEach(t => t.stop());
                const speed = 1800;
                let vx = 0;
                
                if (fish.body) {
                    const currentVx = (fish.body as Phaser.Physics.Arcade.Body).velocity.x;
                    vx = currentVx >= 0 ? speed : -speed;
                    if (Math.abs(currentVx) < 10) {
                        vx = fish.x < this.cameras.main.centerX ? -speed : speed;
                    }
                    
                    (fish.body as Phaser.Physics.Arcade.Body).setVelocity(vx, 0);
                    (fish.body as Phaser.Physics.Arcade.Body).moves = true;
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
            fontFamily: UI_FONT_FAMILY, fontSize: '48px', color: '#ffea00', fontStyle: 'bold', stroke: '#000', strokeThickness: 10,
            shadow: { offsetX: 0, offsetY: 4, color: '#000', blur: 10, fill: true }
        }).setOrigin(0.5).setDepth(1002).setAlpha(0);

        const nextTitle = this.add.text(cx, cy + 40, `NEXT: ${toPhase.name.toUpperCase()}`, {
            fontFamily: UI_FONT_FAMILY, fontSize: '32px', color: '#ffffff', fontStyle: 'bold', stroke: '#004488', strokeThickness: 6
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

        const scenePhase = SCENE_PHASES[this.currentScenePhaseIndex];
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
        const pool = allowedKeys ? FISH_CONFIGS.filter(f => allowedKeys.includes(f.key)) : FISH_CONFIGS;
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

        const sharkConfig = FISH_CONFIGS.find(cfg => cfg.key === 'sharkjumbo_v2');
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
            fontFamily: UI_FONT_FAMILY,
            fontSize: '88px',
            color: '#ff2f2f',
            fontStyle: 'bold',
            stroke: '#ffffff',
            strokeThickness: 8
        }).setOrigin(0.5).setDepth(90).setScale(0.6).setAlpha(0);

        const detailText = this.add.text(cx, cy + 52, 'GOLDEN SHARK INCOMING', {
            fontFamily: UI_FONT_FAMILY,
            fontSize: '42px',
            color: '#ffd54a',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5).setDepth(90).setScale(0.8).setAlpha(0);
        const countdownText = this.add.text(cx, cy + 132, '3', {
            fontFamily: UI_FONT_FAMILY,
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

    private updateSeatsUI() {
        if (this.isOfflineMode) return;

        for (let i = 0; i < this.seats.length; i++) {
            const player = this.seats[i];
            const isLocal = i === this.mySeatIndex;
            this.ui.updateSeatStatus(i, player, isLocal);
            const cannon = this.cannons[i];
            if (cannon) {
                cannon.setVisible(!!player);
            }
        }

        if (this.mySeatIndex !== -1 && this.cannons[this.mySeatIndex]) {
            this.playerCannon = this.cannons[this.mySeatIndex] as Phaser.GameObjects.Sprite;
            this.updateLocalCannonByBet();
        }
        
        this.updateScoreDisplay();
    }

    private setupSideMenuUI() {
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
        this.sideMenuUI = this.add.container(-300, 100).setDepth(160);
        this.sideMenuUI.setVisible(false);

        const menuWidth = 240;
        const topHeight = 220;
        const bottomHeight = 220;
        const spacing = 10;
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
            } else if (iconType === 'fullscreen') {
                iconGfx.lineStyle(3, 0x00f2ff);
                iconGfx.lineBetween(-15, -8, -15, -15);
                iconGfx.lineBetween(-15, -15, -8, -15);
                iconGfx.lineBetween(15, -8, 15, -15);
                iconGfx.lineBetween(15, -15, 8, -15);
                iconGfx.lineBetween(-15, 8, -15, 15);
                iconGfx.lineBetween(-15, 15, -8, 15);
                iconGfx.lineBetween(15, 8, 15, 15);
                iconGfx.lineBetween(15, 15, 8, 15);
            }
            item.add(iconGfx);

            const text = this.add.text(0, isRound ? 40 : 35, label, {
                fontFamily: UI_FONT_FAMILY,
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
        const bottomPanel = this.add.container(0, topHeight + spacing);
        const bottomBg = this.add.graphics();
        bottomBg.fillStyle(0x002266, 0.95);
        bottomBg.lineStyle(2, 0x0088ff, 1);
        bottomBg.fillRoundedRect(0, 0, menuWidth, bottomHeight, 15);
        bottomBg.strokeRoundedRect(0, 0, menuWidth, bottomHeight, 15);
        bottomPanel.add(bottomBg);

        const fullScreenBtn = createMenuItem(70, 60, 'FULLSCREEN', 'fullscreen');
        fullScreenBtn.hitArea.on('pointerdown', () => {
            this.playUiClick();
            this.toggleFullscreen();
        });

        const help = createMenuItem(170, 60, 'Help', 'help');
        const report = createMenuItem(70, 150, 'Report', 'report');
        const setting = createMenuItem(170, 150, 'Setting', 'music');

        bottomPanel.add([fullScreenBtn.item, help.item, report.item, setting.item]);
        this.sideMenuUI.add([topPanel, bottomPanel]);
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
        if (this.lockedTarget && this.lockedTarget.active) {
            if (!this.isFishInWarArea(this.lockedTarget)) {
                const replacementTarget = this.findReplacementTargetByType(
                    this.lockedTarget as Fish,
                    this.targetCrosshairFocusX || this.lockedTarget.x,
                    this.targetCrosshairFocusY || this.lockedTarget.y
                );
                if (replacementTarget) {
                    this.lockedTarget = replacementTarget as Fish;
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
            this.targetCrosshair.clear();
            this.targetCrosshair.lineStyle(4, 0xff0000, 1);
            this.targetCrosshair.strokeCircle(this.lockedTarget.x, this.lockedTarget.y, 40);
            this.targetCrosshair.lineStyle(2, 0xffffff, 1);
            this.targetCrosshair.strokeCircle(this.lockedTarget.x, this.lockedTarget.y, 45);
            this.targetCrosshair.setVisible(true);
            const angle = Phaser.Math.Angle.Between(this.playerCannon.x, this.playerCannon.y, this.lockedTarget.x, this.lockedTarget.y);
            this.playerCannon.setRotation(angle + Math.PI / 2);
            if (this.isTargetMode) {
                this.drawLightning();
            } else {
                this.hideLaserBeam();
            }
        } else if (this.lockedTarget && !this.lockedTarget.active) {
            this.lockedTarget = null;
            this.targetCrosshair.setVisible(false);
            this.hideLaserBeam();
            this.stopLaserFireSounds();
            this.updateAutoShootState();
        } else {
            const angle = Phaser.Math.Angle.Between(this.playerCannon.x, this.playerCannon.y, pointer.x, pointer.y);
            this.playerCannon.setRotation(angle + Math.PI / 2);
            this.hideLaserBeam();
            if (!this.isTargetMode) {
                this.stopLaserFireSounds();
            }
        }
        if (this.targetCrosshair.visible) {
            this.targetCrosshair.rotation += 0.05;
        }

        this.syncSharkShadows();
        this.fishGroup.getChildren().forEach((f: any) => {
            if (!f.active) return;
            const camW = this.cameras.main.width || 1280;
            const camH = this.cameras.main.height || 720;
            if (f.x < -1000 || f.x > camW + 1000 || f.y < -1000 || f.y > camH + 1000) {
                if (!this.isOfflineMode) {
                    const fishId = f.getData?.('id');
                    if (fishId) {
                        this.network.emit('fish-escaped', { fishId });
                    }
                }
                if (f.texture && f.texture.key === 'sharkjumbo_v2') {
                    this.isJumboActive = false;
                }
                this.destroyFishShadow(f);
                f.destroy();
                this.refreshGoldenSharkMusic();
            }
        });
        const p2Cannon = this.children.getByName('p2_cannon') as Phaser.GameObjects.Sprite;
        if (p2Cannon) {
            const activeFish = this.fishGroup.getChildren().filter(f => f.active);
            if (activeFish.length > 0) {
                const targetFish = activeFish[0] as Phaser.Physics.Arcade.Sprite;
                const angle = Phaser.Math.Angle.Between(p2Cannon.x, p2Cannon.y, targetFish.x, targetFish.y);
                p2Cannon.setRotation(angle + Math.PI / 2);

                if (Math.random() < 0.01) {
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
            bullet.setData('ownerId', 'dummy_p2');
            bullet.setData('allowBounce', true);
            bullet.setData('bounceCount', 0);
            bullet.setData('maxBounceCount', 3);
            bullet.setScale(0.3).setTint(0x00ff00);
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
        if (!this.lockedTarget || !this.lockedTarget.active) return;
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
        drawLayer(15, 0xa15bff, 0.23);
        drawLayer(9, 0x6fdbff, 0.42);
        drawLayer(5, 0xaef3ff, 0.74);
        drawLayer(2.4, 0xffffff, 0.94);
        const pulseA = (phase * 0.6) % 1;
        const pulseB = (pulseA + 0.38) % 1;
        drawPulse(pulseA, 0.12, 4.6, 0xffffff, 0.95);
        drawPulse(pulseB, 0.09, 3.6, 0x9ceeff, 0.82);
        const muzzlePulse = 0.82 + Math.sin(phase * 18) * 0.14;
        this.laserMuzzleGlow.setVisible(true);
        this.laserMuzzleGlow.setPosition(startX + dx * 3, startY + dy * 3);
        this.laserMuzzleGlow.setAlpha(muzzlePulse);
        this.laserMuzzleGlow.setScale(0.55 + Math.sin(phase * 14) * 0.05);
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
        if (this.isTorpedoMode) return;
        if (this.isTargetMode && this.lockedTarget && this.lockedTarget.active) {
            this.shoot(this.lockedTarget.x, this.lockedTarget.y, true);
            return;
        }
        if (this.isAutoMode) {
            let autoTargetX = this.input.activePointer.x;
            let autoTargetY = this.input.activePointer.y;
            const activeFish = this.fishGroup.getChildren().filter((f: any) => {
                const isSelected = this.selectedAutoTargets.size === 0 || this.selectedAutoTargets.has(f.texture.key);
                return f.active && f.x > 0 && f.x < this.cameras.main.width && isSelected;
            });

            if (activeFish.length > 0) {
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
            fontFamily: UI_FONT_FAMILY, fontSize: '24px', color: '#00ffff', fontStyle: 'bold'
        }).setOrigin(0.5);
        container.add(title);

        const gridX = -panelWidth / 2 + 60;
        const gridY = -panelHeight / 2 + 100;
        const cols = 5;
        const spacing = 110;

        FISH_CONFIGS.forEach((config, i) => {
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

        const btnStyle = { fontFamily: UI_FONT_FAMILY, fontSize: '18px', color: '#fff', fontStyle: 'bold' };
        const selectAll = this.add.text(-100, panelHeight / 2 - 40, 'SELECT ALL', btnStyle).setOrigin(0.5).setInteractive();
        selectAll.on('pointerdown', () => {
            this.playUiClick();
            FISH_CONFIGS.forEach(c => this.selectedAutoTargets.add(c.key));
            container.destroy();
            this.showAutoFishingUI(bgRect);
        });
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

    private pickHighTierSpawnOrigin(): { side: 'left' | 'right' | 'top' | 'bottom'; x: number; y: number } {
        const w = this.cameras.main.width;
        const h = this.cameras.main.height;
        const origins: Array<{ side: 'left' | 'right' | 'top' | 'bottom'; x: number; y: number }> = [
            { side: 'left', x: -220, y: Phaser.Math.Between(160, 520) },
            { side: 'right', x: w + 220, y: Phaser.Math.Between(160, 520) },
            { side: 'top', x: Phaser.Math.Between(260, w - 260), y: -180 },
            { side: 'bottom', x: Phaser.Math.Between(260, w - 260), y: h + 180 },
            { side: 'top', x: Phaser.Math.Between(90, 260), y: -180 },
            { side: 'top', x: Phaser.Math.Between(w - 260, w - 90), y: -180 },
            { side: 'bottom', x: Phaser.Math.Between(90, 260), y: h + 180 },
            { side: 'bottom', x: Phaser.Math.Between(w - 260, w - 90), y: h + 180 }
        ];
        return Phaser.Utils.Array.GetRandom(origins);
    }

    private spawnFish1CompanionsForFish8(anchorX: number, anchorY: number, side: 'left' | 'right' | 'top' | 'bottom') {
        const fish1Config = FISH_CONFIGS.find(c => c.key === 'fish1');
        if (!fish1Config) return;

        const w = this.cameras.main.width;
        const h = this.cameras.main.height;
        const count = Phaser.Math.Between(4, 5);
        const horizontalSide: 'left' | 'right' =
            side === 'left' || side === 'right'
                ? side
                : (anchorX < (w * 0.5) ? 'left' : 'right');
        const leadX = horizontalSide === 'left' ? anchorX + 180 : anchorX - 180;

        for (let i = 0; i < count; i++) {
            const offsetX = Phaser.Math.Between(-110, 110);
            const offsetY = Phaser.Math.Between(-150, 150);
            const spawnX = Phaser.Math.Clamp(leadX + offsetX, 40, w - 40);
            const spawnY = Phaser.Math.Clamp(anchorY + offsetY, 120, h - 240);
            this.spawnFish(fish1Config, {
                x: spawnX,
                y: spawnY,
                side: horizontalSide,
                disableWave: false
            });
        }
    }

    private spawnFish(configOrData: FishConfig | any, options: SpawnOptions = {}, explicitFishData?: any) {
        let config: FishConfig;
        let fishData: any = explicitFishData ?? null;

        if (configOrData.key) {
            config = configOrData as FishConfig;
        } else {
            fishData = configOrData;
            config = FISH_CONFIGS.find(c => c.key === fishData.type) || FISH_CONFIGS[0];
        }

        if (config.key === 'sharkjumbo_v2' && !options.skipWarning) {
            const shown = this.showGoldenSharkWarning(() => {
                this.spawnFish(config, { ...options, skipWarning: true });
            });
            if (shown) return;
        }
        if (config.key === 'sharkjumbo_v2' && !this.canSpawnGoldenSharkNow()) return;

        const isHighTier = config.key === 'fish8' || config.key === 'fish9' || config.key === 'fish10';
        const shouldAutoPickHighTierOrigin =
            isHighTier &&
            options.side === undefined &&
            options.x === undefined &&
            options.y === undefined;
        const highTierOrigin = shouldAutoPickHighTierOrigin ? this.pickHighTierSpawnOrigin() : null;

        const side = options.side ?? highTierOrigin?.side ?? (Math.random() > 0.5 ? 'left' : 'right');
        const defaultSpawnXBySide = side === 'left'
            ? -200
            : side === 'right'
                ? this.cameras.main.width + 200
                : Phaser.Math.Between(180, this.cameras.main.width - 180);
        const defaultSpawnYBySide = side === 'top'
            ? -180
            : side === 'bottom'
                ? this.cameras.main.height + 180
                : Phaser.Math.Between(150, this.cameras.main.height - 300);
        const x = options.x ?? highTierOrigin?.x ?? defaultSpawnXBySide;
        const desiredY = options.y ?? highTierOrigin?.y ?? defaultSpawnYBySide;
        let spawnY = desiredY;
        if (this.isRegularSharkType(config.key)) {
            const sharkSide: 'left' | 'right' = side === 'left' || side === 'right'
                ? side
                : (x < this.cameras.main.centerX ? 'left' : 'right');
            const lane = this.resolveSharkSpawnLane(sharkSide, x, desiredY);
            if (!lane.allowed) return;
            spawnY = lane.y;
        }

        const fish = new Fish(this, x, spawnY, config, { ...options, side });
        fish.setData('id', options.id || fishData?.id || Phaser.Math.RND.uuid());
        fish.setData('score', fishData?.score || config.score);
        fish.hp = fishData?.hp || (config.hp * (this.betAmount * 100));
        
        if (config.key === 'sharkjumbo_v2') {
            this.isJumboActive = true;
            this.lastGoldenSharkSpawnedAt = this.time.now;
            this.safePlaySound('snd_golden_shark_spawn', { volume: 0.72 });
            this.cameras.main.shake(380, 0.008);
            fish.on('destroy', () => {
                this.isJumboActive = false;
                this.refreshGoldenSharkMusic();
            });
        }

        if (this.isOfflineMode && config.key === 'fish8') {
            this.spawnFish1CompanionsForFish8(fish.x, fish.y, side);
        }

        this.refreshGoldenSharkMusic();
        this.attachSharkShadow(fish);
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
        if (this.isFrozen) {
            if (fish.body) {
                (fish.body as Phaser.Physics.Arcade.Body).moves = false;
            }
            fish.anims.pause();
            this.tweens.getTweensOf(fish).forEach(t => t.pause());
        }

        return fish;
    }

    private shoot(
        targetX: number,
        targetY: number,
        isTargeted: boolean = false,
        torpedoTarget: Fish | null = null
    ) {
        if (this.isTorpedoMode && (!torpedoTarget || !torpedoTarget.active)) {
            return;
        }

        const currentBet = this.isTorpedoMode ? this.betAmount * 6 : this.betAmount;
        if (this.score < currentBet) return;
        let selectedTargetId = "";
        if (this.isTorpedoMode) {
            selectedTargetId = torpedoTarget && torpedoTarget.active ? (torpedoTarget.getData('id') || "") : "";
            if (!selectedTargetId) return;
        } else if (this.lockedTarget && this.lockedTarget.active) {
            selectedTargetId = this.lockedTarget.getData('id') || "";
        }

        if (!this.isOfflineMode) {
            if (!this.hasReceivedInitGame || !this.network.isConnected()) {
                this.setNetworkStatusText('Waiting for server connection...');
                return;
            }

            if ((this.score - this.pendingServerBetAmount) < currentBet) {
                this.setNetworkStatusText('Saldo menunggu sinkronisasi server...');
                return;
            }

            const sent = this.network.emit('shoot', { fishId: selectedTargetId, betAmount: currentBet, isTorpedo: this.isTorpedoMode });
            if (!sent) {
                this.setNetworkStatusText('Shot blocked: server disconnected.');
                return;
            }
            this.pendingServerBetAmount += currentBet;
        } else {
            this.score -= currentBet;
            if (this.mySeatIndex !== -1) {
                this.seatScores[this.mySeatIndex] = this.score;
            }
            this.updateScoreDisplay();
        }

        const cannon = this.playerCannon;
        const angle = Phaser.Math.Angle.Between(cannon.x, cannon.y, targetX, targetY);
        const muzzleOffset = 60;
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
            this.fireTorpedo(muzzleX, muzzleY, targetX, targetY, 'local_p1', torpedoTarget, selectedTargetId || undefined);
        } else {
            this.fireSingleBullet(muzzleX, muzzleY, angle, isTargeted, 'local_p1');
        }

        const h = this.cameras.main.height;
        const baseY = cannon.getData('baseY') || (h > 0 ? h - 55 : 665);
        cannon.y = baseY;
        this.tweens.killTweensOf(cannon);
        this.tweens.add({ targets: cannon, y: baseY + 12, duration: 50, yoyo: true });
        const flash = this.add.sprite(muzzleX, muzzleY, 'muzzle').setDepth(41).setRotation(angle);
        flash.setScale(0.2).setAlpha(0.7);
        this.tweens.add({ targets: flash, scale: 0.5, alpha: 0, duration: 100, onComplete: () => flash.destroy() });
    }


    private fireTorpedo(
        x: number,
        y: number,
        targetX: number,
        targetY: number,
        ownerId: string,
        torpedoTarget: Fish | null = null,
        targetFishId?: string
    ) {
        const torpedoTexture = this.textures.exists('torpedo_projectile_custom') ? 'torpedo_projectile_custom' : 'torpedo_projectile';
        const torpedo = new Bullet(this, x, y, torpedoTexture);
        torpedo.initTorpedo(torpedoTarget, targetX, targetY, ownerId, targetFishId);
        const mySocketId = this.network?.getSocketId?.();
        const isLocalOwner = ownerId === 'local_p1' || (!!mySocketId && ownerId === mySocketId);
        if (!this.isOfflineMode && isLocalOwner && targetFishId) {
            const current = this.activeLocalTorpedoTargetCounts.get(targetFishId) || 0;
            this.activeLocalTorpedoTargetCounts.set(targetFishId, current + 1);
            torpedo.once('destroy', () => {
                const remain = (this.activeLocalTorpedoTargetCounts.get(targetFishId) || 1) - 1;
                if (remain <= 0) {
                    this.activeLocalTorpedoTargetCounts.delete(targetFishId);
                    const pendingKill = this.deferredLocalTorpedoKills.get(targetFishId);
                    if (pendingKill) {
                        this.deferredLocalTorpedoKills.delete(targetFishId);
                        const fishRef = this.fishGroup.getChildren().find(f => (f as Fish).getData('id') === pendingKill.fishId) as Fish;
                        if (fishRef && fishRef.active) {
                            this.killFish(fishRef, false, pendingKill.killerId, pendingKill.winAmount);
                        }
                    }
                } else {
                    this.activeLocalTorpedoTargetCounts.set(targetFishId, remain);
                }
            });
        }
    }

    private fireSingleBullet(x: number, y: number, angle: number, isTargeted: boolean, ownerId: string) {
        const bullet = new Bullet(this, x, y, 'bullet');
        bullet.initStandard(angle, isTargeted, ownerId);
    }

    private handleBulletWorldBounds(body: Phaser.Physics.Arcade.Body) {
        const bullet = body.gameObject as Bullet;
        if (!bullet || !bullet.active || bullet.isTargeted) return;

        this.safePlaySound('snd_hit', { volume: 0.12, rate: 1.7 });
    }

    private handleCollision(bullet: Phaser.Physics.Arcade.Sprite, fish: Phaser.Physics.Arcade.Sprite) {
        if (!bullet.active || !fish.active) return;

        const b = bullet as Bullet;
        const f = fish as Fish;
        if (f.getData('isDying')) return;

        if (b.isTorpedo) {
            if (!b.getIsArmed()) return;
            const selectedFishId = b.getTargetFishId();
            const currentFishId = f.getData('id') || '';
            if (selectedFishId && currentFishId !== selectedFishId) return;
        }

        if (b.isTargeted && this.lockedTarget && f !== this.lockedTarget) {
            return;
        }

        const ownerId = b.ownerId;
        const angle = Phaser.Math.Angle.Between(b.x, b.y, f.x, f.y);
        b.x += Math.cos(angle) * 30;
        b.y += Math.sin(angle) * 30;

        const net = this.add.image(b.x, b.y, 'web').setDepth(35);
        net.setAlpha(0.7);
        net.setScale(f.scale * 0.9);
        this.tweens.add({ targets: net, scale: net.scale * 1.3, alpha: 0, duration: 350, onComplete: () => net.destroy() });

        if (b.isTorpedo) {
            b.explode();
        } else {
            b.destroy();
        }

        const flash = this.add.circle(b.x, b.y, 20, 0xffffff, 0.9).setDepth(25);
        this.tweens.add({ targets: flash, scale: 2.5, alpha: 0, duration: 150, onComplete: () => flash.destroy() });

        this.safePlaySound(b.isTorpedo ? 'snd_explosion' : 'snd_hit', { volume: 0.3 });

        if (this.isOfflineMode) {
            const damage = b.isTorpedo ? 11 : 1;
            const isDead = f.takeDamage(damage);
            if (isDead) {
                this.killFish(f, true, ownerId);
            }
            return;
        }

        f.setTint(0xffffff);
        this.time.delayedCall(80, () => {
            if (f.active) {
                f.clearTint();
                if ((f as Fish).isGoldenShark) {
                    f.setTint(0xffd84d);
                }
            }
        });
    }

    private flyCoinToBalance(coin: Phaser.GameObjects.Sprite, targetX: number, targetY: number) {
        const curve = new Phaser.Curves.QuadraticBezier(
            new Phaser.Math.Vector2(coin.x, coin.y),
            new Phaser.Math.Vector2(coin.x + Phaser.Math.Between(-200, 200), coin.y - 300),
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

    private resolveCoinTargetForKiller(killerId: string): { x: number; y: number } {
        const w = this.cameras.main.width;
        const h = this.cameras.main.height;
        const seatX = [250, w / 2, w - 250];

        let seatIndex = -1;
        if (killerId === 'local_p1') {
            seatIndex = this.mySeatIndex !== -1 ? this.mySeatIndex : 0;
        } else if (!this.isOfflineMode) {
            if (killerId === this.network.getSocketId()) {
                seatIndex = this.mySeatIndex !== -1 ? this.mySeatIndex : 0;
            } else {
                seatIndex = this.seats.findIndex(s => s && s.socketId === killerId);
            }
        }

        if (seatIndex < 0 || seatIndex > 2) {
            seatIndex = 2;
        }

        return { x: seatX[seatIndex], y: h - 45 };
    }

    private killFish(fish: Fish, addScore: boolean = true, killerId: string = 'local_p1', forcedWinAmount?: number) {
        if (!fish.active) return;
        if (fish.getData('isDying')) return;
        fish.setData('isDying', true);
        if (fish === this.lockedTarget) {
            this.lockedTarget = null;
            this.targetCrosshair.setVisible(false);
            this.updateAutoShootState();
        }

        const betUsed = killerId === 'local_p1' ? this.betAmount : this.dummyBetAmount;
        let baseScore = (fish.getData('score') || 1) * betUsed;
        let finalScore = forcedWinAmount !== undefined ? forcedWinAmount : baseScore;
        const isGoldenShark = !!fish.getData('isGoldenShark');

        let isJackpot = false;

        if (this.isOfflineMode) {
            if (isGoldenShark) {
                finalScore = baseScore * 3.5;
            } else if (betUsed >= 5.0 && Math.random() < 0.001) {
                isJackpot = true;
                const jackpotWin = this.jiliJackpot;
                finalScore += jackpotWin;
                this.jiliJackpot = 5000;
                if (killerId === 'local_p1') this.playJackpotAnimation(jackpotWin);
            } else if (betUsed >= 0.8 && Math.random() < 0.005) {
                isJackpot = true;
                const jackpotWin = this.luckyJackpot;
                finalScore += jackpotWin;
                this.luckyJackpot = 400;
                if (killerId === 'local_p1') this.playJackpotAnimation(jackpotWin);
            } else if (betUsed >= 0.2 && Math.random() < 0.01) {
                isJackpot = true;
                const jackpotWin = this.speedJackpot;
                finalScore += jackpotWin;
                this.speedJackpot = 80;
                if (killerId === 'local_p1') this.playJackpotAnimation(jackpotWin);
            }
        }

        if (isGoldenShark) {
            this.cameras.main.shake(650, 0.02);
        } else if (isJackpot) {
            this.cameras.main.shake(800, 0.02);
        } else if (fish.texture.key === 'sharkjumbo_v2') {
            this.cameras.main.shake(1000, 0.03);
        }

        const isBigKill = isGoldenShark || isJackpot;
        const deathX = fish.x;
        const deathY = fish.y;

        this.playFishDeathAnimation(fish, isBigKill, () => {
            const coinTarget = this.resolveCoinTargetForKiller(killerId);
            const mySocketId = this.network?.getSocketId?.();

            if (addScore) {
                if (killerId === 'local_p1' || (!!mySocketId && killerId === mySocketId)) {
                    this.score += finalScore;
                    if (this.mySeatIndex !== -1) {
                        this.seatScores[this.mySeatIndex] = this.score;
                    }
                } else {
                    const seatIndex = this.seats.findIndex(s => s && s.socketId === killerId);
                    if (seatIndex !== -1) {
                        this.seatScores[seatIndex] += finalScore;
                    }
                }
                this.updateScoreDisplay();
            }

            if (this.isOfflineMode && addScore && killerId === 'local_p1') {
                localStorage.setItem('fishGame_balance', this.score.toString());
            }

            const coinCount = Math.min(Math.floor(finalScore / 2) + 1, 10);
            for (let i = 0; i < coinCount; i++) {
                const coin = this.add.sprite(deathX + Phaser.Math.Between(-30, 30), deathY + Phaser.Math.Between(-30, 30), 'coinAni2').setDepth(60).setScale(0.6);
                coin.play('coin_anim');
                this.flyCoinToBalance(coin, coinTarget.x, coinTarget.y);
            }

            const floatColor = isGoldenShark ? '#ffe067' : (isJackpot ? '#ff00ff' : '#ffd700');
            const txt = this.add.text(deathX, deathY, `+${finalScore.toFixed(2)}`, {
                fontFamily: UI_FONT_FAMILY, fontSize: isBigKill ? '42px' : '28px', color: floatColor, stroke: '#000', strokeThickness: 4
            }).setOrigin(0.5).setDepth(100);
            this.tweens.add({ targets: txt, y: deathY - 120, alpha: 0, duration: 1200, onComplete: () => txt.destroy() });
        });

        if (fish.texture.key === 'sharkjumbo_v2') {
            this.isJumboActive = false;
            this.lastGoldenSharkSpawnedAt = this.time.now;
            this.refreshGoldenSharkMusic();
        }
    }

    private playFishDeathAnimation(fish: Phaser.Physics.Arcade.Sprite, isBigKill: boolean, onComplete: () => void) {
        const isBoss = fish.texture.key === 'sharkjumbo_v2';
        const isElectricFish8 = fish.texture.key === 'fish8';
        const isEliteShark = fish.texture.key === 'shark1' || fish.texture.key === 'shark2';
        const isMediumLargeFish = ['fish6', 'fish7', 'fish9', 'fish10'].includes(fish.texture.key);
        const isJumboShark = fish.texture.key === 'sharkjumbo_v2';
        const isGoldenSharkKill = !!fish.getData('isGoldenShark');
        const x = fish.x;
        const y = fish.y;
        if (fish.body) {
            (fish.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
            (fish.body as Phaser.Physics.Arcade.Body).moves = false;
        }
        
        this.tweens.getTweensOf(fish).forEach(t => t.stop());

        if (isBoss) {
            const chaosDuration = isJumboShark
                ? Phaser.Math.Between(4000, 7000)
                : (isGoldenSharkKill ? Phaser.Math.Between(3000, 5000) : 4000);
            const totalDuration = chaosDuration + 2400;
            this.time.timeScale = 0.2;
            this.time.delayedCall(850, () => { this.time.timeScale = 1.0; });
            this.tweens.add({
                targets: fish,
                x: x + Phaser.Math.Between(-10, 10),
                y: y + Phaser.Math.Between(-10, 10),
                duration: 50,
                yoyo: true,
                repeat: 40,
            });

            this.time.addEvent({
                delay: 100,
                callback: () => {
                    (fish as any).setTint(0xffffff);
                    if (typeof (fish as any).setTintMode === 'function') {
                        (fish as any).setTintMode((Phaser as any).TintModes ? (Phaser as any).TintModes.FILL : 1);
                    }
                    this.time.delayedCall(80, () => {
                        if (fish.active) {
                            fish.clearTint();
                            if (fish instanceof Fish && fish.isGoldenShark) fish.setTint(0xffd84d);
                        }
                    });
                },
                repeat: Math.max(20, Math.floor(chaosDuration / 100))
            });

            if (isJumboShark) {
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
            this.time.delayedCall(chaosDuration, () => {
                if (!fish.active) return;
                
                this.safePlaySound('snd_explosion', { volume: 1.2 });
                this.cameras.main.shake(1000, 0.04);
                const mainExp = this.add.sprite(fish.x, fish.y, 'explosion_v2').setDepth(42).setScale(2);
                this.tweens.add({ targets: mainExp, scale: 6, alpha: 0, duration: 1500, onComplete: () => mainExp.destroy() });
                const megaBomb = this.add.sprite(fish.x, fish.y, 'big_bomb').setDepth(43).setScale(1.2).setAlpha(0.95);
                this.tweens.add({ targets: megaBomb, scale: 4.2, alpha: 0, duration: 1200, ease: 'Cubic.easeOut', onComplete: () => megaBomb.destroy() });

                if (isJumboShark) {
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
                        onComplete();
                    }
                });
            });
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
            const shockPairs: Array<{ target: Phaser.Physics.Arcade.Sprite; wrap: Phaser.GameObjects.Ellipse }> = [];
            const chainStartAt = this.time.now;
            const sourceX = x;
            const sourceY = y;

            this.tweens.add({
                targets: fish,
                scaleX: fish.scaleX * 1.1,
                scaleY: fish.scaleY * 1.1,
                duration: 170,
                yoyo: true,
                repeat: Math.max(12, Math.floor(electricDuration / 180)),
                ease: 'Sine.easeInOut'
            });
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
                shockPairs.push({ target: t, wrap });

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
                    electricGfx.clear();
                    const activeTargets: Phaser.Physics.Arcade.Sprite[] = [];
                    for (const pair of shockPairs) {
                        if (!pair.target.active) {
                            if (pair.wrap.active) pair.wrap.destroy();
                            continue;
                        }
                        if (pair.wrap.active) {
                            pair.wrap.setPosition(pair.target.x, pair.target.y);
                        }
                        activeTargets.push(pair.target);
                    }

                    if (activeTargets.length >= 2) {
                        const elapsed = this.time.now - chainStartAt;
                        const progress = Phaser.Math.Clamp(elapsed / electricDuration, 0, 1);
                        const activeLinks = Math.max(1, Math.floor(progress * (activeTargets.length - 1)) + 1);

                        for (let i = 0; i < Math.min(activeLinks, activeTargets.length - 1); i++) {
                            const a = activeTargets[i];
                            const b = activeTargets[i + 1];
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

                        for (const t of activeTargets) {
                            if (!t.active) continue;
                            t.setTint(Phaser.Math.RND.pick([0xc7f0ff, 0xa7e3ff, 0xdaf8ff]));
                        }
                    }
                }
            });

            this.time.delayedCall(electricDuration, () => {
                arcEvent.remove(false);
                shockSoundEvent.remove(false);
                electricGfx.clear();
                shockPairs.forEach(pair => {
                    if (pair.wrap.active) pair.wrap.destroy();
                });
                const aliveTargets = shockPairs
                    .map(pair => pair.target)
                    .filter(t => t.active);

                for (const t of aliveTargets) {
                    if (!t.active) continue;
                    const ex = this.add.sprite(t.x, t.y, 'explosion_v2').setDepth(45).setScale(0.7);
                    this.tweens.add({ targets: ex, scale: 2.1, alpha: 0, duration: 520, onComplete: () => ex.destroy() });
                }

                this.safePlaySound('snd_explosion', { volume: 0.92 });
                this.cameras.main.shake(450, 0.012);

                for (const t of aliveTargets) {
                    if (!t.active) continue;
                    t.clearTint();
                    this.destroyFishShadow(t);
                    t.destroy();
                }

                const burstX = fish.active ? fish.x : sourceX;
                const burstY = fish.active ? fish.y : sourceY;
                const finalBurst = this.add.sprite(burstX, burstY, 'big_bomb').setDepth(47).setScale(1.8).setAlpha(0.98);
                this.tweens.add({
                    targets: finalBurst,
                    scale: 5.2,
                    alpha: 0,
                    duration: 820,
                    ease: 'Cubic.easeOut',
                    onComplete: () => finalBurst.destroy()
                });

                if (!fish.active) {
                    electricGfx.destroy();
                    this.refreshGoldenSharkMusic();
                    onComplete();
                    return;
                }

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
                        shockPairs.forEach(pair => { if (pair.wrap.active) pair.wrap.destroy(); });
                        this.refreshGoldenSharkMusic();
                        onComplete();
                    }
                });
            });
        } else if (isEliteShark) {
            const sharkDeathDuration = Phaser.Math.Between(4200, 5000);
            const aura = this.add.circle(x, y, Math.max(70, fish.displayWidth * 0.46), 0x6fd7ff, 0.2).setDepth(42);
            aura.setBlendMode(Phaser.BlendModes.ADD);
            this.tweens.add({
                targets: aura,
                scale: 1.34,
                alpha: 0.06,
                duration: 520,
                yoyo: true,
                repeat: Math.max(8, Math.floor(sharkDeathDuration / 620)),
                ease: 'Sine.easeInOut'
            });
            this.time.delayedCall(sharkDeathDuration + 1400, () => {
                if (aura.active) aura.destroy();
            });

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

                    if (Math.random() < 0.4) {
                        const ring = this.add.circle(
                            fish.x + Phaser.Math.Between(-18, 18),
                            fish.y + Phaser.Math.Between(-12, 12),
                            Phaser.Math.Between(16, 26),
                            Phaser.Math.RND.pick([0x89d9ff, 0x9af0ff, 0xb7c9ff]),
                            0.55
                        ).setDepth(44);
                        ring.setBlendMode(Phaser.BlendModes.ADD);
                        ring.setStrokeStyle(2.5, 0xe9fbff, 0.95);
                        this.tweens.add({
                            targets: ring,
                            scale: Phaser.Math.FloatBetween(2.8, 4.2),
                            alpha: 0,
                            duration: Phaser.Math.Between(320, 620),
                            ease: 'Cubic.easeOut',
                            onComplete: () => ring.destroy()
                        });
                    }
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

                for (let i = 0; i < 5; i++) {
                    this.time.delayedCall(i * 95, () => {
                        if (!fish.active) return;
                        const shock = this.add.circle(
                            fish.x + Phaser.Math.Between(-40, 40),
                            fish.y + Phaser.Math.Between(-26, 26),
                            Phaser.Math.Between(18, 28),
                            0xbce8ff,
                            0.5
                        ).setDepth(45);
                        shock.setBlendMode(Phaser.BlendModes.ADD);
                        this.tweens.add({
                            targets: shock,
                            scale: Phaser.Math.FloatBetween(3.2, 5.2),
                            alpha: 0,
                            duration: Phaser.Math.Between(320, 540),
                            ease: 'Cubic.easeOut',
                            onComplete: () => shock.destroy()
                        });
                    });
                }

                this.tweens.add({
                    targets: fish,
                    scale: fish.scale * 1.55,
                    alpha: 0,
                    angle: fish.flipX ? -180 : 180,
                    duration: 900,
                    ease: 'Cubic.easeIn',
                    onComplete: () => {
                        if (aura.active) aura.destroy();
                        this.destroyFishShadow(fish);
                        fish.destroy();
                        this.refreshGoldenSharkMusic();
                        onComplete();
                    }
                });
            });
        } else if (isMediumLargeFish) {
            this.tweens.add({
                targets: fish,
                angle: fish.flipX ? -12 : 12,
                duration: 110,
                yoyo: true,
                repeat: 6,
                ease: 'Sine.easeInOut'
            });

            const burstCount = fish.texture.key === 'fish9' || fish.texture.key === 'fish10' ? 4 : 2;
            for (let i = 0; i < burstCount; i++) {
                this.time.delayedCall(120 * i, () => {
                    if (!fish.active) return;
                    const ex = this.add.sprite(
                        fish.x + Phaser.Math.Between(-30, 30),
                        fish.y + Phaser.Math.Between(-20, 20),
                        'explosion_v2'
                    ).setDepth(44).setScale(0.7);
                    this.tweens.add({
                        targets: ex,
                        scale: 2.1,
                        alpha: 0,
                        duration: 420,
                        ease: 'Cubic.easeOut',
                        onComplete: () => ex.destroy()
                    });
                });
            }

            const shock = this.add.circle(x, y, 18, 0x9ce7ff, 0.8).setDepth(45);
            shock.setBlendMode(Phaser.BlendModes.ADD);
            this.tweens.add({
                targets: shock,
                scale: 5.2,
                alpha: 0,
                duration: 520,
                ease: 'Cubic.easeOut',
                onComplete: () => shock.destroy()
            });

            this.safePlaySound('snd_explosion', { volume: 0.58, rate: 1.02 });
            this.cameras.main.shake(180, 0.0075);

            this.tweens.add({
                targets: fish,
                y: y - 42,
                scale: fish.scale * 1.32,
                angle: fish.flipX ? -220 : 220,
                alpha: 0,
                duration: 860,
                ease: 'Cubic.easeIn',
                onComplete: () => {
                    this.destroyFishShadow(fish);
                    fish.destroy();
                    this.refreshGoldenSharkMusic();
                    onComplete();
                }
            });
        } else {
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
                    onComplete();
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
        const bg = this.add.graphics().setDepth(90);
        bg.fillStyle(0x000000, 0.7);
        bg.fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);
        const title = this.add.text(cx, cy - 100, 'GRAND JACKPOT!!!', {
            fontFamily: UI_FONT_FAMILY,
            fontSize: '80px', color: '#ffea00', fontStyle: 'bold', stroke: '#ff0000', strokeThickness: 10,
            shadow: { offsetX: 0, offsetY: 0, color: '#ffea00', blur: 20, fill: true }
        }).setOrigin(0.5).setDepth(91).setScale(0);
        const amountText = this.add.text(cx, cy + 50, amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), {
            fontFamily: UI_FONT_FAMILY,
            fontSize: '100px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 12,
            shadow: { offsetX: 0, offsetY: 0, color: '#ffffff', blur: 30, fill: true }
        }).setOrigin(0.5).setDepth(91).setScale(0);
        this.tweens.add({
            targets: [title, amountText],
            scale: 1,
            duration: 800,
            ease: 'Back.easeOut'
        });
        const glow = this.add.circle(cx, cy, 300, 0xffaa00, 0.5).setDepth(90);
        this.tweens.add({
            targets: glow,
            scale: 1.5,
            alpha: 0,
            duration: 1000,
            yoyo: true,
            repeat: 3
        });
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

    public activateFrozenSkill(manual: boolean = true) {
        this.isFrozen = true;
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
        this.safePlaySound('snd_hit', { volume: 0.5 });
        this.fishGroup.getChildren().forEach((f: any) => {
            if (f.active) {
                f.body.moves = false;
                f.anims.pause();
                this.tweens.getTweensOf(f).forEach(t => t.pause());
            }
        });
        this.time.delayedCall(10000, () => {
            this.isFrozen = false;
            freezeBg.destroy();
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
        if (this.mySeatIndex !== -1) {
            this.ui.updateScore(this.mySeatIndex, this.isOfflineMode ? this.score : this.seatScores[this.mySeatIndex]);
            this.ui.updateBet(this.mySeatIndex, this.betAmount);
        }
        this.updateSkillCosts();
    }

    private updateSkillCosts() {
    }

    private updateJackpotDisplay() {
        this.ui.updateJackpots(this.speedJackpot, this.jiliJackpot, this.luckyJackpot);
    }

    private setupElectricCannonUI() {
        const startX = 25; 
        const startY = this.cameras.main.height - 180;

        const bg = this.add.graphics();
        bg.fillStyle(0x333333, 0.8);
        bg.fillRoundedRect(startX, startY, 20, 150, 10);
        bg.lineStyle(2, 0xffffff, 0.5);
        bg.strokeRoundedRect(startX, startY, 20, 150, 10);
        bg.setDepth(300);

        this.energyBar = this.add.graphics();
        this.energyBar.setDepth(301);

        this.energyBtn = this.add.container(startX + 10, startY - 40).setDepth(310).setVisible(false);
        const btnBg = this.add.circle(0, 0, 30, 0xffd700, 1).setStrokeStyle(4, 0xffffff);
        const icon = this.add.image(0, 0, 'icon_torpedo').setScale(0.7);
        const glow = this.add.circle(0, 0, 35, 0xffffff, 0.3);
        
        this.energyBtn.add([glow, btnBg, icon]);
        this.energyBtn.setInteractive(new Phaser.Geom.Circle(0, 0, 35), Phaser.Geom.Circle.Contains);
        this.energyBtn.on('pointerdown', () => this.fireElectricCannon());

        this.tweens.add({
            targets: glow,
            scale: 1.2,
            alpha: 0,
            duration: 800,
            repeat: -1
        });
        
        this.updateEnergyBar();
    }

    private updateEnergyBar() {
        if (!this.energyBar) return;
        this.energyBar.clear();
        
        const startX = 25;
        const startY = this.cameras.main.height - 180;
        const height = (this.energy / 100) * 150;
        
        this.energyBar.fillStyle(0x00ff00, 1);
        this.energyBar.fillRoundedRect(startX, startY + (150 - height), 20, height, 5);

        this.energyBtn?.setVisible(this.energy >= 100);
    }

    private fireElectricCannon() {
        if (this.energy < 100) return;

        const impactX = Phaser.Math.Between(220, this.cameras.main.width - 220);
        const impactY = Phaser.Math.Between(170, this.cameras.main.height - 170);

        if (!this.isOfflineMode) {
            if (!this.network.isConnected()) return;
            this.network.emit('activate-lucky-orb', {
                betAmount: this.betAmount,
                impactX,
                impactY
            });
            return;
        }
        const lucky = Math.random() < 0.58;
        this.playLuckyOrbCastVisual('local_p1', impactX, impactY, lucky);
        if (lucky) {
            const effectRadius = Math.max(this.cameras.main.width, this.cameras.main.height) * 1.25;
            const candidates = this.fishGroup.getChildren()
                .filter((f: any) => f.active && Phaser.Math.Distance.Between(f.x, f.y, impactX, impactY) <= effectRadius) as Fish[];
            const killCount = candidates.length;
            Phaser.Utils.Array.Shuffle(candidates);
            for (let i = 0; i < killCount; i++) {
                this.killFish(candidates[i], true, 'local_p1');
            }
        }

        this.energy = 0;
        this.updateEnergyBar();
    }

    private playLuckyOrbCastVisual(activatorId: string, impactX: number, impactY: number, lucky: boolean) {
        const w = this.cameras.main.width;
        const h = this.cameras.main.height;
        const seatX = [250, w / 2, w - 250];
        const isLocal = activatorId === 'local_p1' || activatorId === this.network?.getSocketId?.();
        const seatIndex = isLocal
            ? (this.mySeatIndex !== -1 ? this.mySeatIndex : 0)
            : this.seats.findIndex(s => s && s.socketId === activatorId);

        const startX = seatIndex >= 0 && seatIndex <= 2 ? seatX[seatIndex] : 35;
        const startY = h - 85;

        const orbCore = this.add.circle(startX, startY, 24, 0xf2ffff, 0.98).setDepth(362);
        const orbShell = this.add.circle(startX, startY, 44, 0x86e8ff, 0.78).setDepth(361);
        const orbGlow = this.add.circle(startX, startY, 124, 0x3ebcff, 0.32).setDepth(360);
        orbGlow.setBlendMode(Phaser.BlendModes.ADD);

        const pulseTargets = [orbCore, orbShell, orbGlow];
        this.tweens.add({
            targets: pulseTargets,
            scale: 1.24,
            duration: 210,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        const curve = new Phaser.Curves.QuadraticBezier(
            new Phaser.Math.Vector2(startX, startY),
            new Phaser.Math.Vector2((startX + impactX) * 0.5 + Phaser.Math.Between(-100, 100), impactY - 280),
            new Phaser.Math.Vector2(impactX, impactY)
        );
        const path = { t: 0, vec: new Phaser.Math.Vector2() };
        let trailTick = 0;

        this.safePlaySound('snd_laser_fire_start', { volume: 0.32, rate: 1.05 });

        this.tweens.add({
            targets: path,
            t: 1,
            duration: 1500,
            ease: 'Cubic.easeInOut',
            onUpdate: () => {
                curve.getPoint(path.t, path.vec);
                orbCore.setPosition(path.vec.x, path.vec.y);
                orbShell.setPosition(path.vec.x, path.vec.y);
                orbGlow.setPosition(path.vec.x, path.vec.y);
                orbGlow.setScale(1 + (Math.random() * 0.24));

                trailTick++;
                if (trailTick % 2 === 0) {
                    const trail = this.add.circle(path.vec.x, path.vec.y, Phaser.Math.Between(10, 22), 0xa8eeff, 0.42).setDepth(358);
                    trail.setBlendMode(Phaser.BlendModes.ADD);
                    this.tweens.add({
                        targets: trail,
                        scale: Phaser.Math.FloatBetween(2.4, 3.8),
                        alpha: 0,
                        duration: Phaser.Math.Between(260, 460),
                        onComplete: () => trail.destroy()
                    });
                }
            },
            onComplete: () => {
                this.tweens.killTweensOf(pulseTargets);
                orbCore.destroy();
                orbShell.destroy();
                orbGlow.destroy();
                this.playLuckyOrbImpactVisual(impactX, impactY, lucky);
            }
        });
    }

    private playLuckyOrbImpactVisual(impactX: number, impactY: number, lucky: boolean) {
        const mainFlash = this.add.circle(impactX, impactY, lucky ? 96 : 42, lucky ? 0xdfffff : 0xaaaaaa, 0.98).setDepth(372);
        const shockRing = this.add.circle(impactX, impactY, lucky ? 130 : 56, lucky ? 0x59d7ff : 0x777777, lucky ? 0.56 : 0.3)
            .setDepth(371)
            .setStrokeStyle(6, lucky ? 0xdef7ff : 0xaaaaaa, lucky ? 0.94 : 0.5);
        const impactGlow = this.add.circle(impactX, impactY, lucky ? 260 : 86, lucky ? 0x37b2ff : 0x666666, lucky ? 0.28 : 0.12).setDepth(370);
        impactGlow.setBlendMode(Phaser.BlendModes.ADD);
        const areaRing = this.add.circle(impactX, impactY, lucky ? 320 : 120, lucky ? 0x6ec9ff : 0x666666, lucky ? 0.1 : 0.05).setDepth(369);
        areaRing.setStrokeStyle(lucky ? 5 : 2, lucky ? 0x7de0ff : 0x888888, lucky ? 0.32 : 0.16);
        areaRing.setBlendMode(Phaser.BlendModes.ADD);

        const debrisCount = lucky ? 16 : 4;
        for (let i = 0; i < debrisCount; i++) {
            const ex = this.add.sprite(
                impactX + Phaser.Math.Between(-220, 220),
                impactY + Phaser.Math.Between(-170, 170),
                'explosion_v2'
            ).setDepth(373).setScale(Phaser.Math.FloatBetween(0.7, 1.5)).setAlpha(0.92);
            this.tweens.add({
                targets: ex,
                scale: Phaser.Math.FloatBetween(2.6, 4.6),
                alpha: 0,
                duration: Phaser.Math.Between(520, 920),
                ease: 'Cubic.easeOut',
                onComplete: () => ex.destroy()
            });
        }

        if (lucky) {
            this.safePlaySound('snd_explosion', { volume: 0.65 });
            this.cameras.main.shake(580, 0.018);
            const megaBomb = this.add.sprite(impactX, impactY, 'big_bomb').setDepth(374).setScale(1.1).setAlpha(0.94);
            this.tweens.add({
                targets: megaBomb,
                scale: 6.3,
                alpha: 0,
                duration: 1700,
                ease: 'Cubic.easeOut',
                onComplete: () => megaBomb.destroy()
            });

            const lightning = this.add.graphics().setDepth(374);
            lightning.setBlendMode(Phaser.BlendModes.ADD);
            const bolts = 10;
            let burstTicks = 0;
            const burstEvent = this.time.addEvent({
                delay: 55,
                repeat: 8,
                callback: () => {
                    burstTicks++;
                    lightning.clear();
                    for (let b = 0; b < bolts; b++) {
                        const angle = (Math.PI * 2 * b) / bolts + Phaser.Math.FloatBetween(-0.25, 0.25);
                        const length = Phaser.Math.Between(240, 420);
                        const endX = impactX + Math.cos(angle) * length;
                        const endY = impactY + Math.sin(angle) * length;
                        const midX = (impactX + endX) * 0.5 + Phaser.Math.Between(-40, 40);
                        const midY = (impactY + endY) * 0.5 + Phaser.Math.Between(-40, 40);

                        lightning.lineStyle(3.2, 0x52b9ff, 0.85);
                        lightning.beginPath();
                        lightning.moveTo(impactX, impactY);
                        const steps = 7;
                        for (let s = 1; s <= steps; s++) {
                            const p = s / steps;
                            const oneMinus = 1 - p;
                            const lx = (oneMinus * oneMinus * impactX) + (2 * oneMinus * p * midX) + (p * p * endX);
                            const ly = (oneMinus * oneMinus * impactY) + (2 * oneMinus * p * midY) + (p * p * endY);
                            lightning.lineTo(lx, ly);
                        }
                        lightning.strokePath();

                        lightning.lineStyle(1.2, 0xd9f8ff, 0.98);
                        lightning.beginPath();
                        lightning.moveTo(impactX, impactY);
                        for (let s = 1; s <= steps; s++) {
                            const p = s / steps;
                            const oneMinus = 1 - p;
                            const lx = (oneMinus * oneMinus * impactX) + (2 * oneMinus * p * (midX + Phaser.Math.Between(-8, 8))) + (p * p * endX);
                            const ly = (oneMinus * oneMinus * impactY) + (2 * oneMinus * p * (midY + Phaser.Math.Between(-8, 8))) + (p * p * endY);
                            lightning.lineTo(lx, ly);
                        }
                        lightning.strokePath();
                    }
                    lightning.setAlpha(Math.max(0.2, 1 - (burstTicks * 0.14)));
                }
            });

            this.time.delayedCall(860, () => {
                burstEvent.remove(false);
                lightning.destroy();
            });
        } else {
            this.safePlaySound('snd_hit', { volume: 0.2, rate: 1.1 });
        }

        this.tweens.add({
            targets: [mainFlash, shockRing, impactGlow, areaRing],
            scale: lucky ? 12.8 : 5.2,
            alpha: 0,
            duration: lucky ? 1900 : 760,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                mainFlash.destroy();
                shockRing.destroy();
                impactGlow.destroy();
                areaRing.destroy();
            }
        });
    }
    private handleSocketConnected(data: any) {
        this.setNetworkStatusText('Connected. Syncing game data...');
    }

    private handleSocketConnectionError(error: any) {
        const reason = typeof error?.message === 'string' ? error.message : 'Connection refused';
        this.setNetworkStatusText(`Server offline: ${reason}`);
    }

    private handleSocketDisconnected(data: any) {
        const reason = data?.reason || 'disconnect';
        this.setNetworkStatusText(`Disconnected: ${reason}`);
        this.hasReceivedInitGame = false;
        this.pendingServerBetAmount = 0;
        this.activeLocalTorpedoTargetCounts.clear();
        this.deferredLocalTorpedoKills.clear();
    }

    private handlePlayerJoined(data: any) {
        if (data?.seatIndex === undefined || data.seatIndex < 0) return;
        this.seats[data.seatIndex] = {
            socketId: data.socketId,
            userId: data.userId,
            balance: data.balance ?? 0,
            energy: data.energy ?? 0
        };
        this.seatScores[data.seatIndex] = data.balance ?? 0;
        this.updateSeatsUI();
    }

    private handlePlayerLeft(data: any) {
        if (data?.seatIndex === undefined || data.seatIndex < 0) return;
        this.seats[data.seatIndex] = null;
        this.seatScores[data.seatIndex] = 0;
        this.updateSeatsUI();
    }

    private handleInitGame(data: any) {
        this.hasReceivedInitGame = true;
        this.pendingServerBetAmount = 0;
        this.score = data.balance;
        this.energy = data.energy;
        this.jiliJackpot = data.jackpot;
        this.isFrozen = data.isFrozen;
        this.mySeatIndex = data.mySeatIndex;
        if (data.seats) {
            this.seats = data.seats;
            data.seats.forEach((seat: any, index: number) => {
                if (seat) {
                    this.seatScores[index] = seat.balance ?? 0;
                    if (index === this.mySeatIndex) this.score = seat.balance ?? data.balance;
                }
            });
        }

        this.updateSeatsUI();
        this.updateScoreDisplay();
        this.updateJackpotDisplay();
        this.updateEnergyBar();
        this.setNetworkStatusText('', false);
    }

    private handleCurrentFish(fishList: any[]) {
        fishList.forEach(f => {
            const config = FISH_CONFIGS.find(cfg => cfg.key === f.type);
            if (config) {
                this.spawnFish(config, { id: f.id, x: f.x, y: f.y, side: f.side, skipWarning: true }, f);
            }
        });
    }
    private handleClearAllFish() {
        this.fishGroup.clear(true, true);
        this.activeLocalTorpedoTargetCounts.clear();
        this.deferredLocalTorpedoKills.clear();
    }
    private handleJackpotUpdate(value: number) { this.jiliJackpot = value; this.updateJackpotDisplay(); }
    private handleGameFrozen(data: any) { this.activateFrozenSkill(false); }
    private handleFishKilled(data: any) {
        const fish = this.fishGroup.getChildren().find(f => (f as Fish).getData('id') === data.fishId) as Fish;
        if (!fish) return;
        if (this.isOfflineMode) {
            const isLocal = data.killerId === this.network.getSocketId() || data.killerId === 'local_p1';
            this.killFish(fish, isLocal, data.killerId, data.winAmount);
            return;
        }
        const mySocketId = this.network?.getSocketId?.();
        const isLocalKiller = data.killerId === 'local_p1' || (!!mySocketId && data.killerId === mySocketId);
        if (isLocalKiller) {
            const inFlightCount = this.activeLocalTorpedoTargetCounts.get(data.fishId) || 0;
            if (inFlightCount > 0) {
                this.deferredLocalTorpedoKills.set(data.fishId, data);
                fish.setAlpha(0.8);
                return;
            }
        }
        this.killFish(fish, false, data.killerId, data.winAmount);
    }
    private handleShootResult(data: any) {
        const betAmount = Number(data?.betAmount || 0);
        if (betAmount > 0) {
            this.pendingServerBetAmount = Math.max(0, this.pendingServerBetAmount - betAmount);
        }

        if (data.rejected) {
            if (data.newBalance !== undefined) {
                this.score = data.newBalance;
                if (this.mySeatIndex !== -1) {
                    this.seatScores[this.mySeatIndex] = this.score;
                    if (this.seats[this.mySeatIndex]) {
                        this.seats[this.mySeatIndex].balance = this.score;
                    }
                }
                this.updateScoreDisplay();
            }
            if (data.reason === 'INSUFFICIENT_BALANCE') {
                this.setNetworkStatusText('Saldo tidak cukup untuk menembak.');
                this.time.delayedCall(1500, () => this.setNetworkStatusText('', false));
            }
            return;
        }

        if (data.newBalance !== undefined) {
            this.score = data.newBalance;
            if (this.mySeatIndex !== -1) {
                this.seatScores[this.mySeatIndex] = this.score;
                if (this.seats[this.mySeatIndex]) {
                    this.seats[this.mySeatIndex].balance = this.score;
                }
            }
            this.updateScoreDisplay();
            this.setNetworkStatusText('', false);
        }
    }
    private handleSeatBalanceUpdated(data: any) {
        if (data?.seatIndex === undefined || data?.balance === undefined) return;
        this.seatScores[data.seatIndex] = data.balance;
        if (this.seats[data.seatIndex]) {
            this.seats[data.seatIndex].balance = data.balance;
        }
        if (data.socketId === this.network.getSocketId()) {
            this.score = data.balance;
        }
        this.updateScoreDisplay();
    }
    private handleSpawnFish(fishData: any) {
        const config = FISH_CONFIGS.find(cfg => cfg.key === fishData.type);
        if (config) {
            this.spawnFish(config, { id: fishData.id, x: fishData.x, y: fishData.y, side: fishData.side }, fishData);
        }
    }
    private handleStageChanged(data: any) {}
    private handleJackpotWin(data: any) {
        if (data?.winnerId === this.network.getSocketId()) {
            this.playJackpotAnimation(data.amount);
        }
    }
    private handleEnergyUpdate(data: any) { this.energy = data.energy; this.updateEnergyBar(); }
    private handleLuckyOrbCast(data: any) {
        const activatorId = data?.activatorId || 'local_p1';
        const impactX = Number(data?.impactX ?? this.cameras.main.centerX);
        const impactY = Number(data?.impactY ?? this.cameras.main.centerY);
        const lucky = !!data?.lucky;
        this.playLuckyOrbCastVisual(activatorId, impactX, impactY, lucky);
    }
    private handleActionRejected(data: any) {
        const reason = String(data?.reason || 'ACTION_REJECTED');
        const map: Record<string, string> = {
            RATE_LIMIT_SHOOT: 'Tembakan terlalu cepat, tunggu sebentar.',
            RATE_LIMIT_ORB: 'Skill orb cooldown, coba lagi sebentar.',
            INVALID_BET_AMOUNT: 'Bet tidak valid.',
            INVALID_ORB_BET: 'Bet orb tidak valid.',
            UNAUTHORIZED_SOCKET_TOKEN: 'Token websocket tidak valid.'
        };
        const message = map[reason] || `Action rejected: ${reason}`;
        this.setNetworkStatusText(message);
        this.time.delayedCall(1400, () => this.setNetworkStatusText('', false));
    }
    private handleElectricCannonFired(data: any) {
        const activatorId = data?.activatorId || this.network.getSocketId() || 'local_p1';
        this.playLuckyOrbCastVisual(activatorId, this.cameras.main.centerX, this.cameras.main.centerY, true);
    }
}
