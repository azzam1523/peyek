import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import sqlite3 from 'sqlite3';
import { GAME_CONFIG, FISH_CONFIGS, STAGES, FishCategory } from './config';
import { ADMIN_HTML as ADMIN_DASHBOARD_HTML } from './admin_html';
import { operatorApi } from './OperatorApiClient';

function loadEnvFileIfPresent() {
    const envPath = path.resolve(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) return;
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (!key) continue;
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}

loadEnvFileIfPresent();

const app = express();
const httpServer = createServer(app);

const parseCorsOrigins = (): string[] => {
    const raw = process.env.CORS_ORIGINS?.trim();
    if (!raw) {
        return ['http://localhost:5173', 'http://127.0.0.1:5173'];
    }
    return raw.split(',').map(s => s.trim()).filter(Boolean);
};

const ALLOWED_CORS_ORIGINS = parseCorsOrigins();
const SOCKET_AUTH_TOKEN = process.env.SOCKET_AUTH_TOKEN?.trim() || '';
const SOCKET_JWT_SECRET = process.env.SOCKET_JWT_SECRET?.trim() || '';
const SOCKET_JWT_SECRET_EFFECTIVE = SOCKET_JWT_SECRET || 'dev_local_socket_secret_change_me';
const SOCKET_JWT_ISSUER = process.env.SOCKET_JWT_ISSUER?.trim() || '';
const AUTH_JWT_EXP_SECONDS = Number(process.env.AUTH_JWT_EXP_SECONDS || 28800);
const SOCKET_AUTH_MODE_RAW = process.env.SOCKET_AUTH_MODE?.trim().toUpperCase() || 'HYBRID';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN?.trim() || '';
const REQUIRE_SOCKET_TOKEN = process.env.REQUIRE_SOCKET_TOKEN
    ? process.env.REQUIRE_SOCKET_TOKEN.toLowerCase() === 'true'
    : SOCKET_AUTH_TOKEN.length > 0;
const REQUIRE_SECURE_TRANSPORT = process.env.REQUIRE_SECURE_TRANSPORT?.toLowerCase() === 'true';
const ALLOW_INSECURE_LOCALHOST = process.env.ALLOW_INSECURE_LOCALHOST
    ? process.env.ALLOW_INSECURE_LOCALHOST.toLowerCase() === 'true'
    : true;
const PORT = Number(process.env.PORT || 3000);

type SocketAuthMode = 'STATIC' | 'JWT' | 'HYBRID';

const SOCKET_AUTH_MODE: SocketAuthMode = (
    SOCKET_AUTH_MODE_RAW === 'STATIC' || SOCKET_AUTH_MODE_RAW === 'JWT' || SOCKET_AUTH_MODE_RAW === 'HYBRID'
)
    ? SOCKET_AUTH_MODE_RAW
    : 'HYBRID';

const io = new Server(httpServer, {
    cors: {
        origin: (origin, callback) => {
            if (!origin) {
                callback(null, true);
                return;
            }
            if (ALLOWED_CORS_ORIGINS.includes(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error('CORS origin not allowed'));
        },
        methods: ["GET", "POST"]
    },
    maxHttpBufferSize: 64 * 1024
});

app.use(express.json({ limit: '128kb' }));
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && ALLOWED_CORS_ORIGINS.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-game-token');
    if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
    }
    next();
});
const DB_PATH = path.resolve(__dirname, '..', 'game_database.sqlite');
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (userId TEXT PRIMARY KEY, balance REAL DEFAULT ${GAME_CONFIG.INITIAL_BALANCE}, energy REAL DEFAULT 0, lastLogin INTEGER)`);
    db.run(`CREATE TABLE IF NOT EXISTS auth_users (userId TEXT PRIMARY KEY, username TEXT UNIQUE, passwordHash TEXT NOT NULL, createdAt INTEGER, updatedAt INTEGER)`);
    db.run(`CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, timestamp INTEGER, userId TEXT, type TEXT, amount REAL, balanceBefore REAL, balanceAfter REAL, details TEXT)`);
});

const dbGet = (query: string, params: any[]): Promise<any> => new Promise((res, rej) => db.get(query, params, (err, row) => err ? rej(err) : res(row)));
const dbRun = (query: string, params: any[]): Promise<void> => new Promise((res, rej) => db.run(query, params, (err) => err ? rej(err) : res()));
const dbAll = (query: string, params: any[]): Promise<any[]> => new Promise((res, rej) => db.all(query, params, (err, rows) => err ? rej(err) : res(rows)));
const activeFish: Map<string, any> = new Map();
const socketToUser: Map<string, string> = new Map();
let currentStageIndex = 0;
let globalJackpot = 88888.88;
let gameFrozenUntil = 0;
let nextBossAllowedTime = Date.now() + GAME_CONFIG.BOSS_INITIAL_COOLDOWN_MS;
const lastSpawnAtByType: Map<string, number> = new Map();
const seats: any[] = [null, null, null];

type SeatState = {
    socketId: string;
    userId: string;
    balance: number;
    energy: number;
};

type JackpotTier = 'SPEED' | 'LUCKY' | 'JILI';

const SERVER_BET_STEP = 0.1;
const SERVER_MIN_BASE_BET = 0.1;
const SERVER_MAX_BASE_BET = 5.0;
let lastGameplayAt = Date.now();

type MetricsState = {
    acceptedConnections: number;
    rejectedConnections: number;
    activeConnections: number;
    shootEvents: number;
    orbEvents: number;
    rejectedActions: number;
    fishKilled: number;
    payoutTotal: number;
    lastKillAt: number;
    rateLimitShootHits: number;
    rateLimitOrbHits: number;
    rejectByReason: Record<string, number>;
};

const metrics: MetricsState = {
    acceptedConnections: 0,
    rejectedConnections: 0,
    activeConnections: 0,
    shootEvents: 0,
    orbEvents: 0,
    rejectedActions: 0,
    fishKilled: 0,
    payoutTotal: 0,
    lastKillAt: 0,
    rateLimitShootHits: 0,
    rateLimitOrbHits: 0,
    rejectByReason: {}
};

app.get('/health', (_req, res) => {
    res.json({
        ok: true,
        stage: STAGES[currentStageIndex].name,
        activeFish: activeFish.size,
        activePlayers: countActiveSeats(),
        activeConnections: metrics.activeConnections
    });
});

app.get('/metrics', (_req, res) => {
    res.json({
        uptimeSec: Number(process.uptime().toFixed(2)),
        stage: STAGES[currentStageIndex].name,
        activeFish: activeFish.size,
        activePlayers: countActiveSeats(),
        jackpot: Number(globalJackpot.toFixed(2)),
        metrics
    });
});

app.get('/audit/verify', async (_req, res) => {
    try {
        const chain = await verifyAuditChain();
        res.json({
            ok: chain.valid,
            chain
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            error: error instanceof Error ? error.message : 'AUDIT_VERIFY_FAILED'
        });
    }
});

function isHttpSecure(req: express.Request): boolean {
    if (!REQUIRE_SECURE_TRANSPORT) return true;
    if (ALLOW_INSECURE_LOCALHOST && process.env.NODE_ENV !== 'production') {
        const host = String(req.headers.host || '').toLowerCase();
        if (host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]')) return true;
    }
    if ((req as any).secure) return true;
    const forwardedProto = typeof req.headers['x-forwarded-proto'] === 'string'
        ? req.headers['x-forwarded-proto'].toLowerCase()
        : '';
    if (forwardedProto.includes('https') || forwardedProto.includes('wss')) return true;
    return false;
}

function readAdminToken(req: express.Request): string {
    const header = typeof req.headers.authorization === 'string' ? req.headers.authorization.trim() : '';
    const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
    const queryToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    return queryToken || bearer;
}

function requireAdmin(req: express.Request, res: express.Response): boolean {
    if (!isHttpSecure(req)) {
        res.status(403).json({ ok: false, error: 'INSECURE_TRANSPORT' });
        return false;
    }
    if (!ADMIN_TOKEN) return true;
    const token = readAdminToken(req);
    if (!token || !safeCompare(token, ADMIN_TOKEN)) {
        res.status(401).json({ ok: false, error: 'UNAUTHORIZED_ADMIN' });
        return false;
    }
    return true;
}

function parseIntParam(value: unknown, fallback: number): number {
    if (typeof value !== 'string') return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function parseTimeParam(value: unknown): number | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    const raw = value.trim();
    if (/^\d+$/.test(raw)) {
        const ms = Number(raw);
        return Number.isFinite(ms) ? ms : null;
    }
    const dt = Date.parse(raw);
    return Number.isFinite(dt) ? dt : null;
}

function normalizeUserId(input: unknown): string {
    return String(input || '').trim();
}

function isValidUserId(userId: string): boolean {
    return /^[a-zA-Z0-9_-]{3,32}$/.test(userId);
}

function normalizeUsername(input: unknown): string {
    return String(input || '').trim().toLowerCase();
}

function isValidUsername(username: string): boolean {
    return /^[a-z0-9_.-]{3,32}$/.test(username);
}

async function ensureAuthUsersSchema(): Promise<void> {
    const columns = await dbAll("PRAGMA table_info(auth_users)", []);
    const hasUsername = columns.some((col) => String(col?.name || '').toLowerCase() === 'username');
    if (!hasUsername) {
        await dbRun("ALTER TABLE auth_users ADD COLUMN username TEXT", []);
    }
    await dbRun("UPDATE auth_users SET username = userId WHERE username IS NULL OR TRIM(username) = ''", []);
    await dbRun("CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_username ON auth_users(username)", []);
}

async function generateUniqueUserId(): Promise<string> {
    for (let i = 0; i < 30; i++) {
        const candidate = `P${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
        const exists = await dbGet("SELECT userId FROM auth_users WHERE userId = ?", [candidate]);
        if (!exists) {
            return candidate;
        }
    }
    throw new Error('GENERATE_USER_ID_FAILED');
}

function hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function readBearerToken(req: express.Request): string {
    const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization.trim() : '';
    return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}

function issueSocketJwt(userId: string): string {
    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = nowSec + Math.max(60, AUTH_JWT_EXP_SECONDS);
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload: JwtPayload = {
        sub: userId,
        userId,
        iat: nowSec,
        exp: expSec,
        iss: SOCKET_JWT_ISSUER || 'actionfish-local'
    };
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const message = `${encodedHeader}.${encodedPayload}`;
    const signature = base64UrlEncode(
        crypto.createHmac('sha256', SOCKET_JWT_SECRET_EFFECTIVE).update(message).digest()
    );
    return `${message}.${signature}`;
}

async function ensureUserExists(userId: string): Promise<{ userId: string; balance: number; energy: number; lastLogin: number }> {
    const now = Date.now();
    const existing = await dbGet("SELECT userId, balance, energy, lastLogin FROM users WHERE userId = ?", [userId]);
    if (!existing) {
        await dbRun("INSERT INTO users (userId, balance, energy, lastLogin) VALUES (?, ?, ?, ?)", [userId, GAME_CONFIG.INITIAL_BALANCE, 0, now]);
        return { userId, balance: GAME_CONFIG.INITIAL_BALANCE, energy: 0, lastLogin: now };
    }
    await dbRun("UPDATE users SET lastLogin = ? WHERE userId = ?", [now, userId]);
    return {
        userId: String(existing.userId),
        balance: Number(existing.balance || 0),
        energy: Number(existing.energy || 0),
        lastLogin: now
    };
}

app.post('/auth/register', async (req, res) => {
    try {
        const username = normalizeUsername(req.body?.username ?? req.body?.userId);
        const password = String(req.body?.password || '');
        if (!isValidUsername(username)) {
            res.status(400).json({ ok: false, error: 'INVALID_USERNAME' });
            return;
        }
        if (password.length < 4 || password.length > 64) {
            res.status(400).json({ ok: false, error: 'INVALID_PASSWORD' });
            return;
        }

        const existingAuth = await dbGet("SELECT userId FROM auth_users WHERE username = ?", [username]);
        if (existingAuth) {
            res.status(409).json({ ok: false, error: 'USERNAME_ALREADY_EXISTS' });
            return;
        }

        // Call Operator API to create player
        let operatorPlayerId = '';
        try {
            const operatorRes = await operatorApi.createPlayer(username);
            if (!operatorRes.success || !operatorRes.data?.id) {
                res.status(500).json({ ok: false, error: 'OPERATOR_CREATE_FAILED' });
                return;
            }
            operatorPlayerId = operatorRes.data.id;
        } catch (err) {
            console.error('Operator API Error:', err);
            res.status(500).json({ ok: false, error: 'OPERATOR_API_UNAVAILABLE' });
            return;
        }

        const userId = operatorPlayerId;
        const now = Date.now();
        await dbRun(
            "INSERT INTO auth_users (userId, username, passwordHash, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)",
            [userId, username, hashPassword(password), now, now]
        );
        const user = await ensureUserExists(userId);
        
        const token = issueSocketJwt(userId);
        res.json({
            ok: true,
            data: {
                token,
                expiresIn: Math.max(60, AUTH_JWT_EXP_SECONDS),
                user: { userId: user.userId, username, balance: user.balance, energy: user.energy }
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'REGISTER_FAILED' });
    }
});

app.post('/auth/login', async (req, res) => {
    try {
        const username = normalizeUsername(req.body?.username ?? req.body?.userId);
        const password = String(req.body?.password || '');
        if (!isValidUsername(username)) {
            res.status(400).json({ ok: false, error: 'INVALID_USERNAME' });
            return;
        }

        const authUser = await dbGet("SELECT userId, username, passwordHash FROM auth_users WHERE username = ?", [username]);
        if (!authUser) {
            res.status(404).json({ ok: false, error: 'USER_NOT_FOUND' });
            return;
        }
        const valid = safeCompare(String(authUser.passwordHash || ''), hashPassword(password));
        if (!valid) {
            res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
            return;
        }

        const userId = String(authUser.userId || '').trim();
        let user = await ensureUserExists(userId);

        // Fetch real-time balance from Operator API
        try {
            const infoRes = await operatorApi.checkInfo(userId);
            if (infoRes.success && infoRes.data) {
                // Update local balance to match Operator API
                const realBalance = Number(infoRes.data.balance || 0);
                await dbRun("UPDATE users SET balance = ? WHERE userId = ?", [realBalance, userId]);
                user.balance = realBalance;
            }
        } catch (err) {
            console.error('Operator API Check Info Error:', err);
            // We can choose to fail login if operator is down, or proceed with local balance. Let's fail for safety.
            res.status(500).json({ ok: false, error: 'OPERATOR_API_UNAVAILABLE' });
            return;
        }

        const token = issueSocketJwt(userId);
        res.json({
            ok: true,
            data: {
                token,
                expiresIn: Math.max(60, AUTH_JWT_EXP_SECONDS),
                user: { userId: user.userId, username: String(authUser.username || username), balance: user.balance, energy: user.energy }
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'LOGIN_FAILED' });
    }
});

app.get('/auth/me', async (req, res) => {
    try {
        const token = readBearerToken(req) || (typeof req.query.token === 'string' ? req.query.token.trim() : '');
        if (!token) {
            res.status(401).json({ ok: false, error: 'MISSING_TOKEN' });
            return;
        }
        const payload = verifySocketJwt(token);
        if (!payload) {
            res.status(401).json({ ok: false, error: 'INVALID_TOKEN' });
            return;
        }
        const userId = String(payload.sub || payload.userId || '').trim();
        if (!userId) {
            res.status(401).json({ ok: false, error: 'INVALID_TOKEN_PAYLOAD' });
            return;
        }
        const user = await ensureUserExists(userId);
        const authUser = await dbGet("SELECT username FROM auth_users WHERE userId = ?", [userId]);
        res.json({
            ok: true,
            data: {
                user: {
                    userId: user.userId,
                    username: String(authUser?.username || ''),
                    balance: user.balance,
                    energy: user.energy
                }
            }
        });
    } catch (error) {
        res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'AUTH_ME_FAILED' });
    }
});

