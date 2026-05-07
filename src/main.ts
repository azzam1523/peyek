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

/**
 * Menghitung skala CSS untuk mode portrait di mobile.
 * Canvas Phaser berukuran 1280 x 720 (landscape).
 * Saat diputar -90°:
 *   - Lebar visual = tinggi canvas asli = 720px  → harus fit dalam window.innerWidth
 *   - Tinggi visual = lebar canvas asli = 1280px → harus fit dalam window.innerHeight
 * Scale = min(innerWidth / 720, innerHeight / 1280)
 */
const GAME_W = 1280;
const GAME_H = 720;

const applyGameScale = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isPortrait = vh > vw;

    // Tunggu canvas Phaser tersedia
    const canvas = document.querySelector<HTMLCanvasElement>('#app canvas');
    if (!canvas) {
        setTimeout(applyGameScale, 100);
        return;
    }

    // Reset style dasar
    canvas.style.position = 'absolute';
    canvas.style.top = '50%';
    canvas.style.left = '50%';

    if (isPortrait) {
        // Mode Portrait Mobile: Tetap seperti sebelumnya (Letterbox di tengah)
        // Agar terlihat seperti landscape yang pas di lebar HP
        const scale = vw / GAME_W; // Scale berdasarkan lebar layar
        canvas.style.transform = `translate(-50%, -50%) scale(${scale})`;
    } else {
        // Mode Desktop/Laptop (Landscape): FULL layar tanpa bar hitam
        // Kita paksa scale X dan Y mengikuti ukuran window agar mengisi penuh
        const scaleX = vw / GAME_W;
        const scaleY = vh / GAME_H;
        canvas.style.transform = `translate(-50%, -50%) scale(${scaleX}, ${scaleY})`;
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
    scene: [Preloader, MainGame]
};

const game = new Phaser.Game(config);

// Re-apply scale setelah Phaser selesai boot dan canvas sudah ada di DOM
game.events.once(Phaser.Core.Events.BOOT, () => {
    setTimeout(applyGameScale, 200);
});
