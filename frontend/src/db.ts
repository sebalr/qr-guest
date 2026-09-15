import Dexie, { Table } from 'dexie';

export interface LocalTicket {
  id: string;
  event_id: string;
  name: string;
  status: string; // active | cancelled
  version: number;
  tokenFingerprint?: string;
}

export interface LocalScan {
  id: string;
  ticket_id: string;
  event_id: string;
  scanned_at: string;
  synced: boolean;
  qrToken?: string;
  confirmed?: boolean;
  outcome?: string;
}

export interface LocalMeta {
  key: string;
  value: string | number;
}

export class QRGuestDB extends Dexie {
  tickets!: Table<LocalTicket>;
  scans!: Table<LocalScan>;
  meta!: Table<LocalMeta>;

  constructor(name = "qrguest") {
    super(name);
    this.version(1).stores({
      tickets: 'id, event_id, status, version',
      scans: 'id, ticket_id, event_id, synced',
      meta: 'key',
    });
  }
}

export const db = new QRGuestDB();

const scopedDatabases = new Map<string,QRGuestDB>();
export function getScannerDb(tenantId: string, eventId: string, userId = "") {
 const key = `tiqra:${tenantId}:${eventId}${userId ? `:${userId}` : ""}`;
 let scoped = scopedDatabases.get(key);
 if (!scoped) { scoped = new QRGuestDB(key); scopedDatabases.set(key,scoped); }
 return scoped;
}
