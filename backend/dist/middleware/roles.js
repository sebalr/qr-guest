"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = requireRole;
exports.requireSuperAdmin = requireSuperAdmin;
function requireRole(roles) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        if (!roles.includes(req.user.role)) {
            res.status(403).json({ error: 'Forbidden: insufficient role' });
            return;
        }
        next();
    };
}
function requireSuperAdmin(req, res, next) {
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
//# sourceMappingURL=roles.js.map