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

export function requireTemporaryScannerEventAccess(paramName = 'id') {
	return (req: Request, res: Response, next: NextFunction): void => {
		if (!req.user) {
			res.status(401).json({ error: 'Unauthorized' });
			return;
		}

		if (req.user.isSuperAdmin || req.user.isTemporaryScanner !== true) {
			next();
			return;
		}

		const rawEventId = req.params[paramName];
		const eventId = Array.isArray(rawEventId) ? rawEventId[0] : rawEventId;
		if (!eventId || req.user.eventId !== eventId) {
			res.status(403).json({ error: 'Forbidden: scanner access is limited to one event' });
			return;
		}

		next();
	};
}
