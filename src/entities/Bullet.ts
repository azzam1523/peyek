import * as Phaser from 'phaser';
import MainGame from '../scenes/MainGame';
import Fish from './Fish';

export default class Bullet extends Phaser.Physics.Arcade.Sprite {
    public isTorpedo: boolean = false;
    public isTargeted: boolean = false;
    public ownerId: string = 'local_p1';
    
    private torpedoTarget: Fish | null = null;
    private torpedoFlame?: Phaser.GameObjects.Sprite;
    private torpedoWaveGfx?: Phaser.GameObjects.Graphics;
    private bornAt: number = 0;
    private lastAimX: number = 0;
    private lastAimY: number = 0;
    private isArmed: boolean = false;
    private torpedoPhase: 'arc' = 'arc';
    private torpedoArcStartAt: number = 0;
    private torpedoArcDuration: number = 560;
    private torpedoLaunchX: number = 0;
    private torpedoLaunchY: number = 0;
    private torpedoArcControlX: number = 0;
    private torpedoArcControlY: number = 0;
    private torpedoTargetFishId: string = '';
    private torpedoLaunchScaleStart: number = 0.34;
    private torpedoLaunchScalePeak: number = 0.98;
    private torpedoCruiseScale: number = 0.74;
    private hasExploded: boolean = false;

    constructor(scene: MainGame, x: number, y: number, texture: string) {
        super(scene, x, y, texture);
        
        scene.add.existing(this);
        scene.physics.add.existing(this);
        scene.bullets.add(this);
        
        this.bornAt = scene.time.now;
    }

    public initStandard(angle: number, isTargeted: boolean, ownerId: string) {
        this.isTorpedo = false;
        this.isTargeted = isTargeted;
        this.ownerId = ownerId;
        this.setVisible(!isTargeted);
        this.setRotation(angle);
        
        this.setTexture(isTargeted ? 'bullet_laser' : 'bullet');
        this.setScale(0.3);
        
        if (this.body) {
            const body = this.body as Phaser.Physics.Arcade.Body;
            body.setSize(10, 10);
            if (isTargeted) {
                body.setCollideWorldBounds(false);
                body.setBounce(0, 0);
            } else {
                body.setCollideWorldBounds(true, 1, 1, true);
                body.setBounce(1, 1);
            }
            this.scene.physics.velocityFromRotation(angle, 1200, body.velocity);
        }
    }

    public initTorpedo(target: Fish | null, aimX: number, aimY: number, ownerId: string, targetFishId?: string) {
        this.isTorpedo = true;
        this.ownerId = ownerId;
        this.torpedoTarget = target;
        this.torpedoTargetFishId = targetFishId || (target ? (target.getData('id') || '') : '');
        this.lastAimX = aimX;
        this.lastAimY = aimY;
        this.isArmed = false;
        this.torpedoPhase = 'arc';
        this.torpedoArcStartAt = this.scene.time.now;
        this.torpedoLaunchX = this.x;
        this.torpedoLaunchY = this.y;
        const dx = aimX - this.torpedoLaunchX;
        const dy = aimY - this.torpedoLaunchY;
        const distance = Math.hypot(dx, dy);
        this.torpedoArcDuration = Phaser.Math.Clamp(Math.floor(distance * 0.62), 420, 780);
        const controlRise = Phaser.Math.Clamp((Math.abs(dx) * 0.28) + (Math.abs(dy) * 0.16) + 120, 140, 320);
        const controlBiasX = Phaser.Math.Clamp(dx * 0.2, -140, 140);
        this.torpedoArcControlX = ((this.torpedoLaunchX + aimX) * 0.5) + controlBiasX;
        this.torpedoArcControlY = Math.min(this.torpedoLaunchY, aimY) - controlRise;
        
        this.setTexture('torpedo_projectile');
        if (this.scene.textures.exists('torpedo_projectile_custom')) {
            this.setTexture('torpedo_projectile_custom', 0);
            if ((this.scene as MainGame).anims.exists('torpedo_projectile_spin')) {
                this.play('torpedo_projectile_spin');
            }
        }
        this.setScale(this.torpedoLaunchScaleStart);
        this.setDepth(48);

        if (this.body) {
            const body = this.body as Phaser.Physics.Arcade.Body;
            body.setSize(72, 24);
            body.setOffset(18, 34);
            
            const angle = Phaser.Math.Angle.Between(this.x, this.y, this.torpedoArcControlX, this.torpedoArcControlY);
            this.setRotation(angle);
            body.setVelocity(0, 0);
        }
        this.torpedoFlame = this.scene.add.sprite(this.x, this.y, 'torpedo_flame')
            .setDepth(47)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(0.46)
            .setAlpha(0.92);
        this.torpedoWaveGfx = this.scene.add.graphics().setDepth(46);
        this.torpedoWaveGfx.setBlendMode(Phaser.BlendModes.ADD);
        this.scene.time.delayedCall(120, () => {
            if (this.active) this.isArmed = true;
        });
    }

