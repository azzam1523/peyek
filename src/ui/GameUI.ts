import * as Phaser from 'phaser';
import MainGame from '../scenes/MainGame';
import { UI_FONT_FAMILY, DEFAULT_BET } from '../config';

export default class GameUI {
    public scene: MainGame;
    public seatPanels: (Phaser.GameObjects.Container | null)[] = [null, null, null];
    public seatScoreTexts: (Phaser.GameObjects.Text | null)[] = [null, null, null];
    public seatBetTexts: (Phaser.GameObjects.Text | null)[] = [null, null, null];
    public seatWaitingLabels: (Phaser.GameObjects.Container | null)[] = [null, null, null];
    public seatBetMinusBtns: (Phaser.GameObjects.Container | null)[] = [null, null, null];
    public seatBetPlusBtns: (Phaser.GameObjects.Container | null)[] = [null, null, null];
    
    private jackpotSpeedText!: Phaser.GameObjects.Text;
    private jackpotJiliText!: Phaser.GameObjects.Text;
    private jackpotLuckyText!: Phaser.GameObjects.Text;
    private jackpotMainText!: Phaser.GameObjects.Text;
    
    private energyBarGfx!: Phaser.GameObjects.Graphics;
    
    public targetBtnBg!: Phaser.GameObjects.Shape;
    public torpedoBtnBg!: Phaser.GameObjects.Shape;
    public autoBtnBg!: Phaser.GameObjects.Shape;

    constructor(scene: MainGame) {
        this.scene = scene;
    }

    public setup() {
        const w = this.scene.cameras.main.width;
        const h = this.scene.cameras.main.height;
        const isMobile = h < 600 || w < 1000;
        const uiScale = isMobile ? 0.75 : 1.0;

        this.setupJackpotBars(w, h, uiScale);
        this.setupSkillButtons(w, h, uiScale);
        this.setupPlayerPanels(w, h, uiScale);
        this.setupWaitingLabels(w, h, uiScale);
    }

    private setupJackpotBars(w: number, h: number, uiScale: number) {
        const cx = w / 2;
        const topY = 45 * uiScale;
        const gap = 210 * uiScale;

        const createBar = (x: number, label: string, color: number) => {
            const container = this.scene.add.container(x, topY).setDepth(100);
            const bg = this.scene.add.graphics();
            bg.fillStyle(0x000000, 0.7).lineStyle(2, color);
            bg.fillRoundedRect(-100 * uiScale, -20 * uiScale, 200 * uiScale, 40 * uiScale, 8);
            bg.strokeRoundedRect(-100 * uiScale, -20 * uiScale, 200 * uiScale, 40 * uiScale, 8);
            
            const title = this.scene.add.text(0, -28 * uiScale, label, { 
                fontFamily: UI_FONT_FAMILY, fontSize: (10 * uiScale) + 'px', color: '#fff', fontStyle: 'bold' 
            }).setOrigin(0.5);
            
            const val = this.scene.add.text(0, 0, '0.00', { 
                fontFamily: UI_FONT_FAMILY, fontSize: (18 * uiScale) + 'px', color: '#ffd700', fontStyle: 'bold' 
            }).setOrigin(0.5);
            
            container.add([bg, title, val]);
            return val;
        };

        this.jackpotSpeedText = createBar(cx - gap, 'GRAND JACKPOT', 0xff0000);
        this.jackpotJiliText = createBar(cx, 'JILI JACKPOT', 0xffea00);
        this.jackpotLuckyText = createBar(cx + gap, 'MEGA JACKPOT', 0x00ffff);
    }

    private setupSkillButtons(w: number, h: number, uiScale: number) {
        const rightX = w - (60 * uiScale);
        const startY = 100 * uiScale;
        const gapY = 80 * uiScale;

        const createBtn = (y: number, label: string, iconKey: string, callback: () => void) => {
            const radius = 35 * uiScale;
            const bg = this.scene.add.circle(rightX, y, radius, 0x001133, 0.7).setStrokeStyle(3 * uiScale, 0x0088ff).setDepth(29);
            this.scene.add.image(rightX, y - (5 * uiScale), iconKey).setDepth(31).setScale(0.6 * uiScale);
            this.scene.add.text(rightX, y + (22 * uiScale), label, { 
                fontFamily: UI_FONT_FAMILY, fontSize: (11 * uiScale) + 'px', color: '#fff', fontStyle: 'bold' 
            }).setOrigin(0.5).setDepth(31);
            
            const btn = this.scene.add.circle(rightX, y, radius, 0, 0.01).setInteractive().setDepth(32);
            btn.on('pointerdown', callback);
            return bg;
        };

        this.targetBtnBg = createBtn(startY, 'Target', 'icon_target', () => this.scene.toggleTargetMode());
        this.torpedoBtnBg = createBtn(startY + gapY, 'Torpedo', 'icon_torpedo', () => this.scene.toggleTorpedoMode());
        this.autoBtnBg = createBtn(startY + gapY * 2, 'Auto Fishing', 'icon_auto', () => this.scene.toggleAutoMode());
        createBtn(startY + gapY * 3, 'Frozen', 'icon_frozen', () => this.scene.activateFrozenSkill(true));
    }

