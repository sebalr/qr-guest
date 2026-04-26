import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface JwtPayload {
	userId: string;
	tenantId: string;
	role: string;
	isSuperAdmin: boolean;
	email?: string;
}

declare global {
	namespace Express {
		interface Request {
			user?: JwtPayload;
		}
	}
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
	const authHeader = req.headers.authorization;
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		res.status(401).json({ error: 'Missing or invalid authorization header' });
		return;
	}

	const token = authHeader.slice(7);
	const secret = process.env.JWT_SECRET;
	if (!secret) {
		res.status(500).json({ error: 'Server misconfiguration: JWT_SECRET not set' });
		return;
	}

	try {
		const payload = jwt.verify(token, secret) as JwtPayload;
		if (process.env.LOG_TENANT_DB_DEBUG === '1') {
			console.log('[auth] token payload', {
				path: req.path,
				method: req.method,
				userId: payload.userId,
				tenantId: payload.tenantId,
				role: payload.role,
				isSuperAdmin: payload.isSuperAdmin,
			});
		}
		req.user = payload;
		next();
	} catch {
		res.status(401).json({ error: 'Invalid or expired token' });
	}
}
