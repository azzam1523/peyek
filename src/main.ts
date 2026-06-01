import * as Phaser from 'phaser';
import Preloader from './scenes/Preloader';
import Lobby from './scenes/Lobby';
import MainGame from './scenes/MainGame';
import './style.css';

const hardenClientSurface = () => {
    window.addEventListener('contextmenu', (event) => {
        event.preventDefault();
    });
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

const GAME_W = 1280;
const GAME_H = 720;

const applyGameScale = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isPortrait = vh > vw;
    const canvas = document.querySelector<HTMLCanvasElement>('#app canvas');
    const domContainers = document.querySelectorAll<HTMLElement>('#app .phaser-dom-container');
    const uiOverlays = document.querySelectorAll<HTMLElement>('#app .afs-ui-overlay');
    if (!canvas) {
        setTimeout(applyGameScale, 100);
        return;
    }
    canvas.style.position = 'absolute';
    canvas.style.top = '50%';
    canvas.style.left = '50%';

    if (isPortrait) {
        const scale = vw / GAME_W;
        const transform = `translate(-50%, -50%) scale(${scale})`;
        canvas.style.transform = transform;
        domContainers.forEach((domContainer) => {
            domContainer.style.position = 'absolute';
            domContainer.style.top = '50%';
            domContainer.style.left = '50%';
            domContainer.style.width = `${GAME_W}px`;
            domContainer.style.height = `${GAME_H}px`;
            domContainer.style.transformOrigin = 'center center';
            domContainer.style.transform = transform;
        });
        uiOverlays.forEach((overlay) => {
            overlay.style.position = 'absolute';
            overlay.style.top = '50%';
            overlay.style.left = '50%';
            overlay.style.width = `${GAME_W}px`;
            overlay.style.height = `${GAME_H}px`;
            overlay.style.transformOrigin = 'center center';
            overlay.style.transform = transform;
        });
    } else {
        const scaleX = vw / GAME_W;
        const scaleY = vh / GAME_H;
        const transform = `translate(-50%, -50%) scale(${scaleX}, ${scaleY})`;
        canvas.style.transform = transform;
        domContainers.forEach((domContainer) => {
            domContainer.style.position = 'absolute';
            domContainer.style.top = '50%';
            domContainer.style.left = '50%';
            domContainer.style.width = `${GAME_W}px`;
            domContainer.style.height = `${GAME_H}px`;
            domContainer.style.transformOrigin = 'center center';
            domContainer.style.transform = transform;
        });
        uiOverlays.forEach((overlay) => {
            overlay.style.position = 'absolute';
            overlay.style.top = '50%';
            overlay.style.left = '50%';
            overlay.style.width = `${GAME_W}px`;
            overlay.style.height = `${GAME_H}px`;
            overlay.style.transformOrigin = 'center center';
            overlay.style.transform = transform;
        });
    }
};

applyGameScale();
window.addEventListener('resize', applyGameScale);
window.addEventListener('orientationchange', () => {
    setTimeout(applyGameScale, 150);
});

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 1280,
    height: 720,
    parent: 'app',
    scale: {
        mode: Phaser.Scale.NONE,
        autoCenter: Phaser.Scale.NO_CENTER,
        width: 1280,
        height: 720
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: 0 },
            debug: false
        }
    },
    dom: {
        createContainer: true
    },
    scene: [Preloader, Lobby, MainGame]
};

const game = new Phaser.Game(config);
game.events.once(Phaser.Core.Events.BOOT, () => {
    setTimeout(applyGameScale, 200);
});