app.get('/admin', (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(ADMIN_DASHBOARD_HTML);
});

app.get('/admin/api/users', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
    const limit = clamp(parseIntParam(req.query.limit, 200), 1, 1000);
    const offset = clamp(parseIntParam(req.query.offset, 0), 0, 1000000);

    const like = `%${userId}%`;
    const whereUser = userId ? "WHERE userId LIKE ?" : "";
    const params = userId ? [like] : [];

    const totalRow = await dbGet(`SELECT COUNT(*) as cnt FROM users ${whereUser}`, params);
    const users = await dbAll(
        `SELECT userId, balance, energy, lastLogin
         FROM users
         ${whereUser}
         ORDER BY (lastLogin IS NULL) ASC, lastLogin DESC, userId ASC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    res.json({ ok: true, total: Number(totalRow?.cnt || 0), limit, offset, users });
});

app.get('/admin/api/active-users', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const activeSeats = seats
        .map((seat, idx) => ({ seatIndex: idx, seat }))
        .filter(item => !!item.seat)
        .map(item => ({
            seatIndex: item.seatIndex,
            socketId: item.seat.socketId,
            userId: item.seat.userId,
            balance: item.seat.balance,
            energy: item.seat.energy
        }));

    res.json({
        ok: true,
        activeConnections: metrics.activeConnections,
        activePlayers: countActiveSeats(),
        seats: activeSeats
    });
});

app.get('/admin/api/summary', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const since = parseTimeParam(req.query.since) ?? (Date.now() - (24 * 60 * 60 * 1000));
    const until = parseTimeParam(req.query.until) ?? Date.now();
    const limit = clamp(parseIntParam(req.query.limit, 10), 1, 50);

    const totalUsersRow = await dbGet("SELECT COUNT(*) as cnt FROM users", []);
    const totalUsers = Number(totalUsersRow?.cnt || 0);

    const agg = await dbGet(
        `SELECT 
            COUNT(*) as txCount,
            SUM(CASE WHEN type = 'BET' THEN -amount ELSE 0 END) as betAmount,
            SUM(CASE WHEN type LIKE 'WIN%' THEN amount ELSE 0 END) as winAmount,
            SUM(CASE WHEN type LIKE 'WIN%' THEN 1 ELSE 0 END) as winEvents,
            SUM(CASE WHEN type = 'BET' THEN 1 ELSE 0 END) as betEvents
         FROM transactions
         WHERE timestamp >= ? AND timestamp <= ?`,
        [since, until]
    );

    const betAmount = Number(agg?.betAmount || 0);
    const winAmount = Number(agg?.winAmount || 0);
    const netAmount = Number((winAmount - betAmount).toFixed(2));
    const rtp = betAmount > 0 ? Number((winAmount / betAmount).toFixed(4)) : 0;

    const topNetWinners = await dbAll(
        `SELECT 
            userId,
            SUM(CASE WHEN type = 'BET' THEN -amount ELSE 0 END) as betAmount,
            SUM(CASE WHEN type LIKE 'WIN%' THEN amount ELSE 0 END) as winAmount,
            (SUM(CASE WHEN type LIKE 'WIN%' THEN amount ELSE 0 END) - SUM(CASE WHEN type = 'BET' THEN -amount ELSE 0 END)) as netAmount
         FROM transactions
         WHERE timestamp >= ? AND timestamp <= ?
         GROUP BY userId
         ORDER BY netAmount DESC
         LIMIT ?`,
        [since, until, limit]
    );

    const topNetLosers = await dbAll(
        `SELECT 
            userId,
            SUM(CASE WHEN type = 'BET' THEN -amount ELSE 0 END) as betAmount,
            SUM(CASE WHEN type LIKE 'WIN%' THEN amount ELSE 0 END) as winAmount,
            (SUM(CASE WHEN type LIKE 'WIN%' THEN amount ELSE 0 END) - SUM(CASE WHEN type = 'BET' THEN -amount ELSE 0 END)) as netAmount
         FROM transactions
         WHERE timestamp >= ? AND timestamp <= ?
         GROUP BY userId
         ORDER BY netAmount ASC
         LIMIT ?`,
        [since, until, limit]
    );

    res.json({
        ok: true,
        window: { since, until },
        stage: STAGES[currentStageIndex].name,
        activeFish: activeFish.size,
        activePlayers: countActiveSeats(),
        activeConnections: metrics.activeConnections,
        jackpot: Number(globalJackpot.toFixed(2)),
        totalUsers,
        tx: {
            txCount: Number(agg?.txCount || 0),
            betEvents: Number(agg?.betEvents || 0),
            winEvents: Number(agg?.winEvents || 0),
            betAmount: Number(betAmount.toFixed(2)),
            winAmount: Number(winAmount.toFixed(2)),
            netAmount,
            rtp
        },
        top: {
            winners: topNetWinners,
            losers: topNetLosers
        }
    });
});

app.get('/admin/api/health', (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({
        ok: true,
        stage: STAGES[currentStageIndex].name,
        activeFish: activeFish.size,
        activePlayers: countActiveSeats(),
        activeConnections: metrics.activeConnections,
        jackpot: Number(globalJackpot.toFixed(2)),
        uptimeSec: Number(process.uptime().toFixed(2))
    });
});

app.get('/admin/api/metrics', (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({
        uptimeSec: Number(process.uptime().toFixed(2)),
        stage: STAGES[currentStageIndex].name,
        activeFish: activeFish.size,
        activePlayers: countActiveSeats(),
        jackpot: Number(globalJackpot.toFixed(2)),
        metrics
    });
});

app.get('/admin/api/audit', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
        const chain = await verifyAuditChain();
        res.json({ ok: chain.valid, chain });
    } catch (error) {
        res.status(500).json({
            ok: false,
            error: error instanceof Error ? error.message : 'AUDIT_VERIFY_FAILED'
        });
    }
});

app.get('/admin/api/transactions', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
    const type = typeof req.query.type === 'string' ? req.query.type.trim() : '';
    const since = parseTimeParam(req.query.since);
    const until = parseTimeParam(req.query.until);
    const limit = clamp(parseIntParam(req.query.limit, 200), 1, 1000);
    const offset = clamp(parseIntParam(req.query.offset, 0), 0, 1000000);

    const wheres: string[] = [];
    const params: any[] = [];

    if (userId) {
        wheres.push("userId LIKE ?");
        params.push(`%${userId}%`);
    }
    if (type) {
        wheres.push("type LIKE ?");
        params.push(`%${type}%`);
    }
    if (since !== null) {
        wheres.push("timestamp >= ?");
        params.push(since);
    }
    if (until !== null) {
        wheres.push("timestamp <= ?");
        params.push(until);
    }

    const whereSql = wheres.length ? ("WHERE " + wheres.join(" AND ")) : "";

    const totalRow = await dbGet(`SELECT COUNT(*) as cnt FROM transactions ${whereSql}`, params);
    const transactions = await dbAll(
        `SELECT id, timestamp, userId, type, amount, balanceBefore, balanceAfter, details, prevHash, rowHash
         FROM transactions
         ${whereSql}
         ORDER BY timestamp DESC, id DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    res.json({ ok: true, total: Number(totalRow?.cnt || 0), limit, offset, transactions });
});

