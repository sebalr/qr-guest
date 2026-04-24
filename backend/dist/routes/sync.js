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
    const { eventId, lastTicketVersion, lastScanCursor, localScans } = req.body;
    if (!eventId) {
        res.status(400).json({ error: 'eventId is required' });
        return;
    }
    const event = await prisma_1.default.event.findFirst({
        where: { id: eventId, tenantId: req.user.tenantId },
    });
    if (!event) {
        res.status(404).json({ error: 'Event not found' });
        return;
    }
    const deviceId = localScans?.[0]?.deviceId ?? 'unknown';
    // Upsert all local scans — append-only, deduplicated by id
    if (Array.isArray(localScans) && localScans.length > 0) {
        await prisma_1.default.$transaction(localScans.map((s) => prisma_1.default.scan.upsert({
            where: { id: s.id },
            create: {
                id: s.id,
                ticketId: s.ticketId,
                eventId,
                deviceId: s.deviceId,
                userId: req.user.userId,
                scannedAt: new Date(s.scannedAt),
            },
            update: {},
        })));
    }
    const cursorDate = lastScanCursor ? new Date(lastScanCursor) : new Date(0);
    const [ticketUpdates, scanUpdates] = await Promise.all([
        prisma_1.default.ticket.findMany({
            where: {
                eventId,
                version: { gt: lastTicketVersion ?? 0 },
            },
        }),
        prisma_1.default.scan.findMany({
            where: {
                eventId,
                createdAt: { gt: cursorDate },
            },
            orderBy: { createdAt: 'asc' },
        }),
    ]);
    const newTicketVersion = ticketUpdates.length > 0
        ? Math.max(...ticketUpdates.map((t) => t.version))
        : lastTicketVersion ?? 0;
    const newScanCursor = scanUpdates.length > 0
        ? scanUpdates[scanUpdates.length - 1].createdAt.toISOString()
        : cursorDate.toISOString();
    // Update sync state for this device/event
    await prisma_1.default.syncState.upsert({
        where: { deviceId_eventId: { deviceId, eventId } },
        create: {
            deviceId,
            eventId,
            lastTicketVersion: newTicketVersion,
            lastScanCursor: new Date(newScanCursor),
        },
        update: {
            lastTicketVersion: newTicketVersion,
            lastScanCursor: new Date(newScanCursor),
        },
    });
    res.json({
        data: {
            ticketUpdates,
            scanUpdates,
            newTicketVersion,
            newScanCursor,
        },
    });
});
exports.default = router;
//# sourceMappingURL=sync.js.map