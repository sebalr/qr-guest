import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMocks = vi.hoisted(() => ({
	ticketFindFirst: vi.fn(),
	scanFindMany: vi.fn(),
	scanCreate: vi.fn(),
}));

vi.mock('../src/prisma', () => ({
	default: {
		ticket: { findFirst: prismaMocks.ticketFindFirst },
		scan: { findMany: prismaMocks.scanFindMany, create: prismaMocks.scanCreate },
	},
	getPrismaForTenant: vi.fn(async () => ({
		event: { findFirst: prismaMocks.ticketFindFirst },
		ticket: { findFirst: prismaMocks.ticketFindFirst },
		scan: { findMany: prismaMocks.scanFindMany, create: prismaMocks.scanCreate },
	})),
}));

vi.mock('../src/middleware/auth', () => ({
	authMiddleware: (req: any, _res: any, next: any) => {
		req.user = { userId: 'user-1', tenantId: 'tenant-1', role: 'scanner', isSuperAdmin: false };
		next();
	},
}));

vi.mock('../src/middleware/roles', () => ({
	requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

import scansRouter from '../src/routes/scans';

function createApp() {
	const app = express();
	app.use(express.json());
	app.use('/scan', scansRouter);
	return app;
}

describe('POST /scan', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 400 when required fields are missing', async () => {
		const app = createApp();

		const res = await request(app).post('/scan').send({ ticketId: 't1' });

		expect(res.status).toBe(400);
		expect(res.body.error).toContain('required');
		expect(prismaMocks.ticketFindFirst).not.toHaveBeenCalled();
	});

	it('returns 400 for invalid scannedAt value', async () => {
		const app = createApp();

		const res = await request(app).post('/scan').send({
			ticketId: 'ticket-1',
			eventId: 'event-1',
			deviceId: 'device-1',
			scannedAt: 'not-a-date',
		});

		expect(res.status).toBe(400);
		expect(res.body.error).toContain('scannedAt must be a valid ISO datetime string');
	});

	it('returns 404 when ticket does not exist for tenant', async () => {
		prismaMocks.ticketFindFirst.mockResolvedValue(null);
		const app = createApp();

		const res = await request(app).post('/scan').send({
			ticketId: 'ticket-1',
			eventId: 'event-1',
			deviceId: 'device-1',
			scannedAt: new Date().toISOString(),
		});

		expect(res.status).toBe(404);
		expect(res.body.error).toBe('Ticket not found');
	});

	it('returns 422 for cancelled ticket', async () => {
		prismaMocks.ticketFindFirst.mockResolvedValue({
			id: 'ticket-1',
			status: 'cancelled',
			event: { tenantId: 'tenant-1' },
		});
		const app = createApp();

		const res = await request(app).post('/scan').send({
			ticketId: 'ticket-1',
			eventId: 'event-1',
			deviceId: 'device-1',
			scannedAt: new Date().toISOString(),
		});

		expect(res.status).toBe(422);
		expect(res.body.error).toBe('Ticket is cancelled');
	});

	it('returns 409 for duplicate scan unless confirmed', async () => {
		prismaMocks.ticketFindFirst.mockResolvedValue({
			id: 'ticket-1',
			status: 'active',
			event: { tenantId: 'tenant-1' },
		});
		prismaMocks.scanFindMany.mockResolvedValue([{ id: 'scan-1' }]);

		const app = createApp();
		const res = await request(app).post('/scan').send({
			ticketId: 'ticket-1',
			eventId: 'event-1',
			deviceId: 'device-1',
			scannedAt: new Date().toISOString(),
			confirmed: false,
		});

		expect(res.status).toBe(409);
		expect(res.body.error).toBe('Ticket has already been scanned');
		expect(prismaMocks.scanCreate).not.toHaveBeenCalled();
	});

	it('creates scan when duplicate is confirmed', async () => {
		const now = new Date().toISOString();
		prismaMocks.ticketFindFirst.mockResolvedValue({
			id: 'ticket-1',
			status: 'active',
			event: { tenantId: 'tenant-1' },
		});
		prismaMocks.scanFindMany.mockResolvedValue([{ id: 'scan-1' }]);
		prismaMocks.scanCreate.mockResolvedValue({ id: 'scan-2', ticketId: 'ticket-1' });

		const app = createApp();
		const res = await request(app).post('/scan').send({
			ticketId: 'ticket-1',
			eventId: 'event-1',
			deviceId: 'device-1',
			scannedAt: now,
			confirmed: true,
		});

		expect(res.status).toBe(201);
		expect(prismaMocks.scanCreate).toHaveBeenCalledTimes(1);
		const arg = prismaMocks.scanCreate.mock.calls[0][0];
		expect(arg.data.ticketId).toBe('ticket-1');
		expect(arg.data.eventId).toBe('event-1');
		expect(arg.data.deviceId).toBe('device-1');
		expect(arg.data.userId).toBe('user-1');
		expect(arg.data.scannedAt).toBeInstanceOf(Date);
		expect(arg.data.dedupeKey).toBeNull();
		expect(res.body.data.id).toBe('scan-2');
	});

	it('creates normal scan with dedupeKey', async () => {
		const now = new Date().toISOString();
		prismaMocks.ticketFindFirst.mockResolvedValue({
			id: 'ticket-1',
			status: 'active',
			event: { tenantId: 'tenant-1' },
		});
		prismaMocks.scanFindMany.mockResolvedValue([]);
		prismaMocks.scanCreate.mockResolvedValue({ id: 'scan-3', ticketId: 'ticket-1' });

		const app = createApp();
		const res = await request(app).post('/scan').send({
			ticketId: 'ticket-1',
			eventId: 'event-1',
			deviceId: 'device-1',
			scannedAt: now,
		});

		expect(res.status).toBe(201);
		const arg = prismaMocks.scanCreate.mock.calls[0][0];
		expect(arg.data.dedupeKey).toBe('event-1:ticket-1');
	});

	it('returns 409 when db unique constraint catches concurrent non-forced duplicate', async () => {
		const now = new Date().toISOString();
		prismaMocks.ticketFindFirst.mockResolvedValue({
			id: 'ticket-1',
			status: 'active',
			event: { tenantId: 'tenant-1' },
		});
		prismaMocks.scanFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'scan-existing' }]);
		prismaMocks.scanCreate.mockRejectedValue({ code: 'P2002' });

		const app = createApp();
		const res = await request(app).post('/scan').send({
			ticketId: 'ticket-1',
			eventId: 'event-1',
			deviceId: 'device-1',
			scannedAt: now,
			confirmed: false,
		});

		expect(res.status).toBe(409);
		expect(res.body.error).toBe('Ticket has already been scanned');
	});
});