    preUpdate(time: number, delta: number) {
        super.preUpdate(time, delta);
        if (!this.active) return;
        if (!this.scene || !(this.scene as any).cameras?.main) return;

        if (this.isTorpedo) {
            this.updateTorpedo(time);
        } else {
            this.updateStandard();
        }
        if (!this.active) return;
        if (!this.scene || !(this.scene as any).cameras?.main) return;
        const cam = (this.scene as MainGame).cameras.main;
        if (this.x < -100 || this.x > cam.width + 100 || 
            this.y < -100 || this.y > cam.height + 100) {
            this.destroy();
        }
    }

    private updateTorpedo(time: number) {
        const body = this.body as Phaser.Physics.Arcade.Body;
        if (!body) return;

        const aimX = this.torpedoTarget && this.torpedoTarget.active ? this.torpedoTarget.x : this.lastAimX;
        const aimY = this.torpedoTarget && this.torpedoTarget.active ? this.torpedoTarget.y : this.lastAimY;
        
        this.lastAimX = aimX;
        this.lastAimY = aimY;

        const elapsed = time - this.torpedoArcStartAt;
        const t = Phaser.Math.Clamp(elapsed / this.torpedoArcDuration, 0, 1);
        const oneMinus = 1 - t;
        const endX = aimX;
        const endY = aimY;
        const px =
            (oneMinus * oneMinus * this.torpedoLaunchX) +
            (2 * oneMinus * t * this.torpedoArcControlX) +
            (t * t * endX);
        const py =
            (oneMinus * oneMinus * this.torpedoLaunchY) +
            (2 * oneMinus * t * this.torpedoArcControlY) +
            (t * t * endY);
        this.setPosition(px, py);

        const tangentX =
            (2 * oneMinus * (this.torpedoArcControlX - this.torpedoLaunchX)) +
            (2 * t * (endX - this.torpedoArcControlX));
        const tangentY =
            (2 * oneMinus * (this.torpedoArcControlY - this.torpedoLaunchY)) +
            (2 * t * (endY - this.torpedoArcControlY));
        this.setRotation(Math.atan2(tangentY, tangentX));
        body.setVelocity(0, 0);

        if (t <= 0.45) {
            const grow = Phaser.Math.Easing.Cubic.Out(t / 0.45);
            this.setScale(Phaser.Math.Linear(this.torpedoLaunchScaleStart, this.torpedoLaunchScalePeak, grow));
        } else {
            const settle = Phaser.Math.Easing.Cubic.Out((t - 0.45) / 0.55);
            this.setScale(Phaser.Math.Linear(this.torpedoLaunchScalePeak, this.torpedoCruiseScale, settle));
        }

        if (elapsed > 2600) {
            this.explode();
            return;
        }
        if (this.isArmed) {
            const dist = Phaser.Math.Distance.Between(this.x, this.y, aimX, aimY);
            if (dist < 50) {
                this.explode();
                return;
            }
        }
        if (this.torpedoFlame && this.torpedoFlame.active) {
            const tailOffset = 42 * this.scaleX;
            this.torpedoFlame.setPosition(
                this.x - Math.cos(this.rotation) * tailOffset,
                this.y - Math.sin(this.rotation) * tailOffset
            );
            this.torpedoFlame.setRotation(this.rotation + Math.PI);
            const flameBase = t <= 0.45 ? 0.9 : 0.7;
            this.torpedoFlame.setScale(flameBase + Math.random() * 0.12);
            const alphaBase = t <= 0.45 ? 0.9 : 0.76;
            this.torpedoFlame.setAlpha(alphaBase + Math.random() * 0.1);
        }
        this.drawTorpedoWave(time);
    }

