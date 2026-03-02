const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

class ApiService {
    private baseUrl: string;

    constructor() {
        this.baseUrl = API_BASE_URL;
    }

    private getToken(): string | null {
        return localStorage.getItem('pairon_token');
    }

    private getHeaders(includeAuth = true): HeadersInit {
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
        };

        if (includeAuth) {
            const token = this.getToken();
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
        }

        return headers;
    }

    private async handleResponse<T>(response: Response): Promise<T> {
        const data = await response.json();

        if (!response.ok) {
            // If unauthorized, clear stored auth
            if (response.status === 401) {
                localStorage.removeItem('pairon_token');
                localStorage.removeItem('pairon_user');
            }
            throw new Error(data.message || `Request failed with status ${response.status}`);
        }

        return data as T;
    }

    // ===== Auth =====

    async login(email: string, password: string) {
        const response = await fetch(`${this.baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: this.getHeaders(false),
            body: JSON.stringify({ email, password }),
        });
        return this.handleResponse<{ token: string; user: any }>(response);
    }

    async register(email: string, password: string, name: string) {
        const response = await fetch(`${this.baseUrl}/api/auth/register`, {
            method: 'POST',
            headers: this.getHeaders(false),
            body: JSON.stringify({ email, password, name }),
        });
        return this.handleResponse<{ token: string; user: any }>(response);
    }

    async getMe() {
        const response = await fetch(`${this.baseUrl}/api/auth/me`, {
            method: 'GET',
            headers: this.getHeaders(),
        });
        return this.handleResponse<{ user: any }>(response);
    }

    // ===== User Profile =====

    async getProfile() {
        const response = await fetch(`${this.baseUrl}/api/users/profile`, {
            method: 'GET',
            headers: this.getHeaders(),
        });
        return this.handleResponse<{ user: any }>(response);
    }

    async updateProfile(updates: Record<string, any>) {
        const response = await fetch(`${this.baseUrl}/api/users/profile`, {
            method: 'PATCH',
            headers: this.getHeaders(),
            body: JSON.stringify(updates),
        });
        return this.handleResponse<{ user: any }>(response);
    }

    async getStats() {
        const response = await fetch(`${this.baseUrl}/api/users/stats`, {
            method: 'GET',
            headers: this.getHeaders(),
        });
        return this.handleResponse<{ stats: any }>(response);
    }

    // ===== Credits =====

    async getCreditHistory(page = 1) {
        const response = await fetch(`${this.baseUrl}/api/credits/history?page=${page}`, {
            method: 'GET',
            headers: this.getHeaders(),
        });
        return this.handleResponse<{ transactions: any[]; pagination: any }>(response);
    }

    async getCreditSummary() {
        const response = await fetch(`${this.baseUrl}/api/credits/summary`, {
            method: 'GET',
            headers: this.getHeaders(),
        });
        return this.handleResponse<{ balance: number; totalEarned: number; totalSpent: number; reputation: number }>(response);
    }

    async getCreditPricing() {
        const response = await fetch(`${this.baseUrl}/api/credits/pricing`, {
            method: 'GET',
            headers: this.getHeaders(),
        });
        return this.handleResponse<{ earning: any; spending: any }>(response);
    }

    async removeRemark() {
        const response = await fetch(`${this.baseUrl}/api/credits/remove-remark`, {
            method: 'POST',
            headers: this.getHeaders(),
        });
        return this.handleResponse<{ message: string; credits: number }>(response);
    }

    // ===== Certificates =====

    async getCertificates() {
        const response = await fetch(`${this.baseUrl}/api/certificates`, {
            method: 'GET',
            headers: this.getHeaders(),
        });
        return this.handleResponse<{ certificates: any[] }>(response);
    }

    async generateCertificate(sessionId: string) {
        const response = await fetch(`${this.baseUrl}/api/certificates/generate`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({ sessionId }),
        });
        return this.handleResponse<{ certificate: any; message: string }>(response);
    }

    async verifyCertificate(certificateId: string) {
        const response = await fetch(`${this.baseUrl}/api/certificates/verify/${certificateId}`, {
            method: 'GET',
            headers: this.getHeaders(false),
        });
        return this.handleResponse<{ valid: boolean; certificate: any }>(response);
    }
}

export const api = new ApiService();
