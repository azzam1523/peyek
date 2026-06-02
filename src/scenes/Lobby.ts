import * as Phaser from 'phaser';
import NetworkManager from '../network/NetworkManager';
import { SOCKET_SERVER_URL, UI_FONT_FAMILY } from '../config';

type AuthResponse = {
    ok: boolean;
    data?: {
        token: string;
        expiresIn: number;
        user: {
            userId: string;
            username?: string;
            balance: number;
            energy: number;
        };
    };
    error?: string;
};

export default class Lobby extends Phaser.Scene {
    private network: NetworkManager | null = null;
    private statusText!: Phaser.GameObjects.Text;
    private balanceText!: Phaser.GameObjects.Text;
    private subtitleText!: Phaser.GameObjects.Text;
    private roomLabelText!: Phaser.GameObjects.Text;
    private roomText!: Phaser.GameObjects.Text;
    private roomPrevBtn!: Phaser.GameObjects.Container;
    private roomNextBtn!: Phaser.GameObjects.Container;
    private startBtn!: Phaser.GameObjects.Container;
    private formRootEl: HTMLDivElement | null = null;
    private usernameInput!: HTMLInputElement;
    private passwordInput!: HTMLInputElement;
    private registerUsernameInput!: HTMLInputElement;
    private registerPasswordInput!: HTMLInputElement;
    private registerConfirmInput!: HTMLInputElement;
    private loginTabBtn!: HTMLButtonElement;
    private registerTabBtn!: HTMLButtonElement;
    private loginPanel!: HTMLDivElement;
    private registerPanel!: HTMLDivElement;
    private hasInit: boolean = false;
    private lastInitData: any = null;
    private selectedRoom: string = 'R1';
    private authedUserId: string = '';
    private authedToken: string = '';
    private draftUsername: string = '';
    private draftPassword: string = '';
    private isAuthenticated: boolean = false;

    constructor() {
        super('Lobby');
    }

    create() {
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroyFormOverlay());
        this.events.once(Phaser.Scenes.Events.DESTROY, () => this.destroyFormOverlay());
        const w = this.cameras.main.width;
        const h = this.cameras.main.height;
        const cx = this.cameras.main.centerX;
        const cy = this.cameras.main.centerY;

        this.add.rectangle(cx, cy, w, h, 0x06111e, 1);
        this.add.circle(cx, cy - 80, 320, 0x00f2ff, 0.05).setBlendMode(Phaser.BlendModes.ADD);

        this.add.text(cx, 84, 'Action Fish Shooter', {
            fontFamily: UI_FONT_FAMILY,
            fontSize: '44px',
            color: '#e9f3ff',
            fontStyle: 'bold',
            stroke: '#00122a',
            strokeThickness: 6
        }).setOrigin(0.5);

        this.subtitleText = this.add.text(cx, 132, 'Login / Daftar', {
            fontFamily: UI_FONT_FAMILY,
            fontSize: '18px',
            color: '#9fefff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.statusText = this.add.text(cx, 168, 'Silakan login atau daftar.', {
            fontFamily: UI_FONT_FAMILY,
            fontSize: '16px',
            color: '#ffdf7b',
            fontStyle: 'bold',
            stroke: '#00122a',
            strokeThickness: 4
        }).setOrigin(0.5);

        this.balanceText = this.add.text(cx, 198, 'Balance: -', {
            fontFamily: UI_FONT_FAMILY,
            fontSize: '18px',
            color: '#00ff8c',
            fontStyle: 'bold',
            stroke: '#00122a',
            strokeThickness: 4
        }).setOrigin(0.5);

        this.add.rectangle(cx, cy + 52, 880, 420, 0x001733, 0.55).setStrokeStyle(2, 0x00f2ff, 0.35);
        this.createLoginForm(cx, cy - 74);
        this.createRoomPicker(cx, cy + 148);