    private setupPlayerPanels(w: number, h: number, uiScale: number) {
        const p1X = 250 * uiScale;
        const p2X = w - (250 * uiScale);
        const midY = h - (45 * uiScale);

        const configs = [
            { x: p1X, y: midY },
            { x: w / 2, y: midY },
            { x: p2X, y: midY }
        ];

        configs.forEach((cfg, i) => {
            this.seatPanels[i] = this.createPlayerPanel(i, cfg.x, cfg.y, uiScale);
        });
    }

    private createPlayerPanel(index: number, x: number, y: number, uiScale: number) {
        const container = this.scene.add.container(x, y).setDepth(30);
        const bW = 200 * uiScale;
        const bH = 40 * uiScale;

        const bg = this.scene.add.graphics();
        bg.fillStyle(0x001133, 0.9).lineStyle(2, 0xffd700);
        bg.fillRoundedRect(-bW/2, -bH/2, bW, bH, 20 * uiScale);
        bg.strokeRoundedRect(-bW/2, -bH/2, bW, bH, 20 * uiScale);
        container.add(bg);
        const scoreVal = this.scene.add.text(0, 35 * uiScale, '0.00', { 
            fontFamily: UI_FONT_FAMILY, fontSize: (16 * uiScale) + 'px', color: '#ffd700', fontStyle: 'bold' 
        }).setOrigin(0.5).setDepth(31);
        const betVal = this.scene.add.text(0, 0, DEFAULT_BET.toFixed(2), { 
            fontFamily: UI_FONT_FAMILY, fontSize: (18 * uiScale) + 'px', color: '#00f2ff', fontStyle: 'bold' 
        }).setOrigin(0.5).setDepth(31);

        const createBetButton = (bx: number, iconKey: string, onClick: () => void) => {
            const btnContainer = this.scene.add.container(bx, 0);
            const icon = this.scene.add.image(0, 0, iconKey).setScale(1.36 * uiScale).setDepth(31);
            const hit = this.scene.add.circle(0, 0, 52 * uiScale, 0, 0.01).setInteractive();
            hit.on('pointerdown', onClick);
            btnContainer.add([icon, hit]);
            return btnContainer;
        };

        const sideOffset = (bW / 2) + (26 * uiScale);
        const minusBtn = createBetButton(-sideOffset, 'cannon_minus', () => this.scene.decreaseBet());
        const plusBtn = createBetButton(sideOffset, 'cannon_plus', () => this.scene.increaseBet());
        minusBtn.setVisible(index === 0);
        plusBtn.setVisible(index === 0);
        
        container.add([scoreVal, betVal, minusBtn, plusBtn]);
        this.seatScoreTexts[index] = scoreVal;
        this.seatBetTexts[index] = betVal;
        this.seatBetMinusBtns[index] = minusBtn;
        this.seatBetPlusBtns[index] = plusBtn;

        return container;
    }

    private setupWaitingLabels(w: number, h: number, uiScale: number) {
        const seatPositions = [
            { x: 250 * uiScale, y: h - (50 * uiScale) },
            { x: w / 2, y: h - (50 * uiScale) },
            { x: w - (250 * uiScale), y: h - (50 * uiScale) }
        ];

        for (let i = 0; i < 3; i++) {
            const pos = seatPositions[i];
            const container = this.scene.add.container(pos.x, pos.y).setDepth(20);
            
            const bg = this.scene.add.graphics();
            bg.fillStyle(0x001133, 0.7).fillRoundedRect(-65 * uiScale, -12 * uiScale, 130 * uiScale, 25 * uiScale, 10);
            
            const label = this.scene.add.text(0, 0, 'WAITING TO JOIN', {
                fontFamily: UI_FONT_FAMILY, fontSize: (12 * uiScale) + 'px', color: '#00ffff', fontStyle: 'bold'
            }).setOrigin(0.5);

            container.add([bg, label]);
            this.seatWaitingLabels[i] = container;
        }
    }

    public updateSeatStatus(index: number, player: any, isLocal: boolean) {
        const waiting = this.seatWaitingLabels[index];
        const panel = this.seatPanels[index];
        
        if (player) {
            if (waiting) waiting.setVisible(false);
            if (panel) {
                panel.setVisible(true);
            }
            this.seatBetMinusBtns[index]?.setVisible(isLocal);
            this.seatBetPlusBtns[index]?.setVisible(isLocal);
        } else {
            if (waiting) waiting.setVisible(true);
            if (panel) panel.setVisible(false);
            this.seatBetMinusBtns[index]?.setVisible(false);
            this.seatBetPlusBtns[index]?.setVisible(false);
        }
    }

    public updateScore(index: number, amount: number) {
        if (this.seatScoreTexts[index]) {
            this.seatScoreTexts[index]!.setText(amount.toLocaleString('en-US', { minimumFractionDigits: 2 }));
        }
    }

    public updateBet(index: number, amount: number) {
        if (this.seatBetTexts[index]) {
            this.seatBetTexts[index]!.setText(amount.toFixed(2));
        }
    }

    public updateJackpots(speed: number, jili: number, lucky: number) {
        this.jackpotSpeedText.setText(speed.toFixed(2));
        this.jackpotJiliText.setText(jili.toFixed(2));
        this.jackpotLuckyText.setText(lucky.toFixed(2));
    }
}
