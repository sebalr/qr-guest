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
router.use((0, roles_1.requireRole)(['owner', 'admin', 'scanner']));
router.post('/', async (req, res) => {
    const { ticketId, eventId, deviceId, scannedAt, confirmed } = req.body;
    if (!ticketId || !eventId || !deviceId || !scannedAt) {
        res.status(400).json({ error: 'ticketId, eventId, deviceId, and scannedAt are required' });
        return;
    }
    const ticket = await prisma_1.default.ticket.findFirst({
        where: { id: ticketId, eventId },
        include: { event: true },
    });
    if (!ticket || ticket.event.tenantId !== req.user.tenantId) {
        res.status(404).json({ error: 'Ticket not found' });
        return;
    }
    if (ticket.status === 'cancelled') {
        res.status(422).json({ error: 'Ticket is cancelled' });
        return;
    }
    const existingScans = await prisma_1.default.scan.findMany({
        where: { ticketId, eventId },
        orderBy: { scannedAt: 'asc' },
    });
    if (existingScans.length > 0 && confirmed !== true) {
        res.status(409).json({
            error: 'Ticket has already been scanned',
            data: { existingScans },
        });
        return;
    }
    const scan = await prisma_1.default.scan.create({
        data: {
            ticketId,
            eventId,
            deviceId,
            userId: req.user.userId,
            scannedAt: new Date(scannedAt),
        },
    });
    res.status(201).json({ data: scan });
});
exports.default = router;
//# sourceMappingURL=scans.js.map