        this.startBtn = this.makePrimaryBtn(cx, cy + 222, 'START GAME', () => this.enterGame());
        this.setStartEnabled(false);
        this.setAuthUiState(false);

        this.tryAutoAuthFromUrlOrSession();
    }

    private createLoginForm(cx: number, y: number) {
        const urlParams = new URLSearchParams(window.location.search);
        this.draftUsername = sessionStorage.getItem('afs_username') || '';
        this.draftPassword = '';

        const formHtml = `
            <div style="width:100%;display:flex;flex-direction:column;gap:14px;">
                <h1 style="color:#00f2ff;text-align:center;font-family:${UI_FONT_FAMILY};margin:0 0 10px 0;font-size:32px;text-shadow: 0 2px 10px rgba(0,242,255,0.6);">Action Fish Shooter</h1>
                <p style="color:#9fefff;text-align:center;font-family:${UI_FONT_FAMILY};margin:0 0 20px 0;font-size:16px;">Login / Daftar</p>
                <div style="display:flex;gap:10px;">
                    <button id="afs-tab-login" type="button"
                        style="flex:1;height:40px;border:1px solid #00d5ff;border-radius:10px;background:rgba(0,205,255,0.24);color:#e9f3ff;font:800 14px ${UI_FONT_FAMILY};cursor:pointer;">LOGIN</button>
                    <button id="afs-tab-register" type="button"
                        style="flex:1;height:40px;border:1px solid rgba(0,213,255,0.5);border-radius:10px;background:rgba(0,57,79,0.7);color:#9fefff;font:700 14px ${UI_FONT_FAMILY};cursor:pointer;">DAFTAR</button>
                </div>

                <div id="afs-panel-login" style="display:flex;flex-direction:column;gap:10px;">
                    <input id="afs-username" type="text" maxlength="32" autocomplete="username" placeholder="Username"
                        style="height:40px;padding:0 12px;border:1px solid rgba(0,242,255,0.55);border-radius:10px;background:rgba(0,17,34,0.9);color:#e9f3ff;font:600 14px ${UI_FONT_FAMILY};outline:none;" />
                    <input id="afs-password" type="password" maxlength="64" autocomplete="current-password" placeholder="Password"
                        style="height:40px;padding:0 12px;border:1px solid rgba(0,242,255,0.55);border-radius:10px;background:rgba(0,17,34,0.9);color:#e9f3ff;font:600 14px ${UI_FONT_FAMILY};outline:none;" />
                    <button id="afs-btn-login" type="button"
                        style="height:42px;border:1px solid #00d5ff;border-radius:10px;background:rgba(0,205,255,0.24);color:#e9f3ff;font:800 14px ${UI_FONT_FAMILY};cursor:pointer;">LOGIN</button>
                </div>

                <div id="afs-panel-register" style="display:none;flex-direction:column;gap:10px;">
                    <input id="afs-register-username" type="text" maxlength="32" autocomplete="username" placeholder="Username Baru"
                        style="height:40px;padding:0 12px;border:1px solid rgba(0,242,255,0.55);border-radius:10px;background:rgba(0,17,34,0.9);color:#e9f3ff;font:600 14px ${UI_FONT_FAMILY};outline:none;" />
                    <input id="afs-register-password" type="password" maxlength="64" autocomplete="new-password" placeholder="Password Baru"
                        style="height:40px;padding:0 12px;border:1px solid rgba(0,242,255,0.55);border-radius:10px;background:rgba(0,17,34,0.9);color:#e9f3ff;font:600 14px ${UI_FONT_FAMILY};outline:none;" />
                    <input id="afs-register-confirm" type="password" maxlength="64" autocomplete="new-password" placeholder="Konfirmasi Password"
                        style="height:40px;padding:0 12px;border:1px solid rgba(0,242,255,0.55);border-radius:10px;background:rgba(0,17,34,0.9);color:#e9f3ff;font:600 14px ${UI_FONT_FAMILY};outline:none;" />
                    <button id="afs-btn-register" type="button"
                        style="height:42px;border:1px solid #00d5ff;border-radius:10px;background:rgba(0,205,255,0.24);color:#e9f3ff;font:800 14px ${UI_FONT_FAMILY};cursor:pointer;">CREATE PLAYER</button>
                </div>
            </div>
        `;
        this.destroyFormOverlay();
        const appRoot = document.getElementById('app');
        if (!appRoot) {
            this.setStatus('Container app tidak ditemukan.', '#ff5656');
            return;
        }
        this.formRootEl = document.createElement('div');
        this.formRootEl.className = 'afs-login-overlay';
        this.formRootEl.style.position = 'absolute';
        this.formRootEl.style.top = '0';
        this.formRootEl.style.left = '0';
        this.formRootEl.style.right = '0';
        this.formRootEl.style.bottom = '0';
        this.formRootEl.style.display = 'flex';
        this.formRootEl.style.alignItems = 'center';
        this.formRootEl.style.justifyContent = 'center';
        this.formRootEl.style.background = 'radial-gradient(circle at center, #0a192f 0%, #010a14 100%)';
        this.formRootEl.style.pointerEvents = 'auto';
        this.formRootEl.style.zIndex = '100';

        const panelEl = document.createElement('div');
        panelEl.style.width = '100%';
        panelEl.style.maxWidth = '400px';
        panelEl.style.padding = '30px 20px';
        panelEl.style.boxSizing = 'border-box';
        panelEl.style.background = 'rgba(0, 23, 51, 0.6)';
        panelEl.style.border = '1px solid rgba(0, 242, 255, 0.3)';
        panelEl.style.borderRadius = '16px';
        panelEl.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
        panelEl.style.margin = '20px';
        panelEl.innerHTML = formHtml;
        this.formRootEl.appendChild(panelEl);
        appRoot.appendChild(this.formRootEl);

        const formNode = panelEl as HTMLElement;
        this.loginTabBtn = formNode.querySelector('#afs-tab-login') as HTMLButtonElement;
        this.registerTabBtn = formNode.querySelector('#afs-tab-register') as HTMLButtonElement;
        this.loginPanel = formNode.querySelector('#afs-panel-login') as HTMLDivElement;
        this.registerPanel = formNode.querySelector('#afs-panel-register') as HTMLDivElement;
        this.usernameInput = formNode.querySelector('#afs-username') as HTMLInputElement;
        this.passwordInput = formNode.querySelector('#afs-password') as HTMLInputElement;
        this.registerUsernameInput = formNode.querySelector('#afs-register-username') as HTMLInputElement;
        this.registerPasswordInput = formNode.querySelector('#afs-register-password') as HTMLInputElement;
        this.registerConfirmInput = formNode.querySelector('#afs-register-confirm') as HTMLInputElement;
        const loginSubmitBtn = formNode.querySelector('#afs-btn-login') as HTMLButtonElement;
        const registerSubmitBtn = formNode.querySelector('#afs-btn-register') as HTMLButtonElement;

        this.usernameInput.value = this.draftUsername;
        this.passwordInput.value = this.draftPassword;
        this.registerUsernameInput.value = this.draftUsername;

        this.usernameInput.addEventListener('input', () => {
            this.draftUsername = this.usernameInput.value.trim().toLowerCase();
            this.usernameInput.value = this.draftUsername;
            this.registerUsernameInput.value = this.draftUsername;
        });
        this.passwordInput.addEventListener('input', () => {
            this.draftPassword = this.passwordInput.value;
        });
        this.registerUsernameInput.addEventListener('input', () => {
            this.draftUsername = this.registerUsernameInput.value.trim().toLowerCase();
            this.registerUsernameInput.value = this.draftUsername;
            this.usernameInput.value = this.draftUsername;
        });
        this.registerPasswordInput.addEventListener('input', () => {
            this.draftPassword = this.registerPasswordInput.value;
        });

        this.loginTabBtn.addEventListener('click', () => this.switchAuthTab('login'));
        this.registerTabBtn.addEventListener('click', () => this.switchAuthTab('register'));
        this.usernameInput.addEventListener('keydown', async (event: KeyboardEvent) => {
            if (event.key === 'Enter') {
                await this.handleAuth('login');
            }
        });
        this.passwordInput.addEventListener('keydown', async (event: KeyboardEvent) => {
            if (event.key === 'Enter') {
                await this.handleAuth('login');
            }
        });
        this.registerConfirmInput.addEventListener('keydown', async (event: KeyboardEvent) => {
            if (event.key === 'Enter') {
                await this.handleRegisterSubmit();
            }
        });
        loginSubmitBtn.addEventListener('click', async () => {
            await this.handleAuth('login');
        });
        registerSubmitBtn.addEventListener('click', async () => {
            await this.handleRegisterSubmit();
        });
        this.switchAuthTab('login');
    }

    private switchAuthTab(mode: 'login' | 'register') {
        const isLogin = mode === 'login';
        this.loginPanel.style.display = isLogin ? 'flex' : 'none';
        this.registerPanel.style.display = isLogin ? 'none' : 'flex';
        this.loginTabBtn.style.background = isLogin ? 'rgba(0,205,255,0.24)' : 'rgba(0,57,79,0.7)';
        this.loginTabBtn.style.color = isLogin ? '#e9f3ff' : '#9fefff';
        this.loginTabBtn.style.borderColor = isLogin ? '#00d5ff' : 'rgba(0,213,255,0.5)';
        this.registerTabBtn.style.background = isLogin ? 'rgba(0,57,79,0.7)' : 'rgba(0,205,255,0.24)';
        this.registerTabBtn.style.color = isLogin ? '#9fefff' : '#e9f3ff';
        this.registerTabBtn.style.borderColor = isLogin ? 'rgba(0,213,255,0.5)' : '#00d5ff';
    }

    private async handleRegisterSubmit() {
        const regUser = (this.registerUsernameInput?.value || '').trim().toLowerCase();
        const regPass = this.registerPasswordInput?.value || '';
        const regConfirm = this.registerConfirmInput?.value || '';
        if (!regUser || !regPass || !regConfirm) {
            this.setStatus('Semua field daftar wajib diisi.', '#ff5656');
            return;
        }
        if (regPass !== regConfirm) {
            this.setStatus('Konfirmasi password tidak sama.', '#ff5656');
            return;
        }
        this.draftUsername = regUser;
        this.draftPassword = regPass;
        this.usernameInput.value = regUser;
        this.passwordInput.value = regPass;
        await this.handleAuth('register');
    }

    private createRoomPicker(cx: number, y: number) {
        const roomOptions = [
            { id: 'R1', label: 'Room 1 (Default)' },
            { id: 'R2', label: 'Room 2' },
            { id: 'R3', label: 'Room 3' }
        ];

        this.roomLabelText = this.add.text(cx - 240, y, 'Room', {
            fontFamily: UI_FONT_FAMILY,
            fontSize: '14px',
            color: '#9fefff',
            fontStyle: 'bold'
        }).setOrigin(0, 0.5);

        this.roomText = this.add.text(cx - 120, y, roomOptions[0].label, {
            fontFamily: UI_FONT_FAMILY,
            fontSize: '14px',
            color: '#e9f3ff',
            fontStyle: 'bold'
        }).setOrigin(0, 0.5);

        this.roomPrevBtn = this.makeSmallActionBtn(cx + 210, y, '<', () => {
            const idx = roomOptions.findIndex(r => r.id === this.selectedRoom);
            const next = roomOptions[(idx - 1 + roomOptions.length) % roomOptions.length];
            this.selectedRoom = next.id;
            this.roomText.setText(next.label);
        });
        this.roomNextBtn = this.makeSmallActionBtn(cx + 260, y, '>', () => {
            const idx = roomOptions.findIndex(r => r.id === this.selectedRoom);
            const next = roomOptions[(idx + 1) % roomOptions.length];
            this.selectedRoom = next.id;
            this.roomText.setText(next.label);
        });
    }

    private setAuthUiState(authed: boolean) {
        this.isAuthenticated = authed;
        this.subtitleText.setText(authed ? 'Mini Lobby - Login Testing' : 'Login / Daftar');
        this.balanceText.setVisible(authed);
        if (!authed) {
            this.balanceText.setText('Balance: -');
        }
        this.roomLabelText.setVisible(authed);
        this.roomText.setVisible(authed);
        this.roomPrevBtn.setVisible(authed);
        this.roomNextBtn.setVisible(authed);
        this.startBtn.setVisible(authed);
        if (!authed) {
            this.setStartEnabled(false);
        }
        if (this.formRootEl) {
            this.formRootEl.style.display = authed ? 'none' : 'block';
        }
    }

    private makeSmallActionBtn(x: number, y: number, label: string, onClick: () => void) {
        const container = this.add.container(x, y).setDepth(2);
        const bg = this.add.rectangle(0, 0, label.length > 6 ? 140 : 48, 36, 0x00f2ff, 0.14).setStrokeStyle(2, 0x00f2ff, 0.5);
        const txt = this.add.text(0, 0, label, {
            fontFamily: UI_FONT_FAMILY,
            fontSize: '13px',
            color: '#e9f3ff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        const hit = this.add.rectangle(0, 0, bg.width + 12, 44, 0x000000, 0.001).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', onClick);
        container.add([bg, txt, hit]);
        return container;
    }

    private makePrimaryBtn(x: number, y: number, label: string, onClick: () => void) {
        const container = this.add.container(x, y);
        const bg = this.add.rectangle(0, 0, 320, 56, 0x00f2ff, 0.22).setStrokeStyle(3, 0x00f2ff, 0.7);
        const glow = this.add.rectangle(0, 0, 340, 70, 0x00f2ff, 0.07).setBlendMode(Phaser.BlendModes.ADD);
        const txt = this.add.text(0, 0, label, { fontFamily: UI_FONT_FAMILY, fontSize: '18px', color: '#e9f3ff', fontStyle: 'bold' }).setOrigin(0.5);
        const hit = this.add.rectangle(0, 0, 350, 78, 0x000000, 0.001).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', onClick);
        container.add([glow, bg, txt, hit]);
        container.setData('hit', hit);
        container.setDepth(4);
        return container;
    }

    private setStartEnabled(enabled: boolean) {
        this.startBtn.setAlpha(enabled ? 1 : 0.45);
        const hit = this.startBtn.getData('hit') as Phaser.GameObjects.Rectangle;
        if (enabled) hit.setInteractive({ useHandCursor: true });
        else hit.disableInteractive();
    }

    private setStatus(message: string, color: string = '#ffdf7b') {
        this.statusText.setText(message);
        this.statusText.setColor(color);
    }

    private async handleAuth(mode: 'login' | 'register') {
        const username = ((this.usernameInput?.value ?? this.draftUsername) || '').trim().toLowerCase();
        const password = (this.passwordInput?.value ?? this.draftPassword) || '';
        this.draftUsername = username;
        this.draftPassword = password;
        if (!username || !password) {
            this.setStatus('Username dan password wajib diisi.', '#ff5656');
            return;
        }

        this.setStatus(mode === 'login' ? 'Sedang login...' : 'Sedang create player...', '#9fefff');
        const endpoint = `${SOCKET_SERVER_URL}/auth/${mode}`;
        let result: AuthResponse | null = null;
        try {
            const resp = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            result = await resp.json();
            if (!resp.ok || !result?.ok || !result?.data) {
                this.setStatus(`Auth gagal: ${result?.error || resp.statusText}`, '#ff5656');
                return;
            }
        } catch (error) {
            this.setStatus(`Auth error: ${error instanceof Error ? error.message : 'unknown'}`, '#ff5656');
            return;
        }

        this.authedUserId = result.data.user.userId;
        this.authedToken = result.data.token;
        this.balanceText.setText(`Balance: ${Number(result.data.user.balance || 0).toFixed(2)}`);
        const responseUsername = String(result.data.user.username || username);
        this.setStatus(`Auth sukses untuk ${responseUsername} (${this.authedUserId}). Connecting WS...`, '#00ff8c');
        this.setAuthUiState(true);

        try {
            sessionStorage.setItem('afs_username', responseUsername);
            sessionStorage.setItem('afs_userId', this.authedUserId);
            sessionStorage.setItem('afs_token', this.authedToken);
        } catch (_err) {
        }

        const current = new URL(window.location.href);
        current.searchParams.set('userId', this.authedUserId);
        current.searchParams.set('token', this.authedToken);
        window.history.replaceState({}, '', current.toString());

        this.connectNetwork();
    }

    private tryAutoAuthFromUrlOrSession() {
        const params = new URLSearchParams(window.location.search);
        const userId = params.get('userId') || sessionStorage.getItem('afs_userId') || '';
        const username = sessionStorage.getItem('afs_username') || '';
        const token = params.get('token') || sessionStorage.getItem('afs_token') || '';
        this.draftUsername = username || this.draftUsername;
        if (this.usernameInput) {
            this.usernameInput.value = this.draftUsername;
        }
        if (this.registerUsernameInput) {
            this.registerUsernameInput.value = this.draftUsername;
        }
        if (!userId || !token) {
            return;
        }
        this.authedUserId = userId;
        this.authedToken = token;
        this.setAuthUiState(true);
        this.setStatus(`Token ditemukan untuk ${userId}. Connecting WS...`, '#9fefff');
        this.connectNetwork();
    }

    private connectNetwork() {
        if (!this.authedUserId || !this.authedToken) return;
        if (!this.network) {
            this.network = new NetworkManager(this);
        } else {
            this.network.setScene(this);
        }
        this.network.setAuth(this.authedUserId, this.authedToken);
        this.network.connect(SOCKET_SERVER_URL);
    }

    private enterGame() {
        if (!this.hasInit || !this.network) return;
        this.scene.start('MainGame', { network: this.network, roomId: this.selectedRoom, init: this.lastInitData });
    }

    handleSocketConnected(data: any) {
        this.setStatus(`WS connected. Socket: ${String(data?.socketId || '').slice(0, 8)}`, '#00ff8c');
    }

    handleSocketConnectionError(error: any) {
        const msg = error?.message ? String(error.message) : 'connect_error';
        this.setStatus(`WS connection error: ${msg}`, '#ff5656');
        this.setStartEnabled(false);
        this.setAuthUiState(false);
    }

    handleSocketDisconnected(data: any) {
        const reason = String(data?.reason || 'disconnected');
        this.setStatus(`WS disconnected: ${reason}`, '#ff5656');
        this.setStartEnabled(false);
        this.setAuthUiState(false);
    }

    handleInitGame(data: any) {
        this.hasInit = true;
        this.lastInitData = data;
        const bal = Number(data?.balance ?? 0);
        this.balanceText.setText(`Balance: ${bal.toFixed(2)}`);
        this.setStatus('Lobby ready. Klik START GAME.', '#00ff8c');
        this.setStartEnabled(true);
    }

    handleActionRejected(data: any) {
        const reason = String(data?.reason || 'ACTION_REJECTED');
        this.setStatus(`Rejected: ${reason}`, '#ff5656');
        this.setStartEnabled(false);
        if (!this.isAuthenticated) {
            this.setAuthUiState(false);
        }
    }

    shutdown() {
        this.destroyFormOverlay();
    }

    private destroyFormOverlay() {
        if (this.formRootEl && this.formRootEl.parentElement) {
            this.formRootEl.parentElement.removeChild(this.formRootEl);
        }
        this.formRootEl = null;
    }
}
