import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BrowserQRCodeReader, IScannerControls } from '@zxing/browser';
import { db, LocalTicket, LocalScan } from '../db';
import { postScanApi, syncApi } from '../api';
import DuplicateDialog from '../components/DuplicateDialog';
import SyncStatus from '../components/SyncStatus';

function getDeviceId(): string {
  let id = localStorage.getItem('device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('device_id', id);
  }
  return id;
}

/** Safe meta reader — returns sensible defaults on any corruption. */
async function getMeta() {
  try {
    const [ver, cursor, lastSync] = await Promise.all([
      db.meta.get('last_ticket_version'),
      db.meta.get('last_scan_cursor'),
      db.meta.get('last_sync_at'),
    ]);
    return {
      last_ticket_version: typeof ver?.value === 'number' ? ver.value : 0,
      last_scan_cursor:
        typeof cursor?.value === 'string' ? cursor.value : new Date(0).toISOString(),
      last_sync_at: typeof lastSync?.value === 'string' ? lastSync.value : null,
    };
  } catch {
    // If IndexedDB meta is corrupted, return safe defaults
    return {
      last_ticket_version: 0,
      last_scan_cursor: new Date(0).toISOString(),
      last_sync_at: null,
    };
  }
}

async function updateMeta(data: { newTicketVersion?: number; newScanCursor?: string }) {
  try {
    if (data.newTicketVersion != null) {
      await db.meta.put({ key: 'last_ticket_version', value: data.newTicketVersion });
    }
    if (data.newScanCursor) {
      await db.meta.put({ key: 'last_scan_cursor', value: data.newScanCursor });
    }
    await db.meta.put({ key: 'last_sync_at', value: new Date().toISOString() });
  } catch {
    // Meta write failure is non-critical — data is already saved
  }
}

type ScanState = 'idle' | 'success' | 'error';

