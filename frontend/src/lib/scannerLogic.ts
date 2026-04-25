import type { SyncPayload, SyncResponse } from '../api';
import type { LocalScan } from '../db';

export interface ScannerMeta {
	last_ticket_version: number;
	last_scan_cursor: string;
	last_sync_at: string | null;
}

export function parseQRPayload(text: string): { tid: string; eid: string } | null {
	try {
		const obj = JSON.parse(text) as { tid?: string; eid?: string };
		if (obj.tid && obj.eid) return { tid: obj.tid, eid: obj.eid };
	} catch {
		// Not JSON
	}

	if (text.split('.').length === 3) {
		try {
			const payload = text.split('.')[1];
			const decoded = JSON.parse(decodeBase64(base64UrlToBase64(payload))) as { tid?: string; eid?: string };
			if (decoded.tid && decoded.eid) return { tid: decoded.tid, eid: decoded.eid };
		} catch {
			// Not a valid JWT payload
		}
	}

	try {
		const decoded = JSON.parse(decodeBase64(text)) as { tid?: string; eid?: string };
		if (decoded.tid && decoded.eid) return { tid: decoded.tid, eid: decoded.eid };
	} catch {
		// Not base64 JSON
	}

	return null;
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

function base64UrlToBase64(value: string): string {
	const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
	const padLength = (4 - (normalized.length % 4)) % 4;
	return normalized + '='.repeat(padLength);
}

function decodeBase64(value: string): string {
	if (typeof atob === 'function') {
		return atob(value);
	}
	return Buffer.from(value, 'base64').toString('utf8');
}
