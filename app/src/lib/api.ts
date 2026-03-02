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
}

export const api = new ApiService();
