import { Request, Response, NextFunction } from 'express';

export function requireRole(roles: string[]) {
	return (req: Request, res: Response, next: NextFunction): void => {
		if (!req.user) {
			res.status(401).json({ error: 'Unauthorized' });
			return;
		}
		if (req.user.isSuperAdmin) {
			next();
			return;
		}
		if (!roles.includes(req.user.role)) {
			res.status(403).json({ error: 'Forbidden: insufficient role' });
			return;
		}
		next();
	};
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
	if (!req.user) {
		res.status(401).json({ error: 'Unauthorized' });
		return;
	}
	if (!req.user.isSuperAdmin) {
		res.status(403).json({ error: 'Forbidden: super admin only' });
		return;
	}
	next();
}