export default function ScannerPage() {
  const { id: eventId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastScannedRef = useRef<string>('');
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Prevents concurrent syncs — if a sync takes longer than the interval, we skip
  const syncInProgressRef = useRef(false);

  const [scanState, setScanState] = useState<ScanState>('idle');
  const [message, setMessage] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [scannedCount, setScannedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [duplicateInfo, setDuplicateInfo] = useState<{
    ticket: LocalTicket;
    lastScan: LocalScan;
  } | null>(null);
  const [pendingTicket, setPendingTicket] = useState<{ tid: string; eid: string } | null>(null);

  // Load counts
  const refreshCounts = useCallback(async () => {
    if (!eventId) return;
    try {
      const [scanned, total, unsynced, meta] = await Promise.all([
        db.scans.where('event_id').equals(eventId).count(),
        db.tickets.where('event_id').equals(eventId).count(),
        db.scans.where('synced').equals(0).count(),
        getMeta(),
      ]);
      setScannedCount(scanned);
      setTotalCount(total);
      setUnsyncedCount(unsynced);
      setLastSync(meta.last_sync_at);
    } catch {
      // Non-critical — UI will show stale counts
    }
  }, [eventId]);

  // Online/offline tracking
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  /**
   * Core sync function.
   * - fullResync: resets cursors so all data is re-fetched from the server.
   * - Scans are only marked as synced AFTER the server confirms receipt.
   * - Only the specific scans that were sent are marked synced (not newly added ones).
   * - A sync lock prevents concurrent executions.
   */
  const doSync = useCallback(
    async (fullResync = false) => {
      if (syncInProgressRef.current) return; // Skip if a sync is already running
      if (!navigator.onLine) return;

      syncInProgressRef.current = true;
      setSyncError(null);

      try {
        let meta = await getMeta();

        if (fullResync) {
          // Reset cursors — server will return all tickets + scans
          meta = { last_ticket_version: 0, last_scan_cursor: new Date(0).toISOString(), last_sync_at: null };
        }

        // Collect the IDs of unsynced scans BEFORE sending
        const unsynced = await db.scans.where('synced').equals(0).toArray();
        const unsyncedIds = unsynced.map((s) => s.id);

        const res = await syncApi({
          eventId: eventId!,
          lastTicketVersion: meta.last_ticket_version,
          lastScanCursor: meta.last_scan_cursor,
          localScans: unsynced.map((s) => ({
            id: s.id,
            ticketId: s.ticket_id,
            scannedAt: s.scanned_at,
            deviceId: getDeviceId(),
          })),
        });

        const { ticketUpdates, newTicketVersion, newScanCursor } = res.data.data;

        if (ticketUpdates?.length) {
          await db.tickets.bulkPut(
            ticketUpdates.map((t) => ({
              id: t.id,
              event_id: t.event_id,
              name: t.name,
              status: t.status,
              version: t.version,
            })),
          );
        }

        // Only mark the exact scans we sent as synced — not any newly added ones
        if (unsyncedIds.length) {
          await db.scans.where('id').anyOf(unsyncedIds).modify({ synced: true });
        }

        await updateMeta({ newTicketVersion, newScanCursor });
        await refreshCounts();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Sync failed';
        setSyncError(msg);
        // Scans remain unsynced — no data loss
      } finally {
        syncInProgressRef.current = false;
      }
    },
    [eventId, refreshCounts],
  );

  /** Full resync: resets all cursors and marks all local scans as unsynced so they are re-sent. */
  const triggerFullResync = useCallback(async () => {
    try {
      // Mark all scans for this event as unsynced so they are re-sent
      await db.scans.where('event_id').equals(eventId!).modify({ synced: false });
      // Clear cursor meta
      await db.meta.delete('last_ticket_version');
      await db.meta.delete('last_scan_cursor');
      setSyncError(null);
      await doSync(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Full resync failed';
      setSyncError(msg);
    }
  }, [eventId, doSync]);

  // Auto-sync every 60s when online; skip if a sync is already running
  useEffect(() => {
    if (!eventId) return;
    doSync();
    const interval = setInterval(() => doSync(), 60_000);
    return () => clearInterval(interval);
  }, [eventId, doSync]);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  // QR scanner setup
  useEffect(() => {
    if (!videoRef.current) return;
    const reader = new BrowserQRCodeReader();
    let mounted = true;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current, (result, _err, controls) => {
        if (!mounted) return;
        controlsRef.current = controls;
        if (result) {
          const text = result.getText();
          if (text === lastScannedRef.current) return;
          lastScannedRef.current = text;
          handleScan(text);
          // Cooldown to prevent rapid rescans
          if (cooldownRef.current) clearTimeout(cooldownRef.current);
          cooldownRef.current = setTimeout(() => {
            lastScannedRef.current = '';
          }, 3000);
        }
      })
      .catch(() => {
        if (mounted) setCameraError('Camera access denied or unavailable.');
      });

    return () => {
      mounted = false;
      controlsRef.current?.stop();
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function parseQR(text: string): { tid: string; eid: string } | null {
    // Try JSON
    try {
      const obj = JSON.parse(text) as { tid?: string; eid?: string };
      if (obj.tid && obj.eid) return { tid: obj.tid, eid: obj.eid };
    } catch { /* not JSON */ }

    // Try JWT (backend issues JWT with tid/eid claims)
    if (text.split('.').length === 3) {
      try {
        const payload = text.split('.')[1];
        const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
          tid?: string;
          eid?: string;
        };
        if (decoded.tid && decoded.eid) return { tid: decoded.tid, eid: decoded.eid };
      } catch { /* not valid JWT */ }
    }

    // Try base64 JSON
    try {
      const decoded = JSON.parse(atob(text)) as { tid?: string; eid?: string };
      if (decoded.tid && decoded.eid) return { tid: decoded.tid, eid: decoded.eid };
    } catch { /* not base64 */ }

    return null;
  }

  async function handleScan(qrText: string) {
    const parsed = parseQR(qrText);
    if (!parsed) {
      showError('Invalid QR code format.');
      return;
    }
    const { tid, eid } = parsed;

    const ticket = await db.tickets.get(tid);
    if (!ticket) {
      showError('Ticket not found in local database. Sync required.');
      return;
    }
    if (ticket.status === 'cancelled') {
      showError('⚠ Cancelled ticket.');
      return;
    }

    const prevScans = await db.scans.where('ticket_id').equals(tid).toArray();
    if (prevScans.length > 0) {
      const last = prevScans.sort(
        (a, b) => new Date(b.scanned_at).getTime() - new Date(a.scanned_at).getTime(),
      )[0];
      setDuplicateInfo({ ticket, lastScan: last });
      setPendingTicket({ tid, eid });
      return;
    }

    await registerScan(tid, eid);
  }

  async function registerScan(ticketId: string, eid: string) {
    const scanId = crypto.randomUUID();
    const scannedAt = new Date().toISOString();
    // Always write to local DB first — data is never lost until server confirms
    await db.scans.add({
      id: scanId,
      ticket_id: ticketId,
      event_id: eid,
      scanned_at: scannedAt,
      synced: false,
    });
    await refreshCounts();
    showSuccess('✓ Ticket scanned successfully!');

    // Best-effort immediate online push — does NOT affect local record
    if (navigator.onLine) {
      postScanApi(ticketId, eid, getDeviceId()).catch(() => {});
    }
  }

  function showSuccess(msg: string) {
    setScanState('success');
    setMessage(msg);
    setTimeout(() => setScanState('idle'), 2500);
  }

  function showError(msg: string) {
    setScanState('error');
    setMessage(msg);
    setTimeout(() => setScanState('idle'), 3000);
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <header className="bg-gray-800 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(`/events/${eventId}`)} className="opacity-70 hover:opacity-100">
          ← Back
        </button>
        <h1 className="font-bold text-lg flex-1">QR Scanner</h1>
        <SyncStatus
          online={online}
          lastSync={lastSync}
          scannedCount={scannedCount}
          totalCount={totalCount}
          unsyncedCount={unsyncedCount}
        />
      </header>

      {/* Sync error banner */}
      {syncError && (
        <div className="bg-yellow-900/80 border-b border-yellow-600 px-4 py-2 flex items-center gap-3 text-sm">
          <span className="text-yellow-300 flex-1">⚠ Sync error: {syncError}. Local scans are safe.</span>
          <button
            onClick={() => doSync()}
            className="bg-yellow-700 hover:bg-yellow-600 text-white px-3 py-1 rounded-lg text-xs font-medium"
          >
            Retry Sync
          </button>
          <button
            onClick={triggerFullResync}
            className="bg-red-700 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-xs font-medium"
          >
            Full Resync
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center p-4">
        {cameraError ? (
          <div className="bg-red-900/50 border border-red-500 rounded-xl p-6 text-center max-w-sm">
            <p className="text-red-300 text-lg font-medium">📷 {cameraError}</p>
            <p className="text-gray-400 text-sm mt-2">
              Allow camera access in browser settings and reload.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="relative w-full max-w-md">
            <video
              ref={videoRef}
              className="w-full rounded-xl"
              style={{ aspectRatio: '4/3', objectFit: 'cover', background: '#000' }}
            />
            {/* Scan overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-56 h-56 border-4 border-blue-400 rounded-xl opacity-70" />
            </div>

            {scanState !== 'idle' && (
              <div
                className={`absolute inset-0 flex items-center justify-center rounded-xl ${
                  scanState === 'success' ? 'bg-green-900/80' : 'bg-red-900/80'
                }`}
              >
                <p className="text-white text-xl font-bold text-center px-4">{message}</p>
              </div>
            )}
          </div>
        )}

        <p className="text-gray-400 text-sm mt-4">Point camera at a QR code</p>

        {/* Manual Full Resync button — always accessible */}
        <button
          onClick={triggerFullResync}
          className="mt-6 bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-2 rounded-lg text-sm"
        >
          🔄 Full Resync
        </button>
      </div>

      {duplicateInfo && pendingTicket && (
        <DuplicateDialog
          ticket={duplicateInfo.ticket}
          lastScan={duplicateInfo.lastScan}
          onScanAgain={async () => {
            const { tid, eid } = pendingTicket;
            setDuplicateInfo(null);
            setPendingTicket(null);
            await registerScan(tid, eid);
          }}
          onCancel={() => {
            setDuplicateInfo(null);
            setPendingTicket(null);
          }}
        />
      )}
    </div>
  );
}
