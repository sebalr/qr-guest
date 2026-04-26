import type { SyncPayload, SyncResponse } from '../api';
import type { LocalScan } from '../db';

export interface ScannerMeta {
	last_ticket_version: number;
	last_scan_cursor: string;
	last_sync_at: string | null;
}

export function parseQRPayload(text: string): { tid: string; eid: string; qrToken: string } | null {
	try {
		const bytes = base64UrlToBytes(text);
		// Compact token: 16 bytes tid + 16 bytes eid + 8 bytes HMAC = 40 bytes total
		if (bytes.length !== 40) return null;
		const tid = bytesToUUID(bytes.slice(0, 16));
		const eid = bytesToUUID(bytes.slice(16, 32));
		return { tid, eid, qrToken: text };
	} catch {
		return null;
	}
}

/** Convert a 16-byte Uint8Array to a lowercase UUID string. */
function bytesToUUID(bytes: Uint8Array): string {
	const hex = Array.from(bytes)
		.map(b => b.toString(16).padStart(2, '0'))
		.join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Decode a base64url string to a Uint8Array. */
function base64UrlToBytes(value: string): Uint8Array {
	const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
	const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
	if (typeof atob === 'function') {
		const binary = atob(padded);
		return Uint8Array.from(binary, c => c.charCodeAt(0));
	}
	return new Uint8Array(Buffer.from(padded, 'base64'));
}

export function resolveMetaForSync(meta: ScannerMeta, fullResync: boolean): ScannerMeta {
	if (!fullResync) return meta;
	return {
		last_ticket_version: 0,
		last_scan_cursor: new Date(0).toISOString(),
		last_sync_at: null,
	};
}

export function getUnsyncedLocalScans(scans: LocalScan[]): LocalScan[] {
	return scans.filter(scan => scan.synced !== true);
}

export function createSyncPayload(args: {
	eventId: string;
	meta: ScannerMeta;
	unsynced: LocalScan[];
	deviceId: string;
}): SyncPayload & { deviceId: string } {
	const { eventId, meta, unsynced, deviceId } = args;

	return {
		eventId,
		deviceId,
		lastTicketVersion: meta.last_ticket_version,
		lastScanCursor: meta.last_scan_cursor,
		localScans: unsynced.map(s => ({
			id: s.id,
			ticketId: s.ticket_id,
			scannedAt: s.scanned_at,
			deviceId,
		})),
	};
}

export function mapSyncResponseToLocal(response: SyncResponse) {
	return {
		ticketRows: response.ticketUpdates.map(t => ({
			id: t.id,
			event_id: t.eventId,
			name: t.name,
			status: t.status,
			version: t.version,
		})),
		scanRows: response.scanUpdates.map(s => ({
			id: s.id,
			ticket_id: s.ticketId,
			event_id: s.eventId,
			scanned_at: s.scannedAt,
			synced: true,
		})),
		newTicketVersion: response.newTicketVersion,
		newScanCursor: response.newScanCursor,
	};
}
