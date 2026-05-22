import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
	currentUser: {
		userId: 'user-1',
		tenantId: 'tenant-1',
		role: 'owner',
		isSuperAdmin: false,
		email: 'owner@example.com',
	},
}));

const eventMocks = vi.hoisted(() => ({
	findFirst: vi.fn(),
	update: vi.fn(),
}));

vi.mock('../src/prisma', () => ({
	withRls: vi.fn(async (_context: any, work: any) =>
		work({
			event: {
				findFirst: eventMocks.findFirst,
				update: eventMocks.update,
			},
		}),
	),
	resolveRlsContext: vi.fn((req: any) => ({ tenantId: req.user?.tenantId ?? 'tenant-1' })),
}));

vi.mock('../src/middleware/auth', () => ({
	authMiddleware: (req: any, _res: any, next: any) => {
		req.user = authState.currentUser;
		next();
	},
}));

import eventsRouter from '../src/routes/events';

function createApp() {
	const app = express();
	app.use(express.json());
	app.use('/events', eventsRouter);
	return app;
}

describe('events route settings', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authState.currentUser = {
			userId: 'user-1',
			tenantId: 'tenant-1',
			role: 'owner',
			isSuperAdmin: false,
			email: 'owner@example.com',
		};
		eventMocks.findFirst.mockResolvedValue({ id: 'event-1' });
		eventMocks.update.mockResolvedValue({ id: 'event-1' });
	});

	it('updates event pdf settings for owners', async () => {
		eventMocks.update.mockResolvedValue({
			id: 'event-1',
			description: 'Updated event message',
			imageUrl: 'https://example.com/banner.jpg',
			includeDescriptionInPdf: true,
			includeImageInPdf: false,
			version: 1,
		});

		const app = createApp();
		const res = await request(app).patch('/events/event-1/settings').send({
			description: ' Updated event message ',
			imageUrl: 'https://example.com/banner.jpg',
			includeDescriptionInPdf: true,
			includeImageInPdf: false,
		});

		expect(res.status).toBe(200);
		expect(eventMocks.findFirst).toHaveBeenCalledWith({
			where: { id: 'event-1', isDeleted: false, archivedAt: null },
		});
		expect(eventMocks.update).toHaveBeenCalledWith({
			where: { id: 'event-1' },
			data: {
				description: 'Updated event message',
				imageUrl: 'https://example.com/banner.jpg',
				includeDescriptionInPdf: true,
				includeImageInPdf: false,
				version: { increment: 1 },
			},
		});
	});

	it('rejects scanner role for event settings updates', async () => {
		authState.currentUser = {
			userId: 'scanner-1',
			tenantId: 'tenant-1',
			role: 'scanner',
			isSuperAdmin: false,
			email: 'scanner@example.com',
		};

		const app = createApp();
		const res = await request(app).patch('/events/event-1/settings').send({ description: 'Nope' });

		expect(res.status).toBe(403);
		expect(eventMocks.findFirst).not.toHaveBeenCalled();
		expect(eventMocks.update).not.toHaveBeenCalled();
	});

	it('rejects invalid image URLs', async () => {
		const app = createApp();
		const res = await request(app).patch('/events/event-1/settings').send({ imageUrl: 'not-a-url' });

		expect(res.status).toBe(400);
		expect(res.body.error).toContain('imageUrl must be a valid http(s) URL');
		expect(eventMocks.findFirst).not.toHaveBeenCalled();
		expect(eventMocks.update).not.toHaveBeenCalled();
	});

	it('requires at least one settings field', async () => {
		const app = createApp();
		const res = await request(app).patch('/events/event-1/settings').send({});

		expect(res.status).toBe(400);
		expect(res.body.error).toContain('At least one settings field is required');
	});
});
