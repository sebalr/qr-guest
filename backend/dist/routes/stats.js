"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.statsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const roles_1 = require("../middleware/roles");
const prisma_1 = __importDefault(require("../prisma"));
const router = (0, express_1.Router)();
exports.statsRouter = router;
router.use(auth_1.authMiddleware);
router.use((0, roles_1.requireRole)(['owner', 'admin']));
router.get('/:id/stats', async (req, res) => {
    const eventId = req.params.id;
    const event = await prisma_1.default.event.findFirst({
        where: { id: eventId, tenantId: req.user.tenantId },
    });
    if (!event) {
        res.status(404).json({ error: 'Event not found' });
        return;
    }
    const [totalScans, uniqueTicketsResult] = await Promise.all([
        prisma_1.default.scan.count({ where: { eventId } }),
        prisma_1.default.scan.groupBy({
            by: ['ticketId'],
            where: { eventId },
        }),
    ]);
    const uniqueTickets = uniqueTicketsResult.length;
    const duplicates = totalScans - uniqueTickets;
    res.json({ data: { totalScans, uniqueTickets, duplicates } });
});
exports.default = router;
//# sourceMappingURL=stats.js.map