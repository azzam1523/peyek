import crypto from 'crypto';

export class OperatorApiClient {
    private baseUrl: string;
    private apiKey: string;
    private apiSecret: string;

    constructor() {
        this.baseUrl = process.env.OPERATOR_BASE_URL || 'http://192.206.117.106:6601';
        this.apiKey = process.env.OPERATOR_API_KEY || 'test-api-key-1234567890abcdef1234567890abcdef1234';
        this.apiSecret = process.env.OPERATOR_API_SECRET || 'test-secret-key-for-hmac-signing-32ch';
    }

    private async makeRequest(endpoint: string, payload: any) {
        const bodyStr = JSON.stringify(payload);
        const timestamp = Date.now().toString();
        const stringToSign = bodyStr + timestamp;
        
        const signature = crypto.createHmac('sha256', this.apiSecret)
                                .update(stringToSign)
                                .digest('hex');

        const url = `${this.baseUrl}${endpoint}`;
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': this.apiKey,
                    'X-Timestamp': timestamp,
                    'X-Signature': signature
                },
                body: bodyStr
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Operator API HTTP Error: ${response.status} - ${text}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error(`[Operator API] Error requesting ${endpoint}:`, error);
            throw error;
        }
    }

    async createPlayer(username: string) {
        return this.makeRequest('/v1/player/create-player', { username });
    }

    async loginToken(playerId: string) {
        return this.makeRequest('/v1/player/login-token', { playerId });
    }

    async checkInfo(playerId: string) {
        return this.makeRequest('/v1/player/check-info', { playerId });
    }

    async deposit(playerId: string, amount: number, referenceId: string) {
        return this.makeRequest('/v1/player/deposit', { playerId, amount, referenceId });
    }

    async withdraw(playerId: string, amount: number, referenceId: string) {
        return this.makeRequest('/v1/player/withdraw', { playerId, amount, referenceId });
    }
}

export const operatorApi = new OperatorApiClient();
