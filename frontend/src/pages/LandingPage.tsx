import { Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  CloudOff,
  Move,
  QrCode,
  Radio,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import PricingCalculator from "../components/PricingCalculator";
import "./LandingPage.css";

export default function LandingPage() {
  const { t, i18n } = useTranslation();
  return (
    <div className="lp">
      <header className="lp-nav lp-wrap">
        <Link to="/" className="lp-brand">
          <QrCode />
          tiqra
        </Link>
        <nav aria-label={t("landing.navigation")}>
          <a href="#how">{t("landing.how")}</a>
          <a href="#pricing">{t("landing.pricing")}</a>
          <button
            className="lp-language"
            onClick={() =>
              void i18n.changeLanguage(i18n.language === "es" ? "en" : "es")
            }
            aria-label={t("landing.language")}
          >
            {i18n.language === "es" ? "EN" : "ES"}
          </button>
          <Link to="/login">{t("landing.login")}</Link>
          <Link className="lp-button lp-button-dark" to="/register">
            {t("landing.start")}
            <ArrowRight size={16} />
          </Link>
        </nav>
      </header>
      <main className="lp-wrap">
        <section className="lp-hero">
          <div>
            <span className="lp-eyebrow">
              <span className="lp-dot" />
              {t("landing.hero.eyebrow")}
            </span>
            <h1>
              {t("landing.hero.title")}
              <em>{t("landing.hero.accent")}</em>
            </h1>
            <p className="lp-lead">{t("landing.hero.description")}</p>
            <div className="lp-actions">
              <Link className="lp-button lp-button-dark" to="/register">
                {t("landing.start")}
                <ArrowRight size={18} />
              </Link>
              <a className="lp-text-link" href="#calculator">
                {t("landing.hero.calculate")} ↗
              </a>
            </div>
            <p className="lp-small">
              <Check size={15} />
              {t("landing.hero.bonus")}
            </p>
          </div>
          <div className="lp-preview" aria-label={t("landing.preview.label")}>
            <div className="lp-preview-top">
              <span>TIQRA / INVITATIONS</span>
              <span>{t("landing.preview.demo")}</span>
            </div>
            <div className="lp-invite">
              <span className="lp-invite-kicker">
                {t("landing.preview.invited")}
              </span>
              <div className="lp-invite-art">
                <div />
                <div />
                <div />
              </div>
              <h2>
                Summer
                <br />
                <i>sessions.</i>
              </h2>
              <div className="lp-invite-bottom">
                <span>
                  21.12 / 19:00
                  <br />
                  BUENOS AIRES
                </span>
                <QrCode size={58} aria-hidden="true" />
              </div>
            </div>
            <div className="lp-scan-card">
              <span className="lp-scan-icon">
                <Check size={23} />
              </span>
              <div>
                <strong>{t("landing.preview.accepted")}</strong>
                <p>{t("landing.preview.pending")}</p>
              </div>
              <Radio size={18} />
            </div>
            <div className="lp-preview-caption">
              <CloudOff size={16} />
              {t("landing.preview.caption")}
            </div>
          </div>
        </section>
        <section id="how" className="lp-section">
          <div className="lp-section-heading">
            <span className="lp-eyebrow">{t("landing.workflow.eyebrow")}</span>
            <h2>{t("landing.workflow.title")}</h2>
          </div>
          <div className="lp-feature-grid">
            {[QrCode, CloudOff, Move].map((Icon, index) => (
              <article className="lp-feature" key={index}>
                <div className="lp-feature-top">
                  <Icon size={25} />
                  <span>0{index + 1}</span>
                </div>
                <h3>{t(`landing.workflow.items.${index}.title`)}</h3>
                <p>{t(`landing.workflow.items.${index}.description`)}</p>
              </article>
            ))}
          </div>
          <p className="lp-offline-note">
            <Radio size={17} />
            {t("landing.workflow.limitation")}
          </p>
        </section>
        <section id="pricing" className="lp-section">
          <div className="lp-section-heading lp-centered">
            <span className="lp-eyebrow">{t("landing.plans.eyebrow")}</span>
            <h2>{t("landing.plans.title")}</h2>
            <p>{t("landing.plans.description")}</p>
          </div>
          <div className="lp-plans">
            {["free", "personal", "custom"].map((plan) => (
              <article
                key={plan}
                className={`lp-plan ${plan === "personal" ? "lp-plan-featured" : ""}`}
              >
                <div className="lp-plan-name">
                  <h3>{t(`landing.plans.${plan}.name`)}</h3>
                  {plan === "personal" && (
                    <span className="lp-chip">
                      <Sparkles size={12} />
                      {t("landing.plans.flexible")}
                    </span>
                  )}
                </div>
                <div className="lp-plan-price">
                  {t(`landing.plans.${plan}.price`)}
                </div>
                <p className="lp-plan-unit">
                  {t(`landing.plans.${plan}.unit`)}
                </p>
                <p>{t(`landing.plans.${plan}.description`)}</p>
                <ul>
                  {(
                    t(`landing.plans.${plan}.features`, {
                      returnObjects: true,
                    }) as string[]
                  ).map((feature) => (
                    <li key={feature}>
                      <Check size={17} />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  className={`lp-button ${plan === "personal" ? "lp-button-lime" : "lp-button-outline"}`}
                  to="/register"
                >
                  {t(`landing.plans.${plan}.cta`)}
                  <ArrowRight size={16} />
                </Link>
                <small>{t(`landing.plans.${plan}.note`)}</small>
              </article>
            ))}
          </div>
          <p className="lp-pricing-note">{t("landing.plans.note")}</p>
        </section>
        <PricingCalculator />
        <section className="lp-section lp-faq">
          <div>
            <span className="lp-eyebrow">{t("landing.faq.eyebrow")}</span>
            <h2>{t("landing.faq.title")}</h2>
            <p>{t("landing.faq.description")}</p>
          </div>
          <div>
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <details key={index}>
                <summary>{t(`landing.faq.items.${index}.q`)}</summary>
                <p>{t(`landing.faq.items.${index}.a`)}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="lp-final">
          <span className="lp-eyebrow">{t("landing.final.eyebrow")}</span>
          <h2>{t("landing.final.title")}</h2>
          <p>{t("landing.final.description")}</p>
          <Link className="lp-button lp-button-lime" to="/register">
            {t("landing.start")}
            <ArrowRight size={18} />
          </Link>
        </section>
      </main>
      <footer className="lp-wrap lp-footer">
        <Link to="/" className="lp-brand">
          <QrCode />
          tiqra
        </Link>
        <p>{t("landing.footer")}</p>
        <Link to="/login">{t("landing.login")} ↗</Link>
      </footer>
    </div>
  );
}
