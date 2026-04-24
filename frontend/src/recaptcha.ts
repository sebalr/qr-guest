/**
 * Google reCAPTCHA Enterprise integration.
 *
 * Uses the invisible Enterprise API (score-based, no user interaction required).
 * Docs: https://cloud.google.com/recaptcha/docs/overview
 *
 * Set VITE_RECAPTCHA_SITE_KEY in .env to enable. Leave empty to skip in development.
 */

const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;

export function isRecaptchaEnabled(): boolean {
  return !!SITE_KEY;
}

let scriptPromise: Promise<void> | null = null;

/** Loads the reCAPTCHA Enterprise script once and caches the promise. */
function loadEnterpriseScript(): Promise<void> {
  if (!SITE_KEY) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    // If the script is already present (e.g. SSR or duplicate call), resolve immediately
    if (window.grecaptcha?.enterprise) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/enterprise.js?render=${SITE_KEY}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load reCAPTCHA Enterprise script'));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

/**
 * Returns a reCAPTCHA Enterprise token for the given action.
 * Throws if the site key is not configured or the script fails to load.
 */
export async function executeRecaptcha(action: string): Promise<string> {
  if (!SITE_KEY) throw new Error('reCAPTCHA site key not configured');
  await loadEnterpriseScript();

  return new Promise<string>((resolve, reject) => {
    window.grecaptcha.enterprise.ready(() => {
      window.grecaptcha.enterprise
        .execute(SITE_KEY!, { action })
        .then(resolve)
        .catch(reject);
    });
  });
}