function emitSeatBalanceUpdate(seatIndex: number, seat: SeatState) {
    io.emit('seat-balance-updated', {
        seatIndex,
        socketId: seat.socketId,
        userId: seat.userId,
        balance: seat.balance,
        energy: seat.energy
    });
}

function secureRandom(): number {
    return crypto.randomBytes(4).readUInt32BE() / 0xffffffff;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function incrementReasonCounter(bucket: Record<string, number>, reason: string) {
    bucket[reason] = (bucket[reason] || 0) + 1;
}

function base64UrlEncode(input: Buffer | string): string {
    const source = typeof input === 'string' ? Buffer.from(input) : input;
    return source
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function base64UrlDecode(input: string): string {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return Buffer.from(normalized + padding, 'base64').toString('utf8');
}

type JwtPayload = {
    sub?: string;
    userId?: string;
    exp?: number;
    iat?: number;
    iss?: string;
};

function safeCompare(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    if (leftBuffer.length !== rightBuffer.length) return false;
    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifySocketJwt(token: string): JwtPayload | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, signature] = parts;
    try {
        const headerJson = JSON.parse(base64UrlDecode(encodedHeader)) as { alg?: string; typ?: string };
        if (headerJson.alg !== 'HS256') return null;
        if (headerJson.typ && headerJson.typ !== 'JWT') return null;

        const message = `${encodedHeader}.${encodedPayload}`;
        const expected = base64UrlEncode(
            crypto.createHmac('sha256', SOCKET_JWT_SECRET_EFFECTIVE).update(message).digest()
        );
        if (!safeCompare(expected, signature)) return null;

        const payload = JSON.parse(base64UrlDecode(encodedPayload)) as JwtPayload;
        if (typeof payload.exp !== 'number') return null;
        if ((Date.now() / 1000) >= payload.exp) return null;
        if (SOCKET_JWT_ISSUER && payload.iss !== SOCKET_JWT_ISSUER) return null;
        return payload;
    } catch (_err) {
        return null;
    }
}

function readSocketToken(socket: any): string {
    const tokenFromQuery = typeof socket.handshake.query.token === 'string'
        ? socket.handshake.query.token.trim()
        : '';
    const tokenFromHeader = typeof socket.handshake.headers['x-game-token'] === 'string'
        ? socket.handshake.headers['x-game-token'].trim()
        : '';
    return tokenFromQuery || tokenFromHeader;
}

function isSocketTransportSecure(socket: any): boolean {
    if (!REQUIRE_SECURE_TRANSPORT) return true;
    if (ALLOW_INSECURE_LOCALHOST && process.env.NODE_ENV !== 'production') {
        const host = typeof socket.handshake.headers?.host === 'string' ? socket.handshake.headers.host.toLowerCase() : '';
        if (host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('::1')) return true;
    }
    if (socket.handshake.secure) return true;
    const forwardedProto = typeof socket.handshake.headers['x-forwarded-proto'] === 'string'
        ? socket.handshake.headers['x-forwarded-proto'].toLowerCase()
        : '';
    if (forwardedProto.includes('https') || forwardedProto.includes('wss')) return true;
    return false;
}

function resolveTokenAuth(token: string, requestedUserId: string): { ok: boolean; reason?: string; userId?: string } {
    if (!token) {
        if (REQUIRE_SOCKET_TOKEN) return { ok: false, reason: 'MISSING_AUTH_TOKEN' };
        return { ok: true, userId: requestedUserId };
    }

    const allowStatic = SOCKET_AUTH_MODE === 'STATIC' || SOCKET_AUTH_MODE === 'HYBRID';
    const allowJwt = SOCKET_AUTH_MODE === 'JWT' || SOCKET_AUTH_MODE === 'HYBRID';

    if (allowStatic && SOCKET_AUTH_TOKEN && safeCompare(token, SOCKET_AUTH_TOKEN)) {
        return { ok: true, userId: requestedUserId };
    }

    if (allowJwt) {
        const payload = verifySocketJwt(token);
        if (payload) {
            const tokenUserId = String(payload.sub || payload.userId || requestedUserId || '').trim();
            if (!tokenUserId) return { ok: false, reason: 'JWT_USER_EMPTY' };
            if (requestedUserId && requestedUserId !== tokenUserId) return { ok: false, reason: 'JWT_USER_MISMATCH' };
            return { ok: true, userId: tokenUserId };
        }
    }

    if (REQUIRE_SOCKET_TOKEN) return { ok: false, reason: 'UNAUTHORIZED_SOCKET_TOKEN' };
    return { ok: true, userId: requestedUserId };
}

function buildTransactionHash(data: {
    id: string;
    timestamp: number;
    userId: string;
    type: string;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    details: string;
    prevHash: string;
}): string {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

async function ensureTransactionHashColumns() {
    const columns = await dbAll("PRAGMA table_info(transactions)", []);
    const columnNames = new Set(columns.map(col => String(col.name)));
    if (!columnNames.has('prevHash')) {
        await dbRun("ALTER TABLE transactions ADD COLUMN prevHash TEXT", []);
    }
    if (!columnNames.has('rowHash')) {
        await dbRun("ALTER TABLE transactions ADD COLUMN rowHash TEXT", []);
    }
}

async function backfillTransactionHashes() {
    const rows = await dbAll(
        "SELECT id, timestamp, userId, type, amount, balanceBefore, balanceAfter, details, prevHash, rowHash FROM transactions ORDER BY timestamp ASC, id ASC",
        []
    );
    let previousHash = 'GENESIS';
    for (const row of rows) {
        const tx = {
            id: String(row.id),
            timestamp: Number(row.timestamp),
            userId: String(row.userId),
            type: String(row.type),
            amount: Number(row.amount),
            balanceBefore: Number(row.balanceBefore),
            balanceAfter: Number(row.balanceAfter),
            details: String(row.details || ''),
            prevHash: previousHash
        };
        const rowHash = buildTransactionHash(tx);
        const currentPrevHash = typeof row.prevHash === 'string' ? row.prevHash : '';
        const currentRowHash = typeof row.rowHash === 'string' ? row.rowHash : '';
        if (currentPrevHash !== previousHash || currentRowHash !== rowHash) {
            await dbRun("UPDATE transactions SET prevHash = ?, rowHash = ? WHERE id = ?", [previousHash, rowHash, tx.id]);
        }
        previousHash = rowHash;
    }
}

async function verifyAuditChain(): Promise<{ valid: boolean; totalRows: number; brokenAtId?: string; reason?: string }> {
    const rows = await dbAll(
        "SELECT id, timestamp, userId, type, amount, balanceBefore, balanceAfter, details, prevHash, rowHash FROM transactions ORDER BY timestamp ASC, id ASC",
        []
    );
    let previousHash = 'GENESIS';
    for (const row of rows) {
        const tx = {
            id: String(row.id),
            timestamp: Number(row.timestamp),
            userId: String(row.userId),
            type: String(row.type),
            amount: Number(row.amount),
            balanceBefore: Number(row.balanceBefore),
            balanceAfter: Number(row.balanceAfter),
            details: String(row.details || ''),
            prevHash: previousHash
        };
        const expectedHash = buildTransactionHash(tx);
        const actualPrevHash = String(row.prevHash || '');
        const actualHash = String(row.rowHash || '');
        if (actualPrevHash !== previousHash) {
            return { valid: false, totalRows: rows.length, brokenAtId: tx.id, reason: 'PREV_HASH_MISMATCH' };
        }
        if (actualHash !== expectedHash) {
            return { valid: false, totalRows: rows.length, brokenAtId: tx.id, reason: 'ROW_HASH_MISMATCH' };
        }
        previousHash = actualHash;
    }
    return { valid: true, totalRows: rows.length };
}

async function recordTransaction(
    userId: string,
    type: string,
    amount: number,
    balanceBefore: number,
    balanceAfter: number,
    details: string
) {
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const prev = await dbGet(
        "SELECT rowHash FROM transactions WHERE rowHash IS NOT NULL AND rowHash <> '' ORDER BY timestamp DESC, id DESC LIMIT 1",
        []
    );
    const prevHash = (prev?.rowHash && typeof prev.rowHash === 'string') ? prev.rowHash : 'GENESIS';
    const rowHash = buildTransactionHash({
        id,
        timestamp,
        userId,
        type,
        amount,
        balanceBefore,
        balanceAfter,
        details,
        prevHash
    });
    await dbRun(
        "INSERT INTO transactions (id, timestamp, userId, type, amount, balanceBefore, balanceAfter, details, prevHash, rowHash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [id, timestamp, userId, type, amount, balanceBefore, balanceAfter, details, prevHash, rowHash]
    );
}

function resolveJackpotTier(betAmount: number): JackpotTier | null {
    if (betAmount >= GAME_CONFIG.JACKPOT_LIMITS.JILI) return 'JILI';
    if (betAmount >= GAME_CONFIG.JACKPOT_LIMITS.LUCKY) return 'LUCKY';
    if (betAmount >= GAME_CONFIG.JACKPOT_LIMITS.SPEED) return 'SPEED';
    return null;
}

function calculateShotDamage(betAmount: number, isTorpedo: boolean): number {
    const baseBet = isTorpedo ? (betAmount / 6) : betAmount;
    const betFactor = Math.max(1, Math.round((baseBet / SERVER_MIN_BASE_BET) * 100) / 100);
    const baseDamage = isTorpedo ? 11 : 1;
    const damage = baseDamage * betFactor;
    return Math.max(0.1, Number(damage.toFixed(2)));
}

function getActiveTypeCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const fish of activeFish.values()) {
        counts[fish.type] = (counts[fish.type] || 0) + 1;
    }
    return counts;
}

