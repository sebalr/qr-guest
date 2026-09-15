import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import api, { EventAsset, getAsset, putAsset } from "../api";
import { QR_POINTS } from "../lib/customPdf";
import { Button } from "./ui/button";
import QRCodeDisplay from "./QRCodeDisplay";
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
export default function InvitationEditor({
  eventId,
  tenantId,
}: {
  eventId: string;
  tenantId?: string;
}) {
  const { t } = useTranslation();
  const [plan, setPlan] = useState("free"),
    [asset, setAsset] = useState<EventAsset | null>(null),
    [image, setImage] = useState<EventAsset | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [preview, setPreview] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null),
    box = useRef<HTMLDivElement>(null),
    drag = useRef<{ x: number; y: number; left: number; top: number } | null>(
      null,
    );
  const scope = { ...(tenantId ? { tenantId } : {}) };
  useEffect(() => {
    let active = true;
    Promise.all([
      api.get("/billing/summary", { params: { eventId, ...scope } }),
      getAsset(eventId, "pdf", scope),
      getAsset(eventId, "image", scope),
    ])
      .then(([summary, pdf, img]) => {
        if (active) {
          setPlan(summary.data.data.plan);
          setAsset(pdf);
          setImage(img);
        }
      })
      .catch(() => setError(t("invitations.failed")));
    return () => {
      active = false;
    };
  }, [eventId, tenantId, t]);
  useEffect(() => {
    if (!asset || !canvas.current) return;
    let disposed = false;
    setPreview(false);
    const task = pdfjs.getDocument({
      data: Uint8Array.from(atob(asset.bytes), (c) => c.charCodeAt(0)),
    });
    let render: pdfjs.RenderTask | undefined;
    task.promise
      .then(async (doc) => {
        const page = await doc.getPage(1);
        if (disposed) return;
        const viewport = page.getViewport({ scale: 1 });
        const target = canvas.current!;
        target.width = viewport.width;
        target.height = viewport.height;
        render = page.render({ canvas: target, viewport });
        await render.promise;
        if (!disposed) setPreview(true);
      })
      .catch(() => {
        if (!disposed) setError(t("invitations.failed"));
      });
    return () => {
      disposed = true;
      render?.cancel();
      void task.destroy();
    };
  }, [asset?.bytes, t]);
  const allowed = ["personal", "custom"].includes(plan);
  async function upload(file: File | undefined, kind: "pdf" | "image") {
    if (!file) return;
    setBusy(true);
    setSaved(false);
    setError("");
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error();
      const bytes = await readFile(file);
      const result = await putAsset(eventId, kind, { bytes }, scope);
      if (kind === "pdf") setAsset(result);
      else setImage(result);
      setSaved(true);
    } catch {
      setError(t("invitations.invalid"));
    } finally {
      setBusy(false);
    }
  }
  function move(x: number, y: number) {
    setAsset((old) =>
      old
        ? {
            ...old,
            x: Math.max(0, Math.min(x, old.width - QR_POINTS)),
            y: Math.max(0, Math.min(y, old.height - QR_POINTS)),
          }
        : old,
    );
    setSaved(false);
  }
  return (
    <section className="space-y-3 rounded-xl border bg-white p-4">
      <h2 className="font-semibold">{t("invitations.title")}</h2>
      <label className="block space-y-2 text-sm">
        {t("invitations.image")}
        <input
          className="block"
          type="file"
          accept="image/png,image/jpeg"
          disabled={busy}
          onChange={(e) => void upload(e.target.files?.[0], "image")}
        />
      </label>
      {image && (
        <img
          className="max-h-28 rounded"
          alt={t("invitations.image")}
          src={`data:${image.mime};base64,${image.bytes}`}
        />
      )}
      <h3 className="font-medium">{t("invitations.custom")}</h3>
      {!allowed && (
        <p className="rounded bg-amber-50 p-3 text-sm">
          {t("invitations.locked")}
        </p>
      )}
      <p className="text-sm text-slate-600">{t("invitations.space")}</p>
      <label className="block text-sm">
        {t("invitations.file")}
        <input
          className="mt-2 block"
          type="file"
          accept="application/pdf"
          disabled={!allowed || busy}
          onChange={(e) => void upload(e.target.files?.[0], "pdf")}
        />
      </label>
      {asset && (
        <>
          <div
            ref={box}
            className="relative w-full overflow-hidden border bg-white"
            style={{
              aspectRatio: `${asset.width}/${asset.height}`,
              width: `min(100%, ${(65 * asset.width) / asset.height}vh)`,
              marginInline: "auto",
              touchAction: "none",
            }}
          >
            <canvas ref={canvas} className="h-full w-full" />
            {preview && (
              <div
                role="button"
                tabIndex={allowed ? 0 : -1}
                aria-label={t("invitations.drag")}
                className="absolute cursor-move border-2 border-blue-600 bg-white focus:ring-4 focus:ring-blue-200"
                style={{
                  left: `${(asset.x / asset.width) * 100}%`,
                  top: `${(asset.y / asset.height) * 100}%`,
                  width: `${(QR_POINTS / asset.width) * 100}%`,
                  height: `${(QR_POINTS / asset.height) * 100}%`,
                  touchAction: "none",
                }}
                onPointerDown={(e) => {
                  if (!allowed || busy) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  drag.current = {
                    x: e.clientX,
                    y: e.clientY,
                    left: asset.x,
                    top: asset.y,
                  };
                }}
                onPointerMove={(e) => {
                  if (!drag.current || !box.current) return;
                  const rect = box.current.getBoundingClientRect();
                  move(
                    drag.current.left +
                      ((e.clientX - drag.current.x) / rect.width) * asset.width,
                    drag.current.top +
                      ((e.clientY - drag.current.y) / rect.height) *
                        asset.height,
                  );
                }}
                onPointerUp={() => {
                  drag.current = null;
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
                onKeyDown={(e) => {
                  if (
                    !allowed ||
                    busy ||
                    ![
                      "ArrowLeft",
                      "ArrowRight",
                      "ArrowUp",
                      "ArrowDown",
                    ].includes(e.key)
                  )
                    return;
                  e.preventDefault();
                  const step = e.shiftKey ? 10 : 1;
                  move(
                    asset.x +
                      (e.key === "ArrowRight"
                        ? step
                        : e.key === "ArrowLeft"
                          ? -step
                          : 0),
                    asset.y +
                      (e.key === "ArrowDown"
                        ? step
                        : e.key === "ArrowUp"
                          ? -step
                          : 0),
                  );
                }}
              >
                <div className="h-full w-full [&_canvas]:!h-full [&_canvas]:!w-full">
                  <QRCodeDisplay
                    value="Tiqra preview — sample only"
                    size={400}
                  />
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-600">
            {t("invitations.drag")} · {Math.round((asset.x * 25.4) / 72)} mm,{" "}
            {Math.round((asset.y * 25.4) / 72)} mm
          </p>
          <div className="flex gap-2">
            <Button
              disabled={!allowed || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  setAsset(
                    await putAsset(
                      eventId,
                      "pdf",
                      { bytes: asset.bytes, x: asset.x, y: asset.y },
                      scope,
                    ),
                  );
                  setSaved(true);
                } catch {
                  setError(t("invitations.failed"));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("invitations.save")}
            </Button>
            <Button
              variant="outline"
              disabled={!allowed || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.delete(`/assets/${eventId}/pdf`, { params: scope });
                  setAsset(null);
                  setSaved(true);
                } catch {
                  setError(t("invitations.failed"));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("invitations.remove")}
            </Button>
          </div>
        </>
      )}
      {saved && (
        <p role="status" className="text-sm text-green-700">
          {t("invitations.saved")}
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
