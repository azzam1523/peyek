import * as Phaser from 'phaser';
import Preloader from './scenes/Preloader';
import MainGame from './scenes/MainGame';
import './style.css';

const hardenClientSurface = () => {
    // Blok menu klik kanan
    window.addEventListener('contextmenu', (event) => {
        event.preventDefault();
    });

    // Blok shortcut umum untuk membuka DevTools / view source
    window.addEventListener('keydown', (event) => {
        const key = event.key.toLowerCase();
        const ctrlOrMeta = event.ctrlKey || event.metaKey;
        const shift = event.shiftKey;

        const blocked =
            key === 'f12' ||
            (ctrlOrMeta && shift && (key === 'i' || key === 'j' || key === 'c')) ||
            (ctrlOrMeta && key === 'u');

        if (blocked) {
            event.preventDefault();
            event.stopPropagation();
        }
    }, true);
};

hardenClientSurface();

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 1280,
    height: 720,
    parent: 'app',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 1280,
        height: 720,
        expandParent: true
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: 0 },
            debug: false
        }
    },
    scene: [Preloader, MainGame]
};

const game = new Phaser.Game(config);