function pickWeightedCategory(stage: typeof STAGES[number]): FishCategory {
    const randCategory = secureRandom();
    let selectedCategory: FishCategory = 'NORMAL';
    let cum = 0;
    for (const [cat, rate] of Object.entries(stage.spawnRates)) {
        cum += rate;
        if (randCategory < cum) {
            selectedCategory = cat as FishCategory;
            break;
        }
    }
    return selectedCategory;
}

function pickFishTypeForCategory(category: FishCategory): [string, (typeof FISH_CONFIGS)[string]] | null {
    const activeTypeCounts = getActiveTypeCounts();
    const now = Date.now();

    const candidates = Object.entries(FISH_CONFIGS).filter(([type, config]) => {
        if (config.category !== category) return false;
        const maxForType = GAME_CONFIG.MAX_ACTIVE_PER_TYPE[type] ?? 2;
        const activeCount = activeTypeCounts[type] || 0;
        if (activeCount >= maxForType) return false;

        const lastSpawnAt = lastSpawnAtByType.get(type) || 0;
        return (now - lastSpawnAt) >= GAME_CONFIG.TYPE_SPAWN_COOLDOWN_MS;
    });

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
        const [typeA, confA] = a;
        const [typeB, confB] = b;
        const activeA = activeTypeCounts[typeA] || 0;
        const activeB = activeTypeCounts[typeB] || 0;
        if (activeA !== activeB) return activeA - activeB;

        const lastA = lastSpawnAtByType.get(typeA) || 0;
        const lastB = lastSpawnAtByType.get(typeB) || 0;
        if (lastA !== lastB) return lastA - lastB;

        return confB.probability - confA.probability;
    });

    return candidates[0];
}

function pickRandomImpactPoint() {
    return {
        x: Math.floor(220 + Math.random() * (1280 - 440)),
        y: Math.floor(170 + Math.random() * (720 - 340))
    };
}

type SpawnSide = 'left' | 'right' | 'top' | 'bottom';

function randomInt(min: number, max: number): number {
    return Math.floor(min + (Math.random() * (max - min + 1)));
}

function resolveSpawnOriginForType(type: string): { side: SpawnSide; x: number; y: number } {
    if (type === 'fish8' || type === 'fish9' || type === 'fish10') {
        const origins: Array<{ side: SpawnSide; x: () => number; y: () => number }> = [
            { side: 'left',   x: () => -220, y: () => randomInt(160, 520) },
            { side: 'right',  x: () => 1500, y: () => randomInt(160, 520) },
            { side: 'top',    x: () => randomInt(260, 1020), y: () => -180 },
            { side: 'bottom', x: () => randomInt(260, 1020), y: () => 900 },
            { side: 'top',    x: () => randomInt(90, 260), y: () => -180 },
            { side: 'top',    x: () => randomInt(1020, 1190), y: () => -180 },
            { side: 'bottom', x: () => randomInt(90, 260), y: () => 900 },
            { side: 'bottom', x: () => randomInt(1020, 1190), y: () => 900 }
        ];
        const selected = origins[randomInt(0, origins.length - 1)];
        return { side: selected.side, x: selected.x(), y: selected.y() };
    }

    const side: SpawnSide = secureRandom() > 0.5 ? 'left' : 'right';
    return {
        side,
        x: side === 'left' ? -200 : 1480,
        y: randomInt(150, 420)
    };
}

