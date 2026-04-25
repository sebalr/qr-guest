import { describe, expect, it } from 'vitest';
import type { LocalScan } from '../db';
import { createSyncPayload, getUnsyncedLocalScans, mapSyncResponseToLocal, parseQRPayload, resolveMetaForSync } from './scannerLogic';

describe('parseQRPayload', () => {
	it('parses plain JSON payload', () => {
		const value = JSON.stringify({ tid: 'ticket-1', eid: 'event-1' });
		expect(parseQRPayload(value)).toEqual({ tid: 'ticket-1', eid: 'event-1' });
	});

	it('parses JWT payload with base64url encoding', () => {
		const payload = Buffer.from(JSON.stringify({ tid: 'ticket-2', eid: 'event-2' }), 'utf8').toString('base64url');
		const jwtLike = `header.${payload}.signature`;

		expect(parseQRPayload(jwtLike)).toEqual({ tid: 'ticket-2', eid: 'event-2' });
	});

	it('parses base64 JSON payload', () => {
		const base64 = Buffer.from(JSON.stringify({ tid: 'ticket-3', eid: 'event-3' }), 'utf8').toString('base64');

		expect(parseQRPayload(base64)).toEqual({ tid: 'ticket-3', eid: 'event-3' });
	});

	it('returns null for invalid payload', () => {
		expect(parseQRPayload('invalid-qr-data')).toBeNull();
	});
});

describe('sync helpers', () => {
	const baseMeta = {
		last_ticket_version: 7,
		last_scan_cursor: '2026-04-24T00:00:00.000Z',
		last_sync_at: '2026-04-24T00:05:00.000Z',
	} as const;

	const scans: LocalScan[] = [
		{
			id: 'scan-1',
			ticket_id: 'ticket-1',
			event_id: 'event-1',
			scanned_at: '2026-04-24T00:10:00.000Z',
			synced: false,
		},
		{
			id: 'scan-2',
			ticket_id: 'ticket-2',
			event_id: 'event-1',
			scanned_at: '2026-04-24T00:11:00.000Z',
			synced: true,
		},
		{
			id: 'scan-3',
			ticket_id: 'ticket-3',
			event_id: 'event-1',
			scanned_at: '2026-04-24T00:12:00.000Z',
			synced: undefined as unknown as boolean,
		},
	];

	it('keeps existing meta when not doing full resync', () => {
		expect(resolveMetaForSync(baseMeta, false)).toEqual(baseMeta);
	});

	it('resets version and cursor when doing full resync', () => {
		const result = resolveMetaForSync(baseMeta, true);
		expect(result.last_ticket_version).toBe(0);
		expect(result.last_scan_cursor).toBe(new Date(0).toISOString());
		expect(result.last_sync_at).toBeNull();
	});

	it('filters unsynced scans with boolean-safe rule', () => {
		const unsynced = getUnsyncedLocalScans(scans);
		expect(unsynced.map(s => s.id)).toEqual(['scan-1', 'scan-3']);
	});

	it('creates sync payload with explicit device id', () => {
		const unsynced = getUnsyncedLocalScans(scans);
		const payload = createSyncPayload({
			eventId: 'event-1',
			meta: baseMeta,
			unsynced,
			deviceId: 'device-abc',
		});

		expect(payload.eventId).toBe('event-1');
		expect(payload.deviceId).toBe('device-abc');
		expect(payload.lastTicketVersion).toBe(7);
		expect(payload.lastScanCursor).toBe('2026-04-24T00:00:00.000Z');
		expect(payload.localScans).toEqual([
			{
				id: 'scan-1',
				ticketId: 'ticket-1',
				scannedAt: '2026-04-24T00:10:00.000Z',
				deviceId: 'device-abc',
			},
			{
				id: 'scan-3',
				ticketId: 'ticket-3',
				scannedAt: '2026-04-24T00:12:00.000Z',
				deviceId: 'device-abc',
			},
		]);
	});

	it('maps sync response to local table rows', () => {
		const mapped = mapSyncResponseToLocal({
			ticketUpdates: [
				{
					id: 'ticket-10',
					eventId: 'event-1',
					name: 'Jane Doe',
					status: 'active',
					version: 8,
				},
			],
			scanUpdates: [
				{
					id: 'remote-scan-1',
					ticketId: 'ticket-10',
					eventId: 'event-1',
					scannedAt: '2026-04-24T00:30:00.000Z',
					deviceId: 'device-remote',
				},
			],
			newTicketVersion: 8,
			newScanCursor: '2026-04-24T00:30:00.000Z',
		});

		expect(mapped.ticketRows).toEqual([
			{
				id: 'ticket-10',
				event_id: 'event-1',
				name: 'Jane Doe',
				status: 'active',
				version: 8,
			},
		]);
		expect(mapped.scanRows).toEqual([
			{
				id: 'remote-scan-1',
				ticket_id: 'ticket-10',
				event_id: 'event-1',
				scanned_at: '2026-04-24T00:30:00.000Z',
				synced: true,
			},
		]);
		expect(mapped.newTicketVersion).toBe(8);
		expect(mapped.newScanCursor).toBe('2026-04-24T00:30:00.000Z');
	});
});
