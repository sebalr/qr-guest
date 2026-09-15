import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BrowserQRCodeReader } from "@zxing/browser";
import { useTranslation } from "react-i18next";
import axios from "axios";
import { useAuth } from "../auth/AuthContext";
import { getScannerDb, LocalScan, LocalTicket } from "../db";
import {
  OfflinePermit,
  postScanApi,
  syncApi,
  uploadDeviceEventDebugDataApi,
} from "../api";
import { parseQRPayload } from "../lib/scannerLogic";
import {
  acceptsAdmission,
  fingerprint,
  verifyOfflinePermit,
} from "../lib/offlineAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function ScannerPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const { t } = useTranslation();
  const tenantId = user!.isSuperAdmin
    ? new URLSearchParams(location.search).get("tenantId") || user!.tenantId
    : user!.tenantId;
  const navigate = useNavigate();
  const db = useMemo(
    () => getScannerDb(tenantId, id, user!.userId),
    [tenantId, id, user!.userId],
  );
  const lockName = `scanner:${tenantId}:${id}:${user!.userId}`;
  const deviceId = useMemo(() => {
    const key = "device_id";
    let value = localStorage.getItem(key);
    if (!value) {
      value = crypto.randomUUID();
      localStorage.setItem(key, value);
    }
    return value;
  }, []);
  const video = useRef<HTMLVideoElement>(null);
  const busy = useRef(false),
    syncing = useRef(false),
    paused = useRef(false);
  const [pending, setPending] = useState(0),
    [total, setTotal] = useState(0),
    [admitted, setAdmitted] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null),
    [ready, setReady] = useState(false);
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [debugOpen, setDebugOpen] = useState(false),
    [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteCount, setDeleteCount] = useState<number | null>(null),
    [deleteText, setDeleteText] = useState("");
  const [recent, setRecent] = useState<LocalScan[]>([]);
  const [duplicate, setDuplicate] = useState<{
    ticket: LocalTicket;
    token: string;
  } | null>(null);
  const scanHandler = useRef<(text: string) => Promise<void>>(async () => {});
  const backoff = useRef(5000),
    nextSync = useRef(0);
  const exclusive = useCallback(
    <T,>(work: () => Promise<T>) => navigator.locks.request(lockName, work),
    [lockName],
  );
  const refresh = useCallback(async () => {
    const rows = await db.scans.toArray();
    setRecent(
      rows
        .filter((s) => s.outcome && !acceptsAdmission(s.outcome))
        .sort((a, b) => b.scanned_at.localeCompare(a.scanned_at))
        .slice(0, 10),
    );
    setPending(rows.filter((s) => s.synced !== true).length);
    setAdmitted(
      new Set(
        rows.filter((s) => acceptsAdmission(s.outcome)).map((s) => s.ticket_id),
      ).size,
    );
    setTotal(await db.tickets.count());
    const meta = await db.meta.get("lastSync");
    setLastSync(typeof meta?.value === "string" ? meta.value : null);
    const permitRow = await db.meta.get("permit");
    const downloaded = await db.meta.get("ready");
    const permit = permitRow
      ? (JSON.parse(String(permitRow.value)) as OfflinePermit)
      : null;
    setReady(
      downloaded?.value === 1 &&
        (await verifyOfflinePermit(permit, tenantId, user!.userId, id)),
    );
  }, [db, id, user, tenantId]);
  const doSync = useCallback(
    async (force = false) => {
      if (syncing.current || !navigator.onLine || (paused.current && !force))
        return;
      syncing.current = true;
      try {
        await navigator.locks.request(`${lockName}:sync`, async () => {
          let more = true;
          while (more) {
            const { metadata, attempts } = await exclusive(async () => ({
              metadata: Object.fromEntries(
                (await db.meta.toArray()).map((m) => [m.key, m.value]),
              ),
              attempts: await db.scans
                .filter((s) => s.synced !== true)
                .limit(150)
                .toArray(),
            }));
            const response = (
              await syncApi(
                {
                  eventId: id,
                  deviceId,
                  lastTicketVersion: Number(metadata.ticketVersion || 0),
                  lastTicketIdCursor: String(metadata.ticketId || ""),
                  lastScanCursor: String(
                    metadata.scanCursor || new Date(0).toISOString(),
                  ),
                  lastScanIdCursor: String(metadata.scanId || ""),
                  localScans: attempts.map((s) => ({
                    id: s.id,
                    ticketId: s.ticket_id,
                    scannedAt: s.scanned_at,
                    deviceId,
                    qrToken: s.qrToken,
                    confirmed: s.confirmed,
                  })),
                },
                { tenantId },
              )
            ).data.data;
            let reset = false;
            await exclusive(() =>
              db.transaction("rw", db.tickets, db.scans, db.meta, async () => {
                if ((await db.meta.get("epoch"))?.value !== metadata.epoch) {
                  reset = true;
                  return;
                }
                await db.tickets.bulkPut(
                  response.ticketUpdates.map((ticket) => ({
                    id: ticket.id,
                    event_id: id,
                    name: ticket.name,
                    status: ticket.status,
                    version: ticket.version,
                    tokenFingerprint: ticket.tokenFingerprint,
                  })),
                );
                for (const scan of response.scanUpdates) {
                  const existing = await db.scans.get(scan.id);
                  await db.scans.put({
                    ...existing,
                    id: scan.id,
                    event_id: id,
                    ticket_id: scan.ticketId,
                    scanned_at: scan.scannedAt,
                    synced: true,
                    outcome: existing?.confirmed ? "override" : "accepted",
                  });
                }
                for (const ack of response.acknowledgments ?? []) {
                  await db.scans.update(ack.id, {
                    synced: true,
                    outcome: ack.outcome,
                  });
                  if (!acceptsAdmission(ack.outcome))
                    setError(t("scannerV2.conflict"));
                }
                await db.meta.bulkPut([
                  { key: "ticketVersion", value: response.newTicketVersion },
                  { key: "ticketId", value: response.newTicketIdCursor ?? "" },
                  { key: "scanCursor", value: response.newScanCursor },
                  { key: "scanId", value: response.newScanIdCursor ?? "" },
                  { key: "lastSync", value: new Date().toISOString() },
                ]);
                if (response.offlinePermit)
                  await db.meta.put({
                    key: "permit",
                    value: JSON.stringify(response.offlinePermit),
                  });
                if (
                  !response.hasMoreTicketUpdates &&
                  !response.hasMoreScanUpdates
                )
                  await db.meta.put({ key: "ready", value: 1 });
              }),
            );
            if (reset) break;
            more =
              !!response.hasMoreTicketUpdates ||
              !!response.hasMoreScanUpdates ||
              (await db.scans.filter((s) => s.synced !== true).count()) > 0;
          }
        });
        backoff.current = 5000;
        await refresh();
      } catch (e) {
        backoff.current = Math.min(60000, backoff.current * 2);
        setError(
          axios.isAxiosError(e) && e.response?.status === 401
            ? t("scannerV2.loginRequired")
            : t("scannerV2.syncFailed"),
        );
      } finally {
        syncing.current = false;
        nextSync.current = Date.now() + backoff.current;
      }
    },
    [db, deviceId, exclusive, id, refresh, t, tenantId, lockName],
  );
  useEffect(() => {
    void refresh().catch(() => setError(t("scannerV2.storageError")));
    void doSync();
    const timer = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        Date.now() >= nextSync.current
      )
        void doSync();
    }, 1000);
    const reconnect = () => {
      setOnline(navigator.onLine);
      void doSync();
    };
    const visibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
        void doSync();
      }
    };
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", reconnect);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", reconnect);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [doSync, refresh, t]);
  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    const reader = new BrowserQRCodeReader();
    reader
      .decodeFromVideoDevice(undefined, video.current!, (result) => {
        if (result && !disposed) void scanHandler.current(result.getText());
      })
      .then((controls) => {
        if (disposed) controls.stop();
        else stop = () => controls.stop();
      })
      .catch(() => setError(t("scanner.camera.unavailableTitle")));
    return () => {
      disposed = true;
      stop?.();
    };
  }, [db, t]);
  async function register(
    ticket: LocalTicket,
    token: string,
    confirmed = false,
  ) {
    await exclusive(async () => {
      const permitRow = await db.meta.get("permit");
      if (
        !(await verifyOfflinePermit(
          permitRow ? JSON.parse(String(permitRow.value)) : null,
          tenantId,
          user!.userId,
          id,
        ))
      )
        throw new Error(t("scannerV2.notReady"));
      const currentCount = await db.scans
        .where("ticket_id")
        .equals(ticket.id)
        .filter((s) => acceptsAdmission(s.outcome))
        .count();
      if (currentCount >= 2) throw new Error(t("scannerV2.limit"));
      if (currentCount > 0 && !confirmed) {
        setDuplicate({ ticket, token });
        paused.current = true;
        return;
      }
      const attempt: LocalScan = {
        id: crypto.randomUUID(),
        event_id: id,
        ticket_id: ticket.id,
        scanned_at: new Date().toISOString(),
        synced: false,
        qrToken: token,
        confirmed,
        outcome: "pending",
      };
      await db.scans.add(attempt);
      if (navigator.onLine) {
        try {
          const result = await postScanApi(
            ticket.id,
            id,
            deviceId,
            attempt.scanned_at,
            attempt.id,
            token,
            confirmed,
            { tenantId },
          );
          await db.scans.update(attempt.id, {
            synced: true,
            outcome: result.data.data.outcome,
          });
          setMessage(t("scanner.success.ticketScanned"));
          return;
        } catch (e) {
          if (axios.isAxiosError(e) && e.response) {
            const outcome = e.response.data?.data?.outcome;
            if (outcome) {
              await db.scans.update(attempt.id, { synced: true, outcome });
              if (outcome === "duplicate") {
                setDuplicate({ ticket, token });
                paused.current = true;
              }
              setError(t(`scannerV2.${outcome}`));
              return;
            }
            // Authentication/server failures keep the durable record; offline rules still apply.
            if (e.response.status < 500 && e.response.status !== 401) {
              setError(t("scannerV2.syncFailed"));
              return;
            }
          }
        }
      }
      setMessage(t("scannerV2.offlineAccepted"));
    });
    await refresh();
    void doSync();
  }
  scanHandler.current = async (text) => {
    if (busy.current || paused.current) return;
    busy.current = true;
    setError("");
    setMessage("");
    try {
      const permitRow = await db.meta.get("permit");
      if (
        !(await db.meta.get("ready"))?.value ||
        !(await verifyOfflinePermit(
          permitRow ? JSON.parse(String(permitRow.value)) : null,
          tenantId,
          user!.userId,
          id,
        ))
      ) {
        setReady(false);
        throw new Error(t("scannerV2.notReady"));
      }
      const parsed = parseQRPayload(text);
      if (!parsed || parsed.eid !== id)
        throw new Error(t("scanner.errors.invalidQrFormat"));
      const ticket = await db.tickets.get(parsed.tid);
      if (
        !ticket ||
        !ticket.tokenFingerprint ||
        (await fingerprint(text)) !== ticket.tokenFingerprint
      )
        throw new Error(t("scannerV2.invalid"));
      if (ticket.status !== "active") throw new Error(t("scannerV2.cancelled"));
      const previous = await db.scans
        .where("ticket_id")
        .equals(ticket.id)
        .filter((s) => acceptsAdmission(s.outcome))
        .count();
      if (previous >= 2) throw new Error(t("scannerV2.limit"));
      if (previous) {
        setDuplicate({ ticket, token: text });
        paused.current = true;
        return;
      }
      await register(ticket, text);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("scannerV2.storageError"));
    } finally {
      setTimeout(() => {
        busy.current = false;
      }, 2000);
    }
  };
  async function openDelete() {
    paused.current = true;
    setDeleteOpen(true);
    setDeleteText("");
    setDeleteCount(null);
    try {
      await exclusive(async () =>
        setDeleteCount(await db.scans.filter((s) => s.synced !== true).count()),
      );
    } catch {
      setError(t("scannerV2.storageError"));
    }
  }
  async function clearLocal() {
    setWorking(true);
    try {
      await exclusive(() =>
        db.transaction("rw", db.tickets, db.scans, db.meta, async () => {
          const count = await db.scans.filter((s) => s.synced !== true).count();
          if (count !== deleteCount) {
            setDeleteCount(count);
            setDeleteText("");
            throw new Error(t("scannerV2.countChanged"));
          }
          if (count > 0 && deleteText !== "delete")
            throw new Error(t("scannerV2.typeDelete"));
          await db.tickets.clear();
          await db.scans.clear();
          await db.meta.clear();
          await db.meta.put({ key: "epoch", value: crypto.randomUUID() });
        }),
      );
      setDeleteOpen(false);
      paused.current = false;
      await refresh();
      setMessage(t("scanner.feedback.localDataCleared"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("scannerV2.storageError"));
    } finally {
      setWorking(false);
    }
  }
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => navigate(`/events/${id}`)}>
          ← {t("scannerV2.event")}
        </Button>
        <h1 className="text-xl font-bold">{t("scanner.title")}</h1>
      </div>
      <div className="rounded border p-3" aria-live="polite">
        <strong>
          {online
            ? t("scanner.syncStatus.online")
            : t("scanner.syncStatus.offline")}
        </strong>{" "}
        · {ready ? t("scannerV2.ready") : t("scannerV2.notReady")}
        <p>{t("scannerV2.counts", { pending, total, admitted })}</p>
        <small>
          {t("scannerV2.lastSync")}:{" "}
          {lastSync ? new Date(lastSync).toLocaleString() : "—"}
        </small>
        <p className="text-sm">{t("scannerV2.offlineWarning")}</p>
      </div>
      {message && (
        <div role="status" className="rounded bg-green-100 p-4 text-green-900">
          {message}
        </div>
      )}
      {error && (
        <div role="alert" className="rounded bg-amber-100 p-4 text-amber-900">
          {error}{" "}
          <a href="/login" className="underline">
            {t("scannerV2.signIn")}
          </a>
        </div>
      )}
      {recent.length > 0 && (
        <section className="rounded border p-3">
          <h2 className="font-semibold">{t("scannerV2.recordedConflicts")}</h2>
          {recent.map((scan) => (
            <p key={scan.id} className="text-sm">
              {new Date(scan.scanned_at).toLocaleTimeString()} ·{" "}
              {scan.ticket_id.slice(0, 8)} · {t(`scannerV2.${scan.outcome}`)}
            </p>
          ))}
        </section>
      )}
      <video
        ref={video}
        className="w-full rounded bg-black"
        muted
        playsInline
      />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void doSync(true)}>
          {t("scannerV2.syncNow")}
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            await exclusive(async () => {
              await db.meta.bulkDelete([
                "ticketVersion",
                "ticketId",
                "scanCursor",
                "scanId",
                "ready",
              ]);
              await db.meta.put({ key: "epoch", value: crypto.randomUUID() });
            });
            await doSync(true);
          }}
        >
          {t("scanner.actions.fullResync")}
        </Button>
        <Button variant="outline" onClick={() => setDebugOpen(true)}>
          {t("scanner.debugConfirmDialog.title")}
        </Button>
        <Button variant="destructive" onClick={() => void openDelete()}>
          {t("scanner.actions.clearLocalEventData")}
        </Button>
      </div>
      <Dialog open={debugOpen} onOpenChange={setDebugOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("scanner.debugConfirmDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("scanner.debugConfirmDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDebugOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={working}
              onClick={async () => {
                setWorking(true);
                try {
                  await uploadDeviceEventDebugDataApi(
                    {
                      eventId: id,
                      deviceId,
                      payload: {
                        pendingCount: pending,
                        ticketCount: total,
                        lastSync,
                        online,
                      },
                    },
                    { tenantId },
                  );
                  setDebugOpen(false);
                  setMessage(t("scanner.feedback.localDataSent"));
                } catch {
                  setError(t("scanner.feedback.localDataSendFailed"));
                } finally {
                  setWorking(false);
                }
              }}
            >
              {t("scanner.debugConfirmDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!working) {
            setDeleteOpen(open);
            paused.current = open;
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("scanner.clearDataDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("scanner.clearDataDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <p role="alert">
            {deleteCount === null
              ? t("scannerV2.checking")
              : deleteCount > 0
                ? t("scannerV2.deleteWarning", { count: deleteCount })
                : t("scanner.clearDataDialog.warning")}
          </p>
          {deleteCount !== null && deleteCount > 0 && (
            <>
              <label htmlFor="delete-confirm">
                {t("scannerV2.typeDelete")}
              </label>
              <Input
                id="delete-confirm"
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                autoComplete="off"
              />
            </>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={working}
              onClick={() => {
                setDeleteOpen(false);
                paused.current = false;
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              disabled={working}
              onClick={async () => {
                setWorking(true);
                await doSync(true);
                try {
                  await exclusive(async () =>
                    setDeleteCount(
                      await db.scans.filter((s) => s.synced !== true).count(),
                    ),
                  );
                  setDeleteText("");
                } catch {
                  setDeleteCount(null);
                  setError(t("scannerV2.storageError"));
                } finally {
                  setWorking(false);
                }
              }}
            >
              {t("scannerV2.syncFirst")}
            </Button>
            <Button
              variant="destructive"
              disabled={
                working ||
                deleteCount === null ||
                (deleteCount > 0 && deleteText !== "delete")
              }
              onClick={() => void clearLocal()}
            >
              {t("scanner.actions.clearLocalData")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!duplicate}
        onOpenChange={(open) => {
          if (!open) {
            setDuplicate(null);
            paused.current = false;
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("scannerV2.duplicate")}</DialogTitle>
            <DialogDescription>
              {t("scannerV2.overridePrompt")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDuplicate(null);
                paused.current = false;
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={async () => {
                const current = duplicate!;
                setDuplicate(null);
                try {
                  await register(current.ticket, current.token, true);
                } catch {
                  setError(t("scannerV2.storageError"));
                } finally {
                  paused.current = false;
                }
              }}
            >
              {t("scannerV2.override")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