function isValidBetAmount(betAmount: number, isTorpedo: boolean): boolean {
    if (!Number.isFinite(betAmount) || betAmount <= 0) return false;
    const roundedBet = Number(betAmount.toFixed(2));
    const isValidBaseStep = (baseBet: number): boolean => {
        if (baseBet < SERVER_MIN_BASE_BET || baseBet > SERVER_MAX_BASE_BET) return false;
        const scaled = Math.round(baseBet * 100);
        const minScaled = Math.round(SERVER_MIN_BASE_BET * 100);
        const stepScaled = Math.round(SERVER_BET_STEP * 100);
        return ((scaled - minScaled) % stepScaled) === 0;
    };
    if (!isTorpedo) {
        return isValidBaseStep(roundedBet);
    }

    const baseEquivalent = Number((roundedBet / 6).toFixed(2));
    return isValidBaseStep(baseEquivalent);
}

function countActiveSeats(): number {
    return seats.filter(Boolean).length;
}
function rotateStage() {
    currentStageIndex = (currentStageIndex + 1) % STAGES.length;
    const newStage = STAGES[currentStageIndex];
    io.emit('stage-changed', { stageName: newStage.name, bg: newStage.bg, index: currentStageIndex });
}
setInterval(rotateStage, GAME_CONFIG.STAGE_DURATION_MS);
io.on('connection', async (socket) => {
    const requestedUserId = (socket.handshake.query.userId as string) || '';
    if (!isSocketTransportSecure(socket)) {
        metrics.rejectedConnections += 1;
        incrementReasonCounter(metrics.rejectByReason, 'INSECURE_TRANSPORT');
        socket.emit('action-rejected', { reason: 'INSECURE_TRANSPORT' });
        socket.disconnect(true);
        return;
    }

    const token = readSocketToken(socket);
    const authResult = resolveTokenAuth(token, requestedUserId);
    if (!authResult.ok) {
        metrics.rejectedConnections += 1;
        metrics.rejectedActions += 1;
        incrementReasonCounter(metrics.rejectByReason, authResult.reason || 'UNAUTHORIZED_SOCKET_TOKEN');
        socket.emit('action-rejected', { reason: authResult.reason || 'UNAUTHORIZED_SOCKET_TOKEN' });
        socket.disconnect(true);
        return;
    }

    const userId = authResult.userId || requestedUserId || `user_${socket.id.substring(0, 5)}`;
    metrics.acceptedConnections += 1;
    metrics.activeConnections += 1;
    console.log(`[Socket] New connection: ${socket.id} (User: ${userId})`);
    socketToUser.set(socket.id, userId);

    const eventWindows: Record<string, number[]> = {
        shoot: [],
        orb: []
    };
    const isRateLimited = (key: 'shoot' | 'orb', maxEvents: number, windowMs: number): boolean => {
        const now = Date.now();
        const recent = eventWindows[key].filter(ts => now - ts < windowMs);
        if (recent.length >= maxEvents) {
            eventWindows[key] = recent;
            return true;
        }
        recent.push(now);
        eventWindows[key] = recent;
        return false;
    };

    let user = await dbGet("SELECT * FROM users WHERE userId = ?", [userId]);
    if (!user) {
        await dbRun("INSERT INTO users (userId, balance, energy, lastLogin) VALUES (?, ?, ?, ?)", [userId, GAME_CONFIG.INITIAL_BALANCE, 0, Date.now()]);
        user = { userId, balance: GAME_CONFIG.INITIAL_BALANCE, energy: 0 };
    }
    let seatIndex = -1;
    for (let i = 0; i < seats.length; i++) {
        if (seats[i] === null) {
            seats[i] = { socketId: socket.id, userId, balance: user.balance, energy: user.energy } as SeatState;
            seatIndex = i;
            break;
        }
    }
    socket.emit('clear-all-fish');

    socket.emit('init-game', {
        balance: user.balance,
        energy: user.energy,
        jackpot: globalJackpot,
        isFrozen: Date.now() < gameFrozenUntil,
        currentStage: STAGES[currentStageIndex],
        jackpotLimits: GAME_CONFIG.JACKPOT_LIMITS,
        electricThreshold: GAME_CONFIG.ELECTRIC_CANNON_THRESHOLD,
        seats,
        mySeatIndex: seatIndex
    });
    socket.broadcast.emit('player-joined', { seatIndex, userId, socketId: socket.id, balance: user.balance, energy: user.energy });

    socket.emit('current-fish', Array.from(activeFish.values()));

    socket.on('shoot', async (data: { fishId: string, betAmount: number, isTorpedo?: boolean }) => {
        const userId = socketToUser.get(socket.id);
        if (!userId) return;
        if (isRateLimited('shoot', 16, 1000)) {
            metrics.rateLimitShootHits += 1;
            metrics.rejectedActions += 1;
            incrementReasonCounter(metrics.rejectByReason, 'RATE_LIMIT_SHOOT');
            socket.emit('shoot-result', {
                fishId: data?.fishId || '',
                killed: false,
                rejected: true,
                reason: 'RATE_LIMIT_SHOOT',
                newBalance: seats.find((seat: SeatState | null) => seat?.socketId === socket.id)?.balance
            });
            return;
        }

        const betAmount = Number(data.betAmount);
        if (!isValidBetAmount(betAmount, !!data.isTorpedo)) {
            metrics.rejectedActions += 1;
            incrementReasonCounter(metrics.rejectByReason, 'INVALID_BET_AMOUNT');
            socket.emit('shoot-result', {
                fishId: data?.fishId || '',
                killed: false,
                rejected: true,
                reason: 'INVALID_BET_AMOUNT'
            });
            return;
        }
        metrics.shootEvents += 1;
        lastGameplayAt = Date.now();

        const user = await dbGet("SELECT balance, energy FROM users WHERE userId = ?", [userId]);
        if (!user) return;
        if (user.balance < betAmount) {
            metrics.rejectedActions += 1;
            incrementReasonCounter(metrics.rejectByReason, 'INSUFFICIENT_BALANCE');
            socket.emit('shoot-result', {
                fishId: data.fishId,
                killed: false,
                rejected: true,
                reason: 'INSUFFICIENT_BALANCE',
                newBalance: user.balance,
                betAmount
            });
            return;
        }

        // Call Operator API to withdraw bet
        let operatorBalance = user.balance;
        try {
            const withdrawRes = await operatorApi.withdraw(userId, betAmount, `bet-${Date.now()}-${secureRandom()}`);
            if (!withdrawRes.success) {
                metrics.rejectedActions += 1;
                incrementReasonCounter(metrics.rejectByReason, 'OPERATOR_WITHDRAW_FAILED');
                socket.emit('shoot-result', {
                    fishId: data.fishId,
                    killed: false,
                    rejected: true,
                    reason: 'OPERATOR_WITHDRAW_FAILED',
                    newBalance: user.balance,
                    betAmount
                });
                return;
            }
            if (withdrawRes.data && typeof withdrawRes.data.balance === 'number') {
                operatorBalance = withdrawRes.data.balance;
            } else {
                operatorBalance -= betAmount;
            }
        } catch (err) {
            console.error('Operator Withdraw Error:', err);
            socket.emit('shoot-result', {
                fishId: data.fishId,
                killed: false,
                rejected: true,
                reason: 'OPERATOR_API_ERROR',
                newBalance: user.balance,
                betAmount
            });
            return;
        }

        const balanceAfterBet = operatorBalance;
        const newEnergy = Math.min(GAME_CONFIG.ELECTRIC_CANNON_THRESHOLD, user.energy + (betAmount * GAME_CONFIG.ENERGY_PER_BET_RATIO));
        
        await dbRun("UPDATE users SET balance = ?, energy = ? WHERE userId = ?", [balanceAfterBet, newEnergy, userId]);
        await recordTransaction(
            userId,
            'BET',
            -betAmount,
            user.balance,
            balanceAfterBet,
            JSON.stringify({ fishId: data.fishId || null, isTorpedo: !!data.isTorpedo })
        );
        globalJackpot += (betAmount * GAME_CONFIG.JACKPOT_TAX);

        const seatIndex = seats.findIndex((seat: SeatState | null) => seat?.socketId === socket.id);
        if (seatIndex !== -1 && seats[seatIndex]) {
            seats[seatIndex].balance = balanceAfterBet;
            seats[seatIndex].energy = newEnergy;
            emitSeatBalanceUpdate(seatIndex, seats[seatIndex] as SeatState);
        }

        socket.emit('energy-update', { energy: newEnergy });

        const fish = activeFish.get(data.fishId);
        if (!fish) {
            socket.emit('shoot-result', { fishId: data.fishId, killed: false, newBalance: balanceAfterBet, betAmount });
            return;
        }
        const damageApplied = calculateShotDamage(betAmount, !!data.isTorpedo);
        fish.hp = Math.max(0, Number((Number(fish.hp || 0) - damageApplied).toFixed(2)));
        const killed = fish.hp <= 0;
        
        let responseWinAmount = 0;
        let responseJackpotWinAmount = 0;
        let responseJackpotTier: JackpotTier | null = null;
        let responseNewBalance = balanceAfterBet;

        if (killed) {
            const baseWinAmount = fish.score * betAmount;
            let jackpotWinAmount = 0;
            let jackpotTier: JackpotTier | null = null;

            const tier = resolveJackpotTier(betAmount);
            if (tier) {
                const jackpotRand = secureRandom();
                if (jackpotRand < GAME_CONFIG.JACKPOT_TRIGGER_CHANCE[tier]) {
                    jackpotTier = tier;
                    jackpotWinAmount = Math.min(
                        globalJackpot * GAME_CONFIG.JACKPOT_PAYOUT_RATIO[tier],
                        GAME_CONFIG.JACKPOT_PAYOUT_CAP[tier]
                    );
                    jackpotWinAmount = Math.max(0, Number(jackpotWinAmount.toFixed(2)));
                    globalJackpot = Math.max(GAME_CONFIG.JACKPOT_POOL_FLOOR, globalJackpot - jackpotWinAmount);
                    io.emit('jackpot-update', globalJackpot);
                }
            }

            const winAmount = baseWinAmount + jackpotWinAmount;
            
            // Call Operator API to deposit win
            let finalOperatorBalance = balanceAfterBet;
            if (winAmount > 0) {
                try {
                    const depositRes = await operatorApi.deposit(userId, winAmount, `win-${Date.now()}-${secureRandom()}`);
                    if (depositRes.success && depositRes.data && typeof depositRes.data.balance === 'number') {
                        finalOperatorBalance = depositRes.data.balance;
                    } else {
                        finalOperatorBalance += winAmount;
                    }
                } catch (err) {
                    console.error('Operator Deposit Error:', err);
                    finalOperatorBalance += winAmount; // Optimistically update locally
                }
            }

            const finalBalance = finalOperatorBalance;
            responseWinAmount = winAmount;
            responseJackpotWinAmount = jackpotWinAmount;
            responseJackpotTier = jackpotTier;
            responseNewBalance = finalBalance;
            metrics.fishKilled += 1;
            metrics.payoutTotal = Number((metrics.payoutTotal + winAmount).toFixed(2));
            metrics.lastKillAt = Date.now();
            await dbRun("UPDATE users SET balance = ? WHERE userId = ?", [finalBalance, userId]);
            await recordTransaction(
                userId,
                jackpotTier ? 'WIN_JACKPOT' : 'WIN',
                winAmount,
                balanceAfterBet,
                finalBalance,
                JSON.stringify({ fishId: data.fishId, fishType: fish.type, baseWinAmount, jackpotWinAmount, jackpotTier })
            );
            if (seatIndex !== -1 && seats[seatIndex]) {
                seats[seatIndex].balance = finalBalance;
                emitSeatBalanceUpdate(seatIndex, seats[seatIndex] as SeatState);
            }
            activeFish.delete(data.fishId);
            io.emit('fish-killed', {
                fishId: data.fishId,
                killerId: socket.id,
                winAmount,
                baseWinAmount,
                jackpotWinAmount,
                jackpotTier,
                effect: fish.effect
            });
            if (jackpotWinAmount > 0 && jackpotTier) {
                io.emit('jackpot-win', {
                    winnerId: socket.id,
                    userId,
                    tier: jackpotTier,
                    amount: jackpotWinAmount,
                    fishId: data.fishId
                });
            }
        }

        socket.emit('shoot-result', {
            fishId: data.fishId,
            killed,
            rejected: false,
            newBalance: responseNewBalance,
            betAmount,
            damageApplied,
            fishHp: fish.hp,
            fishMaxHp: fish.maxHp,
            winAmount: responseWinAmount,
            jackpotWinAmount: responseJackpotWinAmount,
            jackpotTier: responseJackpotTier
        });
    });

    socket.on('activate-lucky-orb', async (data: { betAmount?: number; impactX?: number; impactY?: number }) => {
        const userId = socketToUser.get(socket.id);
        if (!userId) return;
        if (isRateLimited('orb', 3, 8000)) {
            metrics.rateLimitOrbHits += 1;
            metrics.rejectedActions += 1;
            incrementReasonCounter(metrics.rejectByReason, 'RATE_LIMIT_ORB');
            socket.emit('action-rejected', { reason: 'RATE_LIMIT_ORB' });
            return;
        }
        metrics.orbEvents += 1;

        const user = await dbGet("SELECT balance, energy FROM users WHERE userId = ?", [userId]);
        if (!user) return;
        if (user.energy < GAME_CONFIG.ELECTRIC_CANNON_THRESHOLD) return;

        const newEnergy = 0;
        await dbRun("UPDATE users SET energy = ? WHERE userId = ?", [newEnergy, userId]);

        const seatIndex = seats.findIndex((seat: SeatState | null) => seat?.socketId === socket.id);
        if (seatIndex !== -1 && seats[seatIndex]) {
            seats[seatIndex].energy = newEnergy;
            emitSeatBalanceUpdate(seatIndex, seats[seatIndex] as SeatState);
        }
        socket.emit('energy-update', { energy: newEnergy });

        const rawBet = Number(data?.betAmount ?? 0.1);
        const orbBetAmount = Number.isFinite(rawBet) && rawBet > 0 ? rawBet : 0.1;
        if (!isValidBetAmount(orbBetAmount, false)) {
            metrics.rejectedActions += 1;
            incrementReasonCounter(metrics.rejectByReason, 'INVALID_ORB_BET');
            socket.emit('action-rejected', { reason: 'INVALID_ORB_BET' });
            return;
        }
        lastGameplayAt = Date.now();

        const fallbackImpact = pickRandomImpactPoint();
        const rawImpactX = Number(data?.impactX ?? fallbackImpact.x);
        const rawImpactY = Number(data?.impactY ?? fallbackImpact.y);
        const impactX = clamp(Number.isFinite(rawImpactX) ? rawImpactX : fallbackImpact.x, 120, 1160);
        const impactY = clamp(Number.isFinite(rawImpactY) ? rawImpactY : fallbackImpact.y, 120, 600);

        const lucky = secureRandom() < GAME_CONFIG.LUCKY_ORB_HIT_CHANCE;
        const killedFishIds: string[] = [];
        let totalWinAmount = 0;

        if (lucky) {
            const candidates = Array.from(activeFish.values()).filter((fish) => {
                if (fish.type === 'sharkjumbo_v2') return false;
                const distance = Math.hypot((fish.x || 0) - impactX, (fish.y || 0) - impactY);
                return distance <= GAME_CONFIG.LUCKY_ORB_RADIUS;
            });

            if (candidates.length > 0) {
                const shuffled = [...candidates].sort(() => secureRandom() - 0.5);
                const killCount = Math.min(
                    shuffled.length,
                    Math.max(GAME_CONFIG.LUCKY_ORB_MIN_KILLS, GAME_CONFIG.LUCKY_ORB_MAX_KILLS)
                );

                for (let i = 0; i < killCount; i++) {
                    const fish = shuffled[i];
                    if (!fish || !activeFish.has(fish.id)) continue;

                    activeFish.delete(fish.id);
                    killedFishIds.push(fish.id);
                    const winAmount = fish.score * orbBetAmount;
                    totalWinAmount += winAmount;
                    metrics.fishKilled += 1;
                    io.emit('fish-killed', {
                        fishId: fish.id,
                        killerId: socket.id,
                        winAmount,
                        baseWinAmount: winAmount,
                        jackpotWinAmount: 0,
                        jackpotTier: null,
                        effect: fish.effect
                    });
                }
            }
        }

        let finalBalance = user.balance;
        if (totalWinAmount > 0) {
            finalBalance = user.balance + totalWinAmount;
            metrics.payoutTotal = Number((metrics.payoutTotal + totalWinAmount).toFixed(2));
            metrics.lastKillAt = Date.now();
            await dbRun("UPDATE users SET balance = ? WHERE userId = ?", [finalBalance, userId]);
            await recordTransaction(
                userId,
                'WIN_LUCKY_ORB',
                totalWinAmount,
                user.balance,
                finalBalance,
                JSON.stringify({ impactX, impactY, orbBetAmount, killedFishIds })
            );
            if (seatIndex !== -1 && seats[seatIndex]) {
                seats[seatIndex].balance = finalBalance;
                emitSeatBalanceUpdate(seatIndex, seats[seatIndex] as SeatState);
            }
        } else {
            await recordTransaction(
                userId,
                'CAST_LUCKY_ORB',
                0,
                user.balance,
                user.balance,
                JSON.stringify({ impactX, impactY, orbBetAmount, lucky: false })
            );
        }

        io.emit('lucky-orb-cast', {
            activatorId: socket.id,
            impactX,
            impactY,
            lucky,
            killedFishIds,
            totalWinAmount
        });
    });

    socket.on('fish-escaped', (data: { fishId: string }) => {
        activeFish.delete(data.fishId);
    });

    socket.on('disconnect', () => {
        metrics.activeConnections = Math.max(0, metrics.activeConnections - 1);
        const seatIdx = seats.findIndex(s => s?.socketId === socket.id);
        if (seatIdx !== -1) {
            seats[seatIdx] = null;
            io.emit('player-left', { seatIndex: seatIdx });
        }
        socketToUser.delete(socket.id);
    });
});
setInterval(() => {
    const now = Date.now();
    for (const [id, fish] of activeFish.entries()) {
        if (now - fish.spawnTime > 30000) activeFish.delete(id);
    }
}, 5000);

