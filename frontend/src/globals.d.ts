/** Global type declarations for reCAPTCHA Enterprise (injected by the Enterprise script tag). */
interface RecaptchaEnterprise {
  ready(callback: () => void): void;
  execute(siteKey: string, options: { action: string }): Promise<string>;
}

interface Window {
  grecaptcha: {
    enterprise: RecaptchaEnterprise;
  };
}
