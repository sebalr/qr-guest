"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../prisma"));
const auth_1 = require("../middleware/auth");
const roles_1 = require("../middleware/roles");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
router.use(roles_1.requireSuperAdmin);
router.get('/tenants', async (_req, res) => {
    const tenants = await prisma_1.default.tenant.findMany({ orderBy: { createdAt: 'asc' } });
    res.json({ data: tenants });
});
router.post('/tenants/:id/upgrade', async (req, res) => {
    const tenant = await prisma_1.default.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) {
        res.status(404).json({ error: 'Tenant not found' });
        return;
    }
    const updated = await prisma_1.default.tenant.update({
        where: { id: req.params.id },
        data: { plan: 'pro' },
    });
    res.json({ data: updated });
});
router.post('/tenants/:id/downgrade', async (req, res) => {
    const tenant = await prisma_1.default.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) {
        res.status(404).json({ error: 'Tenant not found' });
        return;
    }
    const updated = await prisma_1.default.tenant.update({
        where: { id: req.params.id },
        data: { plan: 'free' },
    });
    res.json({ data: updated });
});
exports.default = router;
//# sourceMappingURL=admin.js.map