setInterval(() => {
    globalJackpot += GAME_CONFIG.JACKPOT_INCREMENT;
    io.emit('jackpot-update', globalJackpot);
}, 1000);
setInterval(() => {
    if (Date.now() < gameFrozenUntil) return;
    const activeSeats = countActiveSeats();
    if (activeSeats <= 0) return;

    const idleMs = Date.now() - lastGameplayAt;
    let dynamicCap = GAME_CONFIG.MAX_FISH_ON_SCREEN;
    if (activeSeats === 1) {
        if (idleMs > 45000) {
            dynamicCap = 2;
        } else if (idleMs > 25000) {
            dynamicCap = 4;
        } else if (idleMs > 10000) {
            dynamicCap = 6;
        } else {
            dynamicCap = 9;
        }
    } else if (activeSeats === 2) {
        dynamicCap = idleMs > 30000 ? 8 : 12;
    }

    if (activeFish.size >= dynamicCap) return;
    if (activeSeats === 1) {
        if (idleMs > 45000 && secureRandom() > 0.18) return;
        if (idleMs > 25000 && secureRandom() > 0.30) return;
        if (idleMs > 10000 && secureRandom() > 0.52) return;
    }

    const stage = STAGES[currentStageIndex];
    let selectedCategory = pickWeightedCategory(stage);

    const hasBoss = Array.from(activeFish.values()).some(f => f.type === 'sharkjumbo_v2');
    const isBossCooldownActive = Date.now() < nextBossAllowedTime;
    if (selectedCategory === 'BOSS' && (hasBoss || isBossCooldownActive)) {
        selectedCategory = 'NORMAL';
    }

    const fallbackOrder: FishCategory[] = [selectedCategory, 'NORMAL', 'GOLDEN', 'SPECIAL', 'BOSS'];
    let picked: [string, (typeof FISH_CONFIGS)[string]] | null = null;

    for (const category of fallbackOrder) {
        if (category === 'BOSS' && (hasBoss || isBossCooldownActive)) continue;
        picked = pickFishTypeForCategory(category);
        if (picked) break;
    }

    if (!picked) return;

    const [type, config] = picked;
    if (config.category === 'BOSS') {
        nextBossAllowedTime = Date.now() + GAME_CONFIG.BOSS_SPAWN_COOLDOWN_MS;
    }

    const spawnOrigin = resolveSpawnOriginForType(type);
    const side = spawnOrigin.side;
    const spawnX = spawnOrigin.x;
    const spawnY = spawnOrigin.y;

    const newFish = { 
        id: crypto.randomUUID(), 
        type, 
        hp: config.hp * 10, 
        maxHp: config.hp * 10, 
        score: config.score, 
        effect: config.effect, 
        side,
        x: spawnX,
        y: spawnY,
        spawnTime: Date.now() 
    };

    activeFish.set(newFish.id, newFish);
    lastSpawnAtByType.set(type, Date.now());
    console.log(`[Spawn] Fish spawned: ${newFish.type} (ID: ${newFish.id}) - Active count: ${activeFish.size}`);
    io.emit('spawn-fish', newFish);
}, GAME_CONFIG.SPAWN_INTERVAL_MS);

async function bootstrap() {
    await ensureAuthUsersSchema();
    await ensureTransactionHashColumns();
    await backfillTransactionHashes();
    httpServer.listen(PORT, () => console.log(`Server iTech Labs STABLE Ready :${PORT}`));
}

bootstrap().catch((error) => {
    console.error('Server bootstrap failed:', error);
    process.exit(1);
});
