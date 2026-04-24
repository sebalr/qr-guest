"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = __importDefault(require("../prisma"));
const router = (0, express_1.Router)();
router.post('/register', async (req, res) => {
    const { tenantName, email, password } = req.body;
    if (!tenantName || !email || !password) {
        res.status(400).json({ error: 'tenantName, email, and password are required' });
        return;
    }
    const existing = await prisma_1.default.user.findUnique({ where: { email } });
    if (existing) {
        res.status(409).json({ error: 'Email already in use' });
        return;
    }
    const passwordHash = await bcryptjs_1.default.hash(password, 12);
    const tenant = await prisma_1.default.tenant.create({ data: { name: tenantName } });
    const user = await prisma_1.default.user.create({
        data: {
            tenantId: tenant.id,
            email,
            passwordHash,
            role: 'owner',
        },
    });
    const secret = process.env.JWT_SECRET;
    const token = jsonwebtoken_1.default.sign({ userId: user.id, tenantId: tenant.id, role: user.role, isSuperAdmin: user.isSuperAdmin }, secret, { expiresIn: '7d' });
    res.status(201).json({ data: { token } });
});
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        res.status(400).json({ error: 'email and password are required' });
        return;
    }
    const user = await prisma_1.default.user.findUnique({
        where: { email },
        include: { tenant: true },
    });
    if (!user) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
    }
    const valid = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!valid) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
    }
    if (user.role === 'scanner' && user.tenant.plan === 'free') {
        res.status(403).json({ error: 'Scanner role not allowed on free plan' });
        return;
    }
    const secret = process.env.JWT_SECRET;
    const token = jsonwebtoken_1.default.sign({ userId: user.id, tenantId: user.tenantId, role: user.role, isSuperAdmin: user.isSuperAdmin }, secret, { expiresIn: '7d' });
    res.json({ data: { token } });
});
exports.default = router;
//# sourceMappingURL=auth.js.map