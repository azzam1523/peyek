import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import crypto from 'crypto';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Izinkan semua origin untuk development
        methods: ["GET", "POST"]
    }
});

interface Fish {
    id: string;
    type: string;
    hp: number;
    maxHp: number;
    score: number;
    spawnTime: number;
}

// State Game (In-Memory untuk awal, nantinya pindah ke Redis/Database)
const activeFish: Map<string, Fish> = new Map();
const playerBalances: Map<string, number> = new Map();
let globalJackpot = 88888.88;
let gameFrozenUntil = 0;

// Konfigurasi Ikan (Lengkap sesuai Frontend)
const FISH_CONFIGS: Record<string, { hp: number, score: number, probability: number }> = {
    'fish1': { hp: 1, score: 0.02, probability: 0.4 },
    'fish2': { hp: 2, score: 0.05, probability: 0.2 },
    'fish3': { hp: 3, score: 0.10, probability: 0.15 },
    'fish4': { hp: 4, score: 0.20, probability: 0.1 },
    'fish5': { hp: 5, score: 0.30, probability: 0.08 },
    'fish6': { hp: 6, score: 0.50, probability: 0.05 },
    'fish7': { hp: 7, score: 1.00, probability: 0.03 },
    'fish8': { hp: 8, score: 2.00, probability: 0.02 },
    'fish9': { hp: 9, score: 5.00, probability: 0.015 },
    'fish10': { hp: 10, score: 10.00, probability: 0.01 },
    'shark1': { hp: 50, score: 50.00, probability: 0.005 },
    'shark2': { hp: 100, score: 100.00, probability: 0.002 },
    'sharkjumbo': { hp: 500, score: 500.00, probability: 0.005 }
};

// Fungsi RNG Terenkripsi (Standar Sertifikasi)
function secureRandom(): number {
    return crypto.randomBytes(4).readUInt32BE() / 0xffffffff;
}

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    
    // Inisialisasi saldo (Simulasi)
    playerBalances.set(socket.id, 2000.00);
    socket.emit('init-game', {
        balance: 2000.00,
        jackpot: globalJackpot,
        isFrozen: Date.now() < gameFrozenUntil
    });

    // Kirim ikan yang sudah ada ke player baru
    socket.emit('current-fish', Array.from(activeFish.values()));

    socket.on('shoot', (data: { fishId: string, betAmount: number, isTorpedo?: boolean }) => {
        const { fishId, betAmount, isTorpedo } = data;
        let balance = playerBalances.get(socket.id) || 0;

        if (balance < betAmount) {
            socket.emit('error', 'Saldo tidak cukup');
            return;
        }

        // 1. Potong Saldo & Tambah Jackpot (Kecil)
        balance -= betAmount;
        globalJackpot += (betAmount * 0.01); // 1% masuk jackpot
        playerBalances.set(socket.id, balance);

        // 2. Cek Ikan
        const fish = activeFish.get(fishId);
        if (!fish) {
            socket.emit('shoot-result', { fishId, hit: false, killed: false, newBalance: balance });
            return;
        }

        // 3. Logika Hit/Kill (RNG di Server)
        const rand = secureRandom();
        
        // Torpedo punya probabilitas 6x lebih besar untuk membunuh
        const multiplier = isTorpedo ? 6 : 1;
        const killProbability = (1 / (fish.maxHp / 2)) * multiplier; 
        
        let killed = false;
        let winAmount = 0;

        if (rand < killProbability) {
            killed = true;
            winAmount = fish.score;
            balance += winAmount;
            playerBalances.set(socket.id, balance);
            activeFish.delete(fishId);
            
            // Broadcast ke semua bahwa ikan mati
            io.emit('fish-killed', { fishId, killerId: socket.id, winAmount });
        }

        // Kirim hasil ke penembak
        socket.emit('shoot-result', { 
            fishId, 
            hit: true, 
            killed, 
            newBalance: balance,
            winAmount 
        });
    });

    socket.on('activate-frozen', (data: { cost: number }) => {
        let balance = playerBalances.get(socket.id) || 0;
        if (balance >= data.cost) {
            balance -= data.cost;
            playerBalances.set(socket.id, balance);
            
            gameFrozenUntil = Date.now() + 5000; // Beku 5 detik
            io.emit('game-frozen', { duration: 5000, newBalance: balance, activatorId: socket.id });
        }
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        playerBalances.delete(socket.id);
    });
});

// Update Jackpot Global secara berkala
setInterval(() => {
    globalJackpot += 0.05;
    io.emit('jackpot-update', globalJackpot);
}, 1000);

// Loop untuk Spawn Ikan (Server-Side Decision dengan Probabilitas)
setInterval(() => {
    // Ikan tidak spawn jika game sedang beku
    if (Date.now() < gameFrozenUntil) return;

    if (activeFish.size < 20) {
        const rand = secureRandom();
        let cumulative = 0;
        let selectedType = 'fish1';

        for (const [type, config] of Object.entries(FISH_CONFIGS)) {
            cumulative += config.probability;
            if (rand < cumulative) {
                selectedType = type;
                break;
            }
        }

        const config = FISH_CONFIGS[selectedType];
        
        const newFish: Fish = {
            id: crypto.randomUUID(),
            type: selectedType,
            hp: config.hp * 10,
            maxHp: config.hp * 10,
            score: config.score,
            spawnTime: Date.now()
        };

        activeFish.set(newFish.id, newFish);
        io.emit('spawn-fish', newFish);
    }
}, 1500);

const PORT = 3000;
httpServer.listen(PORT, () => {
    console.log(`Game Server running on http://localhost:${PORT}`);
});
