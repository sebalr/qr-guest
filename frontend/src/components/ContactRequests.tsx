import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "../api";
export default function ContactRequests({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const query = useQuery({
    queryKey: ["contacts", tenantId],
    queryFn: () =>
      api
        .get<{
          data: {
            id: string;
            email: string;
            message: string;
            status: string;
          }[];
        }>("/billing/contacts", { params: { tenantId } })
        .then((r) => r.data.data),
  });
  return (
    <section className="rounded border bg-white p-4">
      <h2 className="font-bold">{t("billing.contactRequests")}</h2>
      {(query.isError || failed) && <p role="alert">{t("billing.failed")}</p>}
      {query.data?.map((item) => (
        <article key={item.id} className="mt-3 border-t pt-3">
          <a href={`mailto:${item.email}`} className="underline">
            {item.email}
          </a>
          <p className="whitespace-pre-wrap">{item.message}</p>
          <select
            aria-label={t("billing.requestStatus")}
            value={item.status}
            onChange={async (e) => {
              setFailed(false);
              try {
                await api.patch(
                  `/billing/contacts/${item.id}`,
                  { status: e.target.value },
                  { params: { tenantId } },
                );
                await query.refetch();
              } catch {
                setFailed(true);
              }
            }}
          >
            {["new", "contacted", "closed"].map((status) => (
              <option key={status} value={status}>
                {t(`billing.${status}`)}
              </option>
            ))}
          </select>
        </article>
      ))}
    </section>
  );
}
