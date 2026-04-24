import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface JWTPayload {
	sub?: string;
	userId?: string;
	tenantId?: string;
	role?: string;
	isSuperAdmin?: boolean;
	email?: string;
	exp?: number;
}

interface AuthUser {
	userId: string;
	tenantId: string;
	role: string;
	isSuperAdmin: boolean;
	email: string;
}

interface AuthContextValue {
	user: AuthUser | null;
	token: string | null;
	login: (token: string) => void;
	logout: () => void;
	isRole: (roles: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function decodeJWT(token: string): JWTPayload | null {
	try {
		const parts = token.split('.');
		if (parts.length !== 3) return null;
		const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
		const normalizedPayload = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=');
		const decoded = JSON.parse(atob(normalizedPayload));
		return decoded as JWTPayload;
	} catch {
		return null;
	}
}

function tokenToUser(token: string): AuthUser | null {
	const payload = decodeJWT(token);
	if (!payload) return null;
	if (payload.exp && payload.exp * 1000 < Date.now()) return null;
	const userId = payload.userId ?? payload.sub;
	if (!userId || !payload.tenantId || !payload.role) return null;

	return {
		userId,
		tenantId: payload.tenantId,
		role: payload.role,
		isSuperAdmin: payload.isSuperAdmin === true,
		email: payload.email ?? '',
	};
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
	const [user, setUser] = useState<AuthUser | null>(() => {
		const t = localStorage.getItem('token');
		return t ? tokenToUser(t) : null;
	});

	const login = useCallback((newToken: string) => {
		const u = tokenToUser(newToken);
		if (!u) return;
		localStorage.setItem('token', newToken);
		setToken(newToken);
		setUser(u);
	}, []);

	const logout = useCallback(() => {
		localStorage.removeItem('token');
		setToken(null);
		setUser(null);
	}, []);

	const isRole = useCallback(
		(roles: string[]) => {
			if (!user) return false;
			return roles.includes(user.role);
		},
		[user],
	);

	return <AuthContext.Provider value={{ user, token, login, logout, isRole }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
	return ctx;
}
