import Dexie, { Table } from 'dexie';

export interface LocalTicket {
  id: string;
  event_id: string;
  name: string;
  status: string; // active | cancelled
  version: number;
}

export interface LocalScan {
  id: string;
  ticket_id: string;
  event_id: string;
  scanned_at: string;
  synced: boolean;
}

export interface LocalMeta {
  key: string;
  value: string | number;
}

export class QRGuestDB extends Dexie {
  tickets!: Table<LocalTicket>;
  scans!: Table<LocalScan>;
  meta!: Table<LocalMeta>;

  constructor() {
    super('qrguest');
    this.version(1).stores({
      tickets: 'id, event_id, status, version',
      scans: 'id, ticket_id, event_id, synced',
      meta: 'key',
    });
  }
}

export const db = new QRGuestDB();
