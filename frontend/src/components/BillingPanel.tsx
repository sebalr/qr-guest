import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "../api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
interface Summary {
  plan: string;
  freeRemaining: number;
  paidRemaining: number;
  available: number;
  issued: number;
}
interface Order {
  id: string;
  amount: string;
  quantity: number;
  rate: string;
  rateAt: string;
  expiresAt: string;
  status: string;
  checkoutUrl?: string;
}
export function PricingCards() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {["free", "personal", "custom"].map((plan) => (
        <section key={plan} className="rounded-xl border bg-white p-4">
          <h3 className="font-semibold">{t(`billing.${plan}`)}</h3>
          <p className="mt-2 text-sm text-slate-600">
            {t(`billing.${plan}Description`)}
          </p>
        </section>
      ))}
    </div>
  );
}
export default function BillingPanel({
  eventId,
  tenantId,
  issued = 0,
}: {
  eventId: string;
  tenantId?: string;
  issued?: number;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [quantity, setQuantity] = useState("50"),
    [quote, setQuote] = useState<Order | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [contact, setContact] = useState(""),
    [feedback, setFeedback] = useState("");
  const [orderId, setOrderId] = useState(() =>
    new URLSearchParams(location.search).get("order"),
  );
  const params = { eventId, ...(tenantId ? { tenantId } : {}) };
  const summary = useQuery({
    queryKey: ["billing", eventId, tenantId, issued],
    queryFn: () =>
      api
        .get<{ data: Summary }>("/billing/summary", { params })
        .then((r) => r.data.data),
    refetchInterval: 10000,
  });
  const methods = useQuery({
    queryKey: ["payment-methods", "AR"],
    queryFn: () =>
      api
        .get<{ data: { id: string; name: string }[] }>("/billing/methods", {
          params: { country: "AR" },
        })
        .then((r) => r.data.data),
  });
  const [method, setMethod] = useState("mercadopago");
  const order = useQuery({
    queryKey: ["order", orderId, tenantId],
    queryFn: () =>
      api
        .get<{ data: Order }>(`/billing/orders/${orderId}`, { params })
        .then((r) => r.data.data),
    enabled: !!orderId,
    refetchInterval: (query) =>
      ["approved", "reversed", "refunded", "charged_back", "rejected"].includes(
        query.state.data?.status ?? "",
      )
        ? false
        : 3000,
  });
  useEffect(() => {
    if (order.data?.status === "approved")
      void client.invalidateQueries({ queryKey: ["billing"] });
  }, [order.data?.status, client]);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch {
      setError(t("billing.failed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("billing.title")}</h2>
        <span className="rounded bg-slate-100 px-3 py-1 text-sm">
          {t(`billing.${summary.data?.plan ?? "free"}`)}
        </span>
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          {t("billing.plans")}
        </summary>
        <div className="mt-3">
          <PricingCards />
        </div>
      </details>
      {summary.data ? (
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          aria-live="polite"
        >
          {[
            ["freeRemaining", "freeBalance"],
            ["paidRemaining", "paidBalance"],
            ["available", "available"],
            ["issued", "issued"],
          ].map(([key, label]) => (
            <div key={key} className="rounded bg-slate-50 p-3">
              <div className="text-2xl font-bold">
                {summary.data![key as keyof Summary]}
              </div>
              <div className="text-xs text-slate-600">
                {t(`billing.${label}`)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p>{summary.isError ? t("billing.failed") : t("billing.loading")}</p>
      )}
      <p className="text-sm text-slate-600">{t("billing.rules")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">
          {t("billing.quantity")}
          <Input
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(e) => {
              setQuantity(e.target.value);
              setQuote(null);
            }}
          />
        </label>
        <label className="space-y-1 text-sm">
          {t("billing.method")}
          <select
            className="block rounded border p-2"
            value={method}
            onChange={(e) => {
              setMethod(e.target.value);
              setQuote(null);
            }}
          >
            {methods.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          disabled={
            busy ||
            !Number.isSafeInteger(Number(quantity)) ||
            Number(quantity) < 1 ||
            !methods.data?.length
          }
          onClick={() =>
            void action(async () =>
              setQuote(
                (
                  await api.post<{ data: Order }>(
                    "/billing/quotes",
                    {
                      eventId,
                      quantity: Number(quantity),
                      country: "AR",
                      provider: method,
                    },
                    { params },
                  )
                ).data.data,
              ),
            )
          }
        >
          {t("billing.quote")}
        </Button>
      </div>
      {quote && (
        <div className="space-y-2 rounded border border-blue-200 bg-blue-50 p-3">
          <strong>
            {new Intl.NumberFormat(undefined, {
              style: "currency",
              currency: "ARS",
            }).format(Number(quote.amount))}
          </strong>
          <p className="text-sm">
            {t("billing.conversion", {
              quantity: quote.quantity,
              rate: quote.rate,
              date: new Date(quote.rateAt).toLocaleString(),
            })}
          </p>
          <p className="text-xs">
            {t("billing.expires", {
              date: new Date(quote.expiresAt).toLocaleTimeString(),
            })}
          </p>
          <Button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const result = (
                  await api.post<{ data: Order }>(
                    `/billing/orders/${quote.id}/checkout`,
                    {},
                    { params },
                  )
                ).data.data;
                setOrderId(result.id);
                if (result.checkoutUrl)
                  window.location.assign(result.checkoutUrl);
              })
            }
          >
            {t("billing.pay")}
          </Button>
        </div>
      )}
      {orderId && (
        <p role="status">
          {t("billing.paymentStatus")}:{" "}
          {order.data
            ? t(`billing.status.${order.data.status}`, {
                defaultValue: order.data.status,
              })
            : t("billing.loading")}
        </p>
      )}
      <details>
        <summary className="cursor-pointer font-medium">
          {t("billing.contact")}
        </summary>
        <label className="block text-sm">
          {t("billing.contactHint")}
          <textarea
            className="mt-2 w-full rounded border p-2"
            maxLength={5000}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
          />
        </label>
        <Button
          disabled={busy || !contact.trim()}
          onClick={() =>
            void action(async () => {
              await api.post("/billing/contact", { message: contact });
              setContact("");
              setFeedback(t("billing.contactSent"));
            })
          }
        >
          {t("billing.send")}
        </Button>
      </details>
      {feedback && <p role="status">{feedback}</p>}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
