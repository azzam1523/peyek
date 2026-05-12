import * as Phaser from 'phaser';
import type { FishConfig, SpawnOptions } from '../config';
import MainGame from '../scenes/MainGame';

export default class Fish extends Phaser.Physics.Arcade.Sprite {
    public hp: number = 0;
    public score: number = 0;
    public isGoldenShark: boolean = false;
    private config: FishConfig;

    constructor(scene: MainGame, x: number, y: number, config: FishConfig, options: SpawnOptions = {}) {
        const textureKey = config.textureKey || config.key;
        super(scene, x, y, textureKey);

        this.config = config;
        this.score = config.score;
        this.isGoldenShark = config.key === 'sharkjumbo_v2';
        scene.add.existing(this);
        scene.physics.add.existing(this);
        scene.fishGroup.add(this);
        const animKey = config.key + '_anim';
        if (scene.anims.exists(animKey)) {
            this.play(animKey);
        }

        this.setScale(config.scale);
        this.setDepth(15);
        this.setInteractive();
        this.setData('facesRightByDefault', config.facesRightByDefault);
        if (this.body) {
            const body = this.body as Phaser.Physics.Arcade.Body;
            body.setSize(this.width * 0.7, this.height * 0.6);
            body.setOffset(this.width * 0.15, this.height * 0.2);
        }
        const speed = Phaser.Math.Between(config.speed.min, config.speed.max);
        const side = options.side || (x < scene.cameras.main.centerX ? 'left' : 'right');
        const diagonalDrift = Math.max(8, speed * 0.25);
        let vx = 0;
        let vy = 0;
        if (side === 'left') {
            vx = speed;
            vy = Phaser.Math.FloatBetween(-diagonalDrift, diagonalDrift);
        } else if (side === 'right') {
            vx = -speed;
            vy = Phaser.Math.FloatBetween(-diagonalDrift, diagonalDrift);
        } else if (side === 'top') {
            vy = speed;
            const bias = Phaser.Math.Clamp(
                (scene.cameras.main.centerX - x) / Math.max(1, scene.cameras.main.centerX),
                -1,
                1
            ) * diagonalDrift;
            vx = Phaser.Math.Clamp(
                Phaser.Math.FloatBetween(bias - (diagonalDrift * 0.35), bias + (diagonalDrift * 0.35)),
                -diagonalDrift,
                diagonalDrift
            );
        } else {
            vy = -speed;
            const bias = Phaser.Math.Clamp(
                (scene.cameras.main.centerX - x) / Math.max(1, scene.cameras.main.centerX),
                -1,
                1
            ) * diagonalDrift;
            vx = Phaser.Math.Clamp(
                Phaser.Math.FloatBetween(bias - (diagonalDrift * 0.35), bias + (diagonalDrift * 0.35)),
                -diagonalDrift,
                diagonalDrift
            );
        }
        if (this.isGoldenShark) {
            const horizontalSide = side === 'left' || side === 'right'
                ? side
                : (x < scene.cameras.main.centerX ? 'left' : 'right');
            const targetX = horizontalSide === 'left' ? scene.cameras.main.width + 100 : -100;
            scene.tweens.add({
                targets: this,
                x: targetX,
                duration: 10000 / (speed / 10),
                yoyo: true,
                repeat: 2,
                onYoyo: () => { this.setFlipX(!this.flipX); },
                onRepeat: () => { this.setFlipX(!this.flipX); },
                onComplete: () => {
                    if (this.active) {
                        this.destroy();
                    }
                }
            });
        } else {
            this.setVelocity(vx, vy);
        }

        const facingRight = vx >= 0;
        const shouldFlip = (facingRight && !config.facesRightByDefault) || (!facingRight && config.facesRightByDefault);
        this.setFlipX(shouldFlip);
    }

    public takeDamage(amount: number) {
        this.hp -= amount;
        this.setTint(0xffffff);
        this.scene.time.delayedCall(80, () => {
            if (this.active) {
                this.clearTint();
                if (this.isGoldenShark) this.setTint(0xffd84d);
            }
        });

        if (this.hp <= 0) {
            return true;
        }
        return false;
    }
}
