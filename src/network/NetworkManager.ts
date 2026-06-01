import { io, Socket } from 'socket.io-client';

export default class NetworkManager {
    private socket!: Socket;
    private scene: any;
    private authOverride: { userId: string; token: string } | null = null;

    constructor(scene: any) {
        this.scene = scene;
    }

    public setScene(scene: any) {
        this.scene = scene;
    }

    public setAuth(userId: string, token: string) {
        this.authOverride = { userId, token };
        try {
            sessionStorage.setItem('afs_userId', userId);
            sessionStorage.setItem('afs_token', token);
        } catch (_err) {
        }
    }

    public connect(url: string = 'http://localhost:3000') {
        if (this.socket && (this.socket.connected || this.socket.active)) {
            return;
        }
        const urlParams = new URLSearchParams(window.location.search);
        const userIdFromQuery = urlParams.get('userId') || '';
        const tokenFromQuery = urlParams.get('token') || '';
        const userIdFromSession = (() => {
            try { return sessionStorage.getItem('afs_userId') || ''; } catch (_err) { return ''; }
        })();
        const tokenFromSession = (() => {
            try { return sessionStorage.getItem('afs_token') || ''; } catch (_err) { return ''; }
        })();
        const tokenFromEnv = import.meta.env.VITE_SOCKET_AUTH_TOKEN?.trim() || '';
        const userId = this.authOverride?.userId || userIdFromQuery || userIdFromSession || 'P1';
        const token = this.authOverride?.token || tokenFromQuery || tokenFromSession || tokenFromEnv;

        this.socket = io(url, {
            transports: ['websocket'],
            forceNew: true,
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 4000,
            timeout: 8000,
            query: { userId, token }
        });

        this.setupListeners();
    }

    private setupListeners() {
        this.socket.on('connect', () => {
            (this.scene as any).handleSocketConnected?.({
                socketId: this.socket.id
            });
        });

        this.socket.on('connect_error', (error: Error) => {
            (this.scene as any).handleSocketConnectionError?.(error);
        });

        this.socket.on('disconnect', (reason: string) => {
            (this.scene as any).handleSocketDisconnected?.({ reason });
        });

        this.socket.on('init-game', (data: any) => {
            (this.scene as any).handleInitGame?.(data);
        });

        this.socket.on('player-joined', (data: any) => {
            (this.scene as any).handlePlayerJoined?.(data);
        });

        this.socket.on('player-left', (data: any) => {
            (this.scene as any).handlePlayerLeft?.(data);
        });

        this.socket.on('current-fish', (fishList: any[]) => {
            (this.scene as any).handleCurrentFish?.(fishList);
        });

        this.socket.on('clear-all-fish', () => {
            (this.scene as any).handleClearAllFish?.();
        });

        this.socket.on('jackpot-update', (value: number) => {
            (this.scene as any).handleJackpotUpdate?.(value);
        });

        this.socket.on('game-frozen', (data: any) => {
            (this.scene as any).handleGameFrozen?.(data);
        });

        this.socket.on('fish-killed', (data: any) => {
            (this.scene as any).handleFishKilled?.(data);
        });

        this.socket.on('shoot-result', (data: any) => {
            (this.scene as any).handleShootResult?.(data);
        });

        this.socket.on('spawn-fish', (fishData: any) => {
            (this.scene as any).handleSpawnFish?.(fishData);
        });

        this.socket.on('stage-changed', (data: any) => {
            (this.scene as any).handleStageChanged?.(data);
        });

        this.socket.on('jackpot-win', (data: any) => {
            (this.scene as any).handleJackpotWin?.(data);
        });

        this.socket.on('energy-update', (data: any) => {
            (this.scene as any).handleEnergyUpdate?.(data);
        });

        this.socket.on('electric-cannon-fired', (data: any) => {
            (this.scene as any).handleElectricCannonFired?.(data);
        });

        this.socket.on('seat-balance-updated', (data: any) => {
            (this.scene as any).handleSeatBalanceUpdated?.(data);
        });

        this.socket.on('lucky-orb-cast', (data: any) => {
            (this.scene as any).handleLuckyOrbCast?.(data);
        });

        this.socket.on('action-rejected', (data: any) => {
            (this.scene as any).handleActionRejected?.(data);
        });
    }

    public emit(event: string, data: any): boolean {
        if (this.socket && this.socket.connected) {
            this.socket.emit(event, data);
            return true;
        }
        return false;
    }

    public isConnected(): boolean {
        return !!this.socket?.connected;
    }

    public getSocketId(): string | undefined {
        return this.socket?.id;
    }

    public disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}