    private drawTorpedoWave(time: number) {
        if (this.torpedoWaveGfx && this.torpedoWaveGfx.active) {
            const gfx = this.torpedoWaveGfx;
            gfx.clear();

            const pulse = 0.9 + Math.sin(time * 0.024) * 0.18;
            const noseOffset = 52 * this.scaleX;
            const dirX = Math.cos(this.rotation);
            const dirY = Math.sin(this.rotation);
            const perpX = -dirY;
            const perpY = dirX;

            const noseX = this.x + dirX * noseOffset;
            const noseY = this.y + dirY * noseOffset;
            const flameLen = (54 + (20 * pulse)) * this.scaleX;
            const flameWide = (22 + (8 * pulse)) * this.scaleX;
            const coreX = noseX + dirX * (flameLen * 0.42);
            const coreY = noseY + dirY * (flameLen * 0.42);
            const tipX = noseX + dirX * flameLen;
            const tipY = noseY + dirY * flameLen;

            const leftBaseX = noseX + perpX * flameWide;
            const leftBaseY = noseY + perpY * flameWide;
            const rightBaseX = noseX - perpX * flameWide;
            const rightBaseY = noseY - perpY * flameWide;

            const outerLeftX = noseX + perpX * (flameWide * 1.22) - dirX * (flameWide * 0.12);
            const outerLeftY = noseY + perpY * (flameWide * 1.22) - dirY * (flameWide * 0.12);
            const outerRightX = noseX - perpX * (flameWide * 1.22) - dirX * (flameWide * 0.12);
            const outerRightY = noseY - perpY * (flameWide * 1.22) - dirY * (flameWide * 0.12);
            const midLeftX = coreX + perpX * (flameWide * 0.58);
            const midLeftY = coreY + perpY * (flameWide * 0.58);
            const midRightX = coreX - perpX * (flameWide * 0.58);
            const midRightY = coreY - perpY * (flameWide * 0.58);

            gfx.fillStyle(0xff8b2a, 0.22);
            gfx.fillTriangle(tipX, tipY, outerLeftX, outerLeftY, outerRightX, outerRightY);
            gfx.fillStyle(0xffb347, 0.34);
            gfx.fillTriangle(tipX, tipY, midLeftX, midLeftY, midRightX, midRightY);
            gfx.fillStyle(0xffd77f, 0.46);
            gfx.fillTriangle(tipX - (dirX * 4), tipY - (dirY * 4), leftBaseX, leftBaseY, rightBaseX, rightBaseY);

            gfx.fillStyle(0xffe57a, 0.42);
            gfx.fillEllipse(coreX, coreY, flameWide * 1.4, flameWide * 0.9);

            gfx.fillStyle(0xfff2b8, 0.7);
            gfx.fillEllipse(tipX - (dirX * 3), tipY - (dirY * 3), flameWide * 0.62, flameWide * 0.42);

            for (let i = 0; i < 3; i++) {
                const sparkT = 0.34 + (i * 0.22);
                const sx = noseX + dirX * (flameLen * sparkT) + perpX * Phaser.Math.Between(-6, 6);
                const sy = noseY + dirY * (flameLen * sparkT) + perpY * Phaser.Math.Between(-6, 6);
                gfx.fillStyle(0xffd166, 0.42 - (i * 0.09));
                gfx.fillCircle(sx, sy, Phaser.Math.FloatBetween(2.5, 4.6));
            }
        }
    }

    private updateStandard() {
        const body = this.body as Phaser.Physics.Arcade.Body;
        if (body && (Math.abs(body.velocity.x) + Math.abs(body.velocity.y)) > 8) {
            this.setRotation(Math.atan2(body.velocity.y, body.velocity.x));
        }
    }

    public explode() {
        if (this.hasExploded) return;
        this.hasExploded = true;

        const sceneRef = this.scene as MainGame | undefined;
        if (!sceneRef || !sceneRef.sys || !sceneRef.add || !sceneRef.time) {
            this.destroy();
            return;
        }

        const hasCustomExplosion = sceneRef.textures.exists('torpedo_explosion_custom') && sceneRef.anims.exists('torpedo_explosion_burst');
        if (hasCustomExplosion) {
            const spawnBurst = (x: number, y: number, scale: number, alpha: number, delay: number) => {
                sceneRef.time.delayedCall(delay, () => {
                    if (!sceneRef.sys || !sceneRef.sys.isActive() || !sceneRef.add) return;
                    const burst = sceneRef.add.sprite(x, y, 'torpedo_explosion_custom', 0).setDepth(41).setScale(scale).setAlpha(alpha);
                    burst.play('torpedo_explosion_burst');
                    burst.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => burst.destroy());
                });
            };

            spawnBurst(this.x, this.y, 0.9, 0.95, 0);
            spawnBurst(this.x + Phaser.Math.Between(-24, 24), this.y + Phaser.Math.Between(-18, 18), 0.72, 0.85, 60);
            spawnBurst(this.x + Phaser.Math.Between(-30, 30), this.y + Phaser.Math.Between(-24, 24), 0.62, 0.8, 110);
        } else {
            const exp = sceneRef.add.sprite(this.x, this.y, 'explosion_v2').setDepth(41).setScale(1.2);
            sceneRef.tweens.add({ targets: exp, scale: 3, alpha: 0, duration: 500, onComplete: () => exp.destroy() });
        }
        (sceneRef as any).safePlaySound('snd_explosion', { volume: 0.5 });
        this.destroy();
    }

    public getIsArmed(): boolean {
        return this.isArmed || !this.isTorpedo;
    }

    public getTargetFishId(): string {
        return this.torpedoTargetFishId;
    }

    destroy(fromScene?: boolean) {
        if (this.torpedoFlame) {
            this.torpedoFlame.destroy();
        }
        if (this.torpedoWaveGfx) {
            this.torpedoWaveGfx.destroy();
        }
        super.destroy(fromScene);
    }
}
