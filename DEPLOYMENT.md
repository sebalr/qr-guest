# Tiqra deployment and remaining configuration

## Current installation

| Item | Status |
| --- | --- |
| Website | https://tiqra.nardario.com |
| API | https://api-tiqra.nardario.com |
| Coolify project | Existing `tiqra` project, `production` environment |
| Frontend / backend | Separate GHCR image applications; keep the existing resources |
| PostgreSQL | Existing `tiqra` database; billing/scanner/assets migration applied successfully |
| Database roles | Existing `tiqra_app` runtime and `tiqra_migrator` owner; creator-specific default grants verified |
| DolarAPI | Live rate retrieval verified; no API key required |
| Payments | Code deployed, Mercado Pago credentials and end-to-end sandbox validation still required |
| Email / reCAPTCHA | Variable names are present in Coolify; actual delivery and production registration have not been verified in this deployment session |
| Backups | Pre-release backup created and archive readable; no scheduled backup was configured when inspected |
| Revised pricing | USD 1.30 per additional QR; rollout verification pending |

Existing resources:

- [API settings](http://100.97.25.119:8000/project/zosg4ckswso8808808c0ko8k/environment/rowso0ckwcg48sk44swsc0gk/application/ywc8s840sc8kk8wg0g0o4c8k)
- [Frontend settings](http://100.97.25.119:8000/project/zosg4ckswso8808808c0ko8k/environment/rowso0ckwcg48sk44swsc0gk/application/m4cocccgk8gww80s0wwowsgs)
- [Database backups](http://100.97.25.119:8000/project/zosg4ckswso8808808c0ko8k/environment/rowso0ckwcg48sk44swsc0gk/database/wcs4wks4wccosw8os4s80cow/backups)

These private Coolify URLs require access to your network and a Coolify login.

## 1. Understand the new price

Free still includes one lifetime event and 50 lifetime complimentary QRs per workspace. Personal unlocks after the first approved purchase; there is no subscription.

Additional QRs now cost **USD 1.30 each**, converted to ARS using DolarAPI's official selling rate. At the verified reference rate of ARS 1,530/USD:

| Guests | Complimentary QRs left | Paid QRs needed | USD | Estimated ARS |
| --- | --- | --- | --- | --- |
| 50 | 50 | 0 | 0.00 | 0 |
| 100 | 50 | 50 | 65.00 | 99,450 |
| 100 | 0 | 100 | 130.00 | 198,900 |
| 150 | 50 | 100 | 130.00 | 198,900 |

Thus the approximately ARS 100,000 target applies to 100 guests **with all 50 complimentary QRs still available**. The peso price changes with the exchange rate. Existing orders retain their agreed ARS amount; repricing does not rewrite purchases or existing quotes.

## 2. Configure Mercado Pago — required before accepting purchases

1. In Mercado Pago Developers, open **Tus integraciones** and select/create the Tiqra application for **Checkout Pro using the Preferences API**, which is the integration implemented here.
2. Prepare the matching seller credentials and separate buyer account for testing using Mercado Pago's current Checkout Pro test instructions. Test and live credentials/merchant IDs must not be mixed. `MP_SANDBOX=true` chooses the sandbox checkout URL; it is not a substitute for the correct test setup.
3. Under the application's **Webhooks → Configurar notificaciones**, use this public endpoint and enable payment notifications:

   ```text
   https://api-tiqra.nardario.com/billing/webhooks/mercadopago
   ```

4. Get the application's access token, seller/collector user ID, and webhook signing secret. `MP_MERCHANT_ID` is the seller/collector ID, not the application/client ID. It must match the `collector_id` returned on the payment.
5. In Coolify → **api-tiqra → Environment Variables**, add the following as **runtime/backend-only** variables. Enter actual credentials in Coolify, not in Git or chat:

   | Variable | Value |
   | --- | --- |
   | `MP_ACCESS_TOKEN` | Matching seller access token |
   | `MP_MERCHANT_ID` | Matching seller/collector user ID |
   | `MP_WEBHOOK_SECRET` | Signing secret from that application's Webhooks settings |
   | `MP_WEBHOOK_URL` | `https://api-tiqra.nardario.com/billing/webhooks/mercadopago` |
   | `MP_SANDBOX` | `true` during sandbox validation |
   | `PAYMENT_RECONCILE_MS` | `60000` |

6. Save and **redeploy the backend** so its container receives the values. A separate reconciliation service is unnecessary; the backend worker starts when an access token is configured.
7. In Tiqra, use a test workspace/event and buy a small quantity of QRs as an owner/admin. Use the provider's test checkout, not real funds. Confirm that approval adds the correct event credits once and activates Personal. Refresh the return page and confirm credits do not double. Also check a pending/rejected attempt and a refund in the test environment.
8. Check Mercado Pago webhook delivery history and backend logs. A browser redirect alone must not grant credits. A synthetic notification for a nonexistent payment will not prove approval: the backend independently fetches and verifies the payment.
9. After a successful end-to-end test, enter the production seller credentials/merchant ID and corresponding webhook secret, set `MP_SANDBOX=false`, save, and redeploy the backend. Confirm the production application has the same webhook endpoint configured.

Official references: [payment notification setup](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/payment-notifications), [Checkout Pro overview](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/overview).

## 3. Set up recurring database backups

1. Open the existing database's **Backups** page and choose **+ Add**.
2. Select the `tiqra` database and a daily schedule. Set a retention policy appropriate to your event activity, for example 14 daily backups.
3. Configure an S3-compatible destination if available so a server failure does not destroy the only copy. Tiqra's saved PDF/image templates live in PostgreSQL and are included in a database backup.
4. Run **Backup Now**, verify it succeeds, and test restoring into a separate disposable database. Never test a restore over the running database.

The pre-release backup is on the deployment server, mode `0600`:

```text
/data/coolify/backups/tiqra-manual/pre-838ded4-20260915T183554Z.dump
```

This is a one-time backup, not a scheduled or off-site backup. Its archive listing was verified; a full restore drill remains to be done. [Coolify backup documentation](https://coolify.io/docs/databases/backups)

## 4. Verify email, registration and event scanning

- **Email:** verify `RESEND_API_KEY` and the sender domain associated with `RESEND_FROM_EMAIL`, then register with an email you control and test verification/password recovery. Those deliveries were not sent during deployment.
- **reCAPTCHA:** retain the backend `RECAPTCHA_PROJECT_ID`, `RECAPTCHA_API_KEY`, `RECAPTCHA_SITE_KEY`; verify the public site key used by the frontend matches and allows `tiqra.nardario.com`. The frontend key is a GitHub Actions build variable, not a runtime setting in the Nginx container.
- **Access:** test owner/admin access and a scanner account with an actual event. Confirm the event downloads before going offline. Keep the existing `JWT_SECRET` and `QR_SECRET`; changing them can invalidate sessions, offline permits or issued QR tokens.
- **Invitations:** test image upload, basic PDF download, and a Personal event's custom single-page PDF on the devices you use.
- **Venue test:** use two phones, including iOS if applicable. Test offline/reconnect, a duplicate QR, a canceled ticket, and unsynced-data deletion warnings. Two disconnected scanners can accept the same QR before reconnecting; that physical limitation remains.
- **Monitoring:** Coolify reported no notification channel configured. Add an email/other channel you control and verify delivery for deployment/backup failures.

## 5. Future releases

1. Commit and push to `main`. Both image workflows run for changes in their respective folders; both also support manual dispatch.
2. Wait for CI and the relevant image workflows to succeed. The registry paths are `ghcr.io/sebalr/tiqra/backend` and `ghcr.io/sebalr/tiqra/frontend`.
3. Use immutable `sha-…` tags in each Coolify application's **Docker Image Tag or Hash** field. A backend-only change may legitimately use a different tag from the unchanged frontend. A root-only documentation change does not build new images.
4. Before schema changes, create a new backup and run `npx prisma migrate deploy` in a one-shot container using the **new backend image**, existing database network and `MIGRATION_DATABASE_URL` as that job's `DATABASE_URL`. Confirm success before the new backend starts. Do not use `migrate reset`.
5. Save the selected image tag and redeploy the backend first, then the frontend. The revised-pricing release has no additional schema migration beyond the one already applied.
6. Verify the public `/health` endpoint returns 200, `/billing/pricing` reports the expected unit price, and the landing calculator reflects it.

The current applications are individual image resources, so the repository's Compose files are alternatives for a future stack deployment; they do not change these existing resources automatically. Coolify injects `PORT=80` into the current backend, matching its configured exposed port. Do not change that port to 3000 without changing both settings.

The frontend workflow defaults to `https://api-tiqra.nardario.com`; a repository Actions variable `VITE_API_URL` overrides it. `VITE_RECAPTCHA_SITE_KEY` is also build-time. Changing either requires a new frontend image.

## 6. What is not yet verified

- Real Mercado Pago sandbox checkout, signed delivery and refund flow with your credentials.
- Real email delivery and registration/recovery through your configured providers.
- Physical mobile scanning at a venue and a full backup restore drill.
- Dependency audit remediation: Docker installs reported package advisories; no broad dependency upgrade was included in this deployment.

Automated tests cover backend payment/credit/scanner behavior and browser PDF/scanner scenarios using controlled fixtures. They complement, but do not replace, the provider/device checks above.
