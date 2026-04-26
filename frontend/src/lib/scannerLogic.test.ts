import { describe, expect, it } from 'vitest';
import type { LocalScan } from '../db';
import { createSyncPayload, getUnsyncedLocalScans, mapSyncResponseToLocal, parseQRPayload, resolveMetaForSync } from './scannerLogic';

describe('parseQRPayload', () => {
	// A valid compact token is 40 bytes (16 tid + 16 eid + 8 HMAC) base64url-encoded.
	// Build a synthetic one with known UUIDs for testing the parser (HMAC bytes not verified by parser).
	const tid = '11111111-2222-3333-4444-555555555555';
	const eid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

	function makeCompactToken(tidStr: string, eidStr: string): string {
		const tidBytes = Buffer.from(tidStr.replace(/-/g, ''), 'hex');
		const eidBytes = Buffer.from(eidStr.replace(/-/g, ''), 'hex');
		// Use 8 zero bytes as placeholder HMAC — parser doesn't verify the MAC
		const mac = Buffer.alloc(8, 0);
		return Buffer.concat([tidBytes, eidBytes, mac]).toString('base64url');
	}

	it('parses a valid compact 40-byte token', () => {
		const token = makeCompactToken(tid, eid);
		const result = parseQRPayload(token);
		expect(result).not.toBeNull();
		expect(result!.tid).toBe(tid);
		expect(result!.eid).toBe(eid);
		expect(result!.qrToken).toBe(token);
	});

	it('returns null for a token that is the wrong length', () => {
		// 39 bytes → should fail
		const shortToken = Buffer.alloc(39, 0).toString('base64url');
		expect(parseQRPayload(shortToken)).toBeNull();
	});

	it('returns null for plain text garbage', () => {
		expect(parseQRPayload('invalid-qr-data')).toBeNull();
	});

	it('returns null for old JWT-style tokens', () => {
		const payload = Buffer.from(JSON.stringify({ tid: 'ticket-2', eid: 'event-2' }), 'utf8').toString('base64url');
		expect(parseQRPayload(`header.${payload}.signature`)).toBeNull();
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
