import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Minus, Plus, RefreshCw, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "../api";
import { estimateEventCost } from "../lib/pricingEstimate";

interface PublicPricing {
  unitUsd: string;
  freeAllowance: number;
  rate: string;
  sourceAt: string;
  fetchedAt: string;
}
export default function PricingCalculator() {
  const { t, i18n } = useTranslation();
  const [guests, setGuests] = useState("100");
  const [allowance, setAllowance] = useState("50");
  const rate = useQuery({
    queryKey: ["public-pricing"],
    queryFn: () =>
      api
        .get<{ data: PublicPricing }>("/billing/pricing")
        .then((r) => r.data.data),
    staleTime: 15 * 60000,
    retry: false,
  });
  const parsedGuests = guests.trim() ? Number(guests) : NaN;
  const parsedAllowance = allowance.trim() ? Number(allowance) : NaN;
  const estimate = estimateEventCost(
    parsedGuests,
    parsedAllowance,
    rate.data?.rate,
  );
  const currency = (cents: number, code: string) =>
    new Intl.NumberFormat(i18n.language === "es" ? "es-AR" : "en-US", {
      style: "currency",
      currency: code,
      currencyDisplay: "code",
    }).format(cents / 100);
  function step(delta: number) {
    setGuests(
      String(
        Math.max(
          1,
          Math.min(
            100000,
            (Number.isFinite(parsedGuests) ? parsedGuests : 1) + delta,
          ),
        ),
      ),
    );
  }
  return (
    <section
      className="lp-calculator"
      id="calculator"
      aria-labelledby="calculator-title"
    >
      <div className="lp-calc-inputs">
        <span className="lp-eyebrow">
          <Sparkles size={15} />
          {t("landing.calculator.eyebrow")}
        </span>
        <h2 id="calculator-title">{t("landing.calculator.title")}</h2>
        <p>{t("landing.calculator.description")}</p>
        <label className="lp-field-label" htmlFor="event-guests">
          {t("landing.calculator.guests")}
        </label>
        <div className="lp-stepper">
          <button
            type="button"
            aria-label={t("landing.calculator.fewer")}
            onClick={() => step(-10)}
          >
            <Minus size={20} />
          </button>
          <input
            id="event-guests"
            type="number"
            min="1"
            max="100000"
            step="1"
            value={guests}
            onChange={(e) => setGuests(e.target.value)}
            aria-describedby={!estimate ? "estimate-error" : undefined}
          />
          <button
            type="button"
            aria-label={t("landing.calculator.more")}
            onClick={() => step(10)}
          >
            <Plus size={20} />
          </button>
        </div>
        <input
          className="lp-range"
          type="range"
          min="1"
          max="1000"
          value={Math.max(
            1,
            Math.min(1000, Number.isFinite(parsedGuests) ? parsedGuests : 1),
          )}
          onChange={(e) => setGuests(e.target.value)}
          aria-label={t("landing.calculator.slider")}
        />
        <div className="lp-presets">
          {[50, 100, 300, 1000].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={parsedGuests === n}
              onClick={() => setGuests(String(n))}
            >
              {n.toLocaleString(i18n.language)}{" "}
              {t("landing.calculator.guestsShort")}
            </button>
          ))}
        </div>
        <div className="lp-allowance">
          <div>
            <label htmlFor="free-remaining">
              {t("landing.calculator.allowance")}
            </label>
            <p id="allowance-help">{t("landing.calculator.allowanceHint")}</p>
          </div>
          <input
            id="free-remaining"
            type="number"
            min="0"
            max="50"
            step="1"
            value={allowance}
            onChange={(e) => setAllowance(e.target.value)}
            aria-describedby="allowance-help"
          />
        </div>
        {!estimate && (
          <p id="estimate-error" role="alert" className="lp-input-error">
            {t("landing.calculator.invalid")}
          </p>
        )}
      </div>
      <div className="lp-calc-result">
        <div className="lp-result-top">
          <span>{t("landing.calculator.result")}</span>
          <span className="lp-chip">{t("landing.calculator.noMonthly")}</span>
        </div>
        <div className="lp-estimate" aria-live="polite" aria-atomic="true">
          <div className="lp-price" data-testid="estimate-usd">
            {estimate ? currency(estimate.usdCents, "USD") : "—"}
          </div>
          <p>
            {estimate && estimate.paid === 0
              ? t("landing.calculator.covered")
              : t("landing.calculator.oneEvent")}
          </p>
          {estimate && (
            <dl className="lp-breakdown">
              <div>
                <dt>{t("landing.calculator.included")}</dt>
                <dd>
                  {estimate.complimentary} <span>× USD 0</span>
                </dd>
              </div>
              <div>
                <dt>{t("landing.calculator.extra")}</dt>
                <dd>
                  {estimate.paid} <span>× USD 0.65</span>
                </dd>
              </div>
            </dl>
          )}
          <div className="lp-ars">
            <span>{t("landing.calculator.inPesos")}</span>
            <strong data-testid="estimate-ars">
              {estimate?.arsCents !== null && estimate?.arsCents !== undefined
                ? currency(estimate.arsCents, "ARS")
                : "—"}
            </strong>
          </div>
        </div>
        <div className="lp-rate-note">
          {rate.data ? (
            <>
              {t("landing.calculator.rate", {
                rate: Number(rate.data.rate).toLocaleString(i18n.language, {
                  maximumFractionDigits: 6,
                }),
                date: new Date(rate.data.sourceAt).toLocaleString(
                  i18n.language,
                ),
              })}
              <p>{t("landing.calculator.disclaimer")}</p>
            </>
          ) : (
            <>
              {rate.isPending
                ? t("landing.calculator.loading")
                : t("landing.calculator.unavailable")}
              {rate.isError && (
                <button
                  type="button"
                  onClick={() => void rate.refetch()}
                  disabled={rate.isFetching}
                >
                  <RefreshCw size={12} />
                  {t("landing.calculator.retry")}
                </button>
              )}
            </>
          )}
        </div>
        <Link className="lp-button lp-button-lime" to="/register">
          {t("landing.calculator.cta")}
          <ArrowRight size={18} />
        </Link>
        <p className="lp-calc-footnote">{t("landing.calculator.noPayment")}</p>
      </div>
    </section>
  );
}
