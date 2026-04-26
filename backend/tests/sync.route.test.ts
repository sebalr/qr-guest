import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMocks = vi.hoisted(() => ({
	eventFindFirst: vi.fn(),
	ticketFindMany: vi.fn(),
	transaction: vi.fn(),
	scanUpsert: vi.fn(),
	scanFindMany: vi.fn(),
	syncStateUpsert: vi.fn(),
}));

vi.mock('../src/prisma', () => ({
	default: {
		event: { findFirst: prismaMocks.eventFindFirst },
		ticket: { findMany: prismaMocks.ticketFindMany },
		scan: { upsert: prismaMocks.scanUpsert, findMany: prismaMocks.scanFindMany },
		syncState: { upsert: prismaMocks.syncStateUpsert },
		$transaction: prismaMocks.transaction,
	},
	getPrismaForTenant: vi.fn(async () => ({
		event: { findFirst: prismaMocks.eventFindFirst },
		ticket: { findMany: prismaMocks.ticketFindMany },
		scan: { upsert: prismaMocks.scanUpsert, findMany: prismaMocks.scanFindMany },
		syncState: { upsert: prismaMocks.syncStateUpsert },
		$transaction: prismaMocks.transaction,
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

import syncRouter from '../src/routes/sync';

function createApp() {
	const app = express();
	app.use(express.json());
	app.use('/sync', syncRouter);
	return app;
}

describe('POST /sync', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMocks.transaction.mockResolvedValue(undefined);
		prismaMocks.scanUpsert.mockReturnValue({});
		prismaMocks.eventFindFirst.mockResolvedValue({ id: 'event-1', tenantId: 'tenant-1' });
		prismaMocks.ticketFindMany.mockImplementation(({ where }: any) => {
			if (where?.version) {
				return Promise.resolve([]);
			}
			return Promise.resolve([{ id: 'ticket-1' }]);
		});
		prismaMocks.scanFindMany.mockResolvedValue([]);
		prismaMocks.syncStateUpsert.mockResolvedValue({});
	});

	it('returns 400 when eventId is missing', async () => {
		const app = createApp();

		const res = await request(app)
			.post('/sync')
			.send({
				deviceId: 'device-1',
				lastTicketVersion: 0,
				lastScanCursor: new Date(0).toISOString(),
				localScans: [],
			});

		expect(res.status).toBe(400);
		expect(res.body.error).toBe('eventId is required');
	});

	it('returns 400 when deviceId is missing and localScans do not include one', async () => {
		const app = createApp();

		const res = await request(app)
			.post('/sync')
			.send({
				eventId: 'event-1',
				lastTicketVersion: 0,
				lastScanCursor: new Date(0).toISOString(),
				localScans: [],
			});

		expect(res.status).toBe(400);
		expect(res.body.error).toBe('deviceId is required');
	});

	it('returns 404 when event is not found for tenant', async () => {
		prismaMocks.eventFindFirst.mockResolvedValue(null);
		const app = createApp();

		const res = await request(app)
			.post('/sync')
			.send({
				eventId: 'event-1',
				deviceId: 'device-1',
				lastTicketVersion: 0,
				lastScanCursor: new Date(0).toISOString(),
				localScans: [],
			});

		expect(res.status).toBe(404);
		expect(res.body.error).toBe('Event not found');
	});

	it('returns 400 for invalid lastScanCursor', async () => {
		const app = createApp();

		const res = await request(app).post('/sync').send({
			eventId: 'event-1',
			deviceId: 'device-1',
			lastTicketVersion: 0,
			lastScanCursor: 'bad-cursor',
			localScans: [],
		});

		expect(res.status).toBe(400);
		expect(res.body.error).toContain('lastScanCursor must be a valid ISO datetime string');
	});

	it('returns 400 when local scan has invalid scannedAt', async () => {
		const app = createApp();

		const res = await request(app)
			.post('/sync')
			.send({
				eventId: 'event-1',
				deviceId: 'device-1',
				lastTicketVersion: 0,
				lastScanCursor: new Date(0).toISOString(),
				localScans: [{ id: 'scan-1', ticketId: 'ticket-1', scannedAt: 'bad-date', deviceId: 'device-1' }],
			});

		expect(res.status).toBe(400);
		expect(res.body.error).toContain('valid ISO datetime string');
	});

	it('returns 400 when local scan ticket does not belong to event', async () => {
		prismaMocks.ticketFindMany.mockResolvedValueOnce([]);
		const app = createApp();

		const res = await request(app)
			.post('/sync')
			.send({
				eventId: 'event-1',
				deviceId: 'device-1',
				lastTicketVersion: 0,
				lastScanCursor: new Date(0).toISOString(),
				localScans: [{ id: 'scan-1', ticketId: 'ticket-1', scannedAt: new Date().toISOString(), deviceId: 'device-1' }],
			});

		expect(res.status).toBe(400);
		expect(res.body.error).toContain('do not belong to this event');
		expect(prismaMocks.transaction).not.toHaveBeenCalled();
	});

	it('syncs successfully and updates sync state using explicit deviceId', async () => {
		const now = new Date().toISOString();
		prismaMocks.ticketFindMany.mockResolvedValueOnce([{ id: 'ticket-1' }]).mockResolvedValueOnce([{ id: 'ticket-1', version: 2 }]);
		prismaMocks.scanFindMany.mockResolvedValue([{ id: 'remote-1', createdAt: new Date(now) }]);

		const app = createApp();
		const res = await request(app)
			.post('/sync')
			.send({
				eventId: 'event-1',
				deviceId: 'device-explicit',
				lastTicketVersion: 1,
				lastScanCursor: new Date(0).toISOString(),
				localScans: [{ id: 'scan-1', ticketId: 'ticket-1', scannedAt: now, deviceId: 'device-local' }],
			});

		expect(res.status).toBe(200);
		expect(prismaMocks.scanUpsert).toHaveBeenCalledTimes(1);
		expect(prismaMocks.scanUpsert.mock.calls[0][0].create.deviceId).toBe('device-explicit');
		expect(prismaMocks.transaction).toHaveBeenCalledTimes(1);
		expect(prismaMocks.syncStateUpsert).toHaveBeenCalledTimes(1);
		const syncStateArg = prismaMocks.syncStateUpsert.mock.calls[0][0];
		expect(syncStateArg.where.deviceId_eventId.deviceId).toBe('device-explicit');
		expect(res.body.data.newTicketVersion).toBe(2);
	});
});
