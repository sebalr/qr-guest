"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = __importDefault(require("../prisma"));
const auth_1 = require("../middleware/auth");
const roles_1 = require("../middleware/roles");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
// Bulk create tickets — owner/admin only
router.post('/events/:id/tickets/bulk', (0, roles_1.requireRole)(['owner', 'admin']), async (req, res) => {
    const eventId = req.params.id;
    const { tickets } = req.body;
    if (!Array.isArray(tickets) || tickets.length === 0) {
        res.status(400).json({ error: 'tickets must be a non-empty array' });
        return;
    }
    const event = await prisma_1.default.event.findFirst({
        where: { id: eventId, tenantId: req.user.tenantId },
    });
    if (!event) {
        res.status(404).json({ error: 'Event not found' });
        return;
    }
    const tenant = await prisma_1.default.tenant.findUnique({ where: { id: req.user.tenantId } });
    if (tenant?.plan === 'free') {
        const existing = await prisma_1.default.ticket.count({ where: { eventId } });
        if (existing + tickets.length > 10) {
            res.status(403).json({
                error: `Free plan allows a maximum of 10 tickets per event. Current: ${existing}`,
            });
            return;
        }
    }
    const created = await prisma_1.default.$transaction(tickets.map((t) => prisma_1.default.ticket.create({ data: { eventId, name: t.name } })));
    // Bump event version so sync clients pick up the new tickets
    await prisma_1.default.event.update({ where: { id: eventId }, data: { version: { increment: 1 } } });
    res.status(201).json({ data: created });
});
// List tickets with scan count — owner/admin only
router.get('/events/:id/tickets', (0, roles_1.requireRole)(['owner', 'admin']), async (req, res) => {
    const eventId = req.params.id;
    const event = await prisma_1.default.event.findFirst({
        where: { id: eventId, tenantId: req.user.tenantId },
    });
    if (!event) {
        res.status(404).json({ error: 'Event not found' });
        return;
    }
    const tickets = await prisma_1.default.ticket.findMany({
        where: { eventId },
        include: { _count: { select: { scans: true } } },
        orderBy: { createdAt: 'asc' },
    });
    const result = tickets.map((t) => ({
        id: t.id,
        eventId: t.eventId,
        name: t.name,
        status: t.status,
        version: t.version,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        scanCount: t._count.scans,
    }));
    res.json({ data: result });
});
// Cancel a ticket — owner/admin only
router.post('/tickets/:id/cancel', (0, roles_1.requireRole)(['owner', 'admin']), async (req, res) => {
    const ticket = await prisma_1.default.ticket.findFirst({
        where: { id: req.params.id },
        include: { event: true },
    });
    if (!ticket || ticket.event.tenantId !== req.user.tenantId) {
        res.status(404).json({ error: 'Ticket not found' });
        return;
    }
    if (ticket.status === 'cancelled') {
        res.status(400).json({ error: 'Ticket is already cancelled' });
        return;
    }
    const updated = await prisma_1.default.ticket.update({
        where: { id: req.params.id },
        data: { status: 'cancelled', version: { increment: 1 } },
    });
    res.json({ data: updated });
});
// QR token for a ticket — owner/admin only
router.get('/tickets/:id/qr', (0, roles_1.requireRole)(['owner', 'admin']), async (req, res) => {
    const ticket = await prisma_1.default.ticket.findFirst({
        where: { id: req.params.id },
        include: { event: true },
    });
    if (!ticket || ticket.event.tenantId !== req.user.tenantId) {
        res.status(404).json({ error: 'Ticket not found' });
        return;
    }
    const secret = process.env.QR_SECRET;
    if (!secret) {
        res.status(500).json({ error: 'Server misconfiguration: QR_SECRET not set' });
        return;
    }
    const qrToken = jsonwebtoken_1.default.sign({ tid: ticket.id, eid: ticket.eventId }, secret, {
        expiresIn: '365d',
    });
    res.json({ data: { qrToken } });
});
exports.default = router;
//# sourceMappingURL=tickets.js.map