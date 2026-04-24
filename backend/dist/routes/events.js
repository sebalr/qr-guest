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
router.use((0, roles_1.requireRole)(['owner', 'admin']));
router.get('/', async (req, res) => {
    const events = await prisma_1.default.event.findMany({
        where: { tenantId: req.user.tenantId },
        orderBy: { startsAt: 'asc' },
    });
    res.json({ data: events });
});
router.post('/', async (req, res) => {
    const { name, startsAt, endsAt } = req.body;
    if (!name || !startsAt || !endsAt) {
        res.status(400).json({ error: 'name, startsAt, and endsAt are required' });
        return;
    }
    const event = await prisma_1.default.event.create({
        data: {
            tenantId: req.user.tenantId,
            name,
            startsAt: new Date(startsAt),
            endsAt: new Date(endsAt),
        },
    });
    res.status(201).json({ data: event });
});
exports.default = router;
//# sourceMappingURL=events.js.map