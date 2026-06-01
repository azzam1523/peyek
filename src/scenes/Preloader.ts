import * as Phaser from 'phaser';

export default class Preloader extends Phaser.Scene {
    constructor() {
        super('Preloader');
    }

    preload() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        
        const progressBar = this.add.graphics();
        const progressBox = this.add.graphics();
        progressBox.fillStyle(0x222222, 0.8);
        progressBox.fillRect(width / 2 - 160, height / 2 - 25, 320, 50);

        const loadingText = this.make.text({
            x: width / 2,
            y: height / 2 - 50,
            text: 'Loading...',
            style: {
                font: '20px monospace',
                color: '#ffffff'
            }
        });
        loadingText.setOrigin(0.5, 0.5);

        this.load.on('progress', (value: number) => {
            console.log('Loading progress:', value);
            progressBar.clear();
            progressBar.fillStyle(0x00f2ff, 1);
            progressBar.fillRect(width / 2 - 150, height / 2 - 15, 300 * value, 30);
        });

        this.load.on('filecomplete', (key: string) => {
            console.log('File loaded:', key);
        });

        this.load.on('complete', () => {
            console.log('Loading complete!');
            progressBar.destroy();
            progressBox.destroy();
            loadingText.destroy();
        });

        this.load.on('loaderror', (file: any) => {
            console.error('Error loading file:', file.key, file.src);
        });
        this.load.image('background', 'assets/background.png');
        this.load.image('game_bg', 'assets/coolfish/game_bg.jpg');
        this.load.audio('snd_shoot', 'assets/sound/pistol.wav');
        this.load.audio('snd_triple', 'assets/sound/shotgun.wav');
        this.load.audio('snd_hit', 'assets/sound/squit.wav');
        this.load.audio('snd_click', 'assets/sound/click.mp3');
        this.load.audio('snd_coin', 'assets/sound/p-ping.mp3');
        this.load.audio('snd_coin_drop', 'assets/sound/coint.mp3');
        this.load.audio('snd_coin_enter', 'assets/sound/enter_coint.mp3');
        this.load.audio('snd_jackpot', 'assets/sound/pickup.wav');
        this.load.audio('snd_explosion', 'assets/sound/explosion.mp3');
        this.load.audio('bgm', 'assets/sound/backsound.mp3');
        this.load.audio('bgm_golden_shark', 'assets/sound/golden_shark_enter.mp3');
        this.load.audio('snd_golden_shark_spawn', 'assets/sound/sound_raja_masuk.mp3');
        this.load.audio('snd_laser_fire_start', 'assets/sound/sound_lazer.mp3');
        this.load.audio('snd_laser_fire_loop', 'assets/sound/sound_lazer2.mp3');
        this.load.audio('snd_incoming_golden_shark', 'assets/sound/incoming_golden_shark.mp3');
        this.load.audio('snd_scene_wave', 'assets/sound/sound_ganti_scene.mp3');
        this.load.audio('snd_scene_crash', 'assets/sound/sound_ganti_scene2.mp3');
        this.load.image('bullet', 'assets/coolfish/muzzle.png');
        this.load.image('bullet_laser', 'assets/animations/lazer_blue.png');
        this.load.image('muzzle', 'assets/coolfish/muzzle.png');
        this.load.image('explosion_v2', 'assets/coolfish/explosion_v2.png');
        this.load.image('web', 'assets/coolfish/web.png');
        this.load.spritesheet('coinAni1', 'assets/coolfish/coinAni1.png', { frameWidth: 60, frameHeight: 60 });
        this.load.spritesheet('coinAni2', 'assets/coolfish/coinAni2.png', { frameWidth: 60, frameHeight: 60 });
        this.load.image('bottomBar', 'assets/coolfish/bottomBar.png');
        this.load.spritesheet('cannon1', 'assets/coolfish/cannon1.png', { frameWidth: 74, frameHeight: 74 });
        this.load.spritesheet('cannon2', 'assets/coolfish/cannon2.png', { frameWidth: 74, frameHeight: 76 });
        this.load.spritesheet('cannon3', 'assets/coolfish/cannon3.png', { frameWidth: 74, frameHeight: 76 });
        this.load.spritesheet('cannon4', 'assets/coolfish/cannon4.png', { frameWidth: 74, frameHeight: 83 });
        this.load.spritesheet('cannon5', 'assets/coolfish/cannon5.png', { frameWidth: 74, frameHeight: 85 });
        this.load.spritesheet('cannon6', 'assets/coolfish/cannon7.png', { frameWidth: 74, frameHeight: 90 });
        this.load.spritesheet('cannon7', 'assets/coolfish/cannon7.png', { frameWidth: 74, frameHeight: 94 });
        this.load.spritesheet('fish1', 'assets/coolfish/fish1.png', { frameWidth: 55, frameHeight: 37 });
        this.load.spritesheet('fish2', 'assets/coolfish/fish2.png', { frameWidth: 78, frameHeight: 64 });
        this.load.spritesheet('fish3', 'assets/coolfish/fish3.png', { frameWidth: 72, frameHeight: 56 });
        this.load.spritesheet('fish4', 'assets/coolfish/fish4.png', { frameWidth: 77, frameHeight: 59 });
        this.load.spritesheet('fish5', 'assets/coolfish/fish5.png', { frameWidth: 107, frameHeight: 122 });
        this.load.spritesheet('fish6', 'assets/coolfish/fish6.png', { frameWidth: 105, frameHeight: 79 });
        this.load.spritesheet('fish7', 'assets/coolfish/fish7.png', { frameWidth: 92, frameHeight: 151 });
        this.load.spritesheet('fish8', 'assets/coolfish/fish8.png', { frameWidth: 174, frameHeight: 126 });
        this.load.spritesheet('fish9', 'assets/coolfish/fish9.png', { frameWidth: 166, frameHeight: 183 });
        this.load.spritesheet('fish10', 'assets/coolfish/fish10.png', { frameWidth: 178, frameHeight: 187 });
        this.load.spritesheet('shark1', 'assets/coolfish/shark1.png', { frameWidth: 509, frameHeight: 270 });
        this.load.spritesheet('shark2', 'assets/coolfish/shark2.png', { frameWidth: 516, frameHeight: 273 });
        this.load.image('sharkjumbo_v2', 'assets/coolfish/sharkjumbo.png');
        this.load.image('icon_frozen', 'assets/coolfish/30.webp');
        this.load.image('icon_auto', 'assets/coolfish/31.webp');
        this.load.image('icon_torpedo', 'assets/coolfish/32.webp');
        this.load.image('icon_target', 'assets/coolfish/35.webp');
        this.load.image('cannon_plus', 'assets/coolfish/cannonPlus.png');
        this.load.image('cannon_minus', 'assets/coolfish/cannonMinus.png');
        this.load.image('joy_hall', 'assets/coolfish/36.webp');
        this.load.image('btn_play', 'assets/coolfish/28.webp');
        this.load.image('bg_mentah', 'assets/coolfish/bg1.webp');
        this.load.image('big_bomb', 'assets/coolfish/ledakan.png');
        this.load.image('ganti_scene', 'assets/coolfish/ganti_scene.webp');
        this.load.spritesheet('torpedo_projectile_custom', 'assets/coolfish/torpedo_projectile_sheet.png', { frameWidth: 100, frameHeight: 80 });
        this.load.spritesheet('torpedo_explosion_custom', 'assets/coolfish/torpedo_explosion_sheet.png', { frameWidth: 199, frameHeight: 187 });
    }

    create() {
        this.scene.start('Lobby');
    }
}
