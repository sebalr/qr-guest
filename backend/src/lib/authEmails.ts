import { Resend } from 'resend';

function getFrontendBaseUrl(): string {
	return (process.env.FRONTEND_URL ?? process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');
}

function getResendClient(): Resend {
	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey) {
		throw new Error('RESEND_API_KEY is not configured');
	}

	return new Resend(apiKey);
}

function getSenderEmail(): string {
	const fromEmail = process.env.RESEND_FROM_EMAIL;
	if (!fromEmail) {
		throw new Error('RESEND_FROM_EMAIL is not configured');
	}

	return fromEmail;
}

function renderEmailShell(title: string, intro: string, ctaLabel: string, ctaUrl: string, outro: string): string {
	return `
		<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a; max-width: 560px; margin: 0 auto; padding: 24px;">
			<h1 style="font-size: 24px; margin-bottom: 16px;">${title}</h1>
			<p style="margin: 0 0 16px;">${intro}</p>
			<p style="margin: 24px 0;">
				<a href="${ctaUrl}" style="display: inline-block; background: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 600;">${ctaLabel}</a>
			</p>
			<p style="margin: 0 0 8px;">If the button does not work, use this link:</p>
			<p style="margin: 0 0 16px; word-break: break-all;"><a href="${ctaUrl}">${ctaUrl}</a></p>
			<p style="margin: 0; color: #475569;">${outro}</p>
		</div>
	`;
}

async function sendEmail(params: { to: string; subject: string; html: string; text: string }) {
	const resend = getResendClient();
	await resend.emails.send({
		from: getSenderEmail(),
		to: params.to,
		subject: params.subject,
		html: params.html,
		text: params.text,
	});
}

export async function sendVerificationEmail(params: { to: string; tenantName: string; token: string }) {
	const url = `${getFrontendBaseUrl()}/verify-email?token=${encodeURIComponent(params.token)}`;
	await sendEmail({
		to: params.to,
		subject: 'Verify your QR Guest account',
		html: renderEmailShell(
			'Verify your email',
			`Your ${params.tenantName} workspace is ready. Verify your email to start using QR Guest.`,
			'Verify email',
			url,
			'This verification link expires in 24 hours.',
		),
		text: `Verify your email for QR Guest: ${url}\n\nThis link expires in 24 hours.`,
	});
}

export async function sendInvitationEmail(params: { to: string; tenantName: string; role: string; inviterEmail: string; token: string }) {
	const url = `${getFrontendBaseUrl()}/accept-invitation?token=${encodeURIComponent(params.token)}`;
	await sendEmail({
		to: params.to,
		subject: `You're invited to ${params.tenantName} on QR Guest`,
		html: renderEmailShell(
			'Accept your invitation',
			`${params.inviterEmail} invited you to join ${params.tenantName} as ${params.role}. Set your password to activate the account.`,
			'Accept invitation',
			url,
			'This invitation link expires in 7 days.',
		),
		text: `${params.inviterEmail} invited you to join ${params.tenantName} as ${params.role}. Accept the invitation here: ${url}\n\nThis link expires in 7 days.`,
	});
}

export async function sendPasswordResetEmail(params: { to: string; token: string }) {
	const url = `${getFrontendBaseUrl()}/reset-password?token=${encodeURIComponent(params.token)}`;
	await sendEmail({
		to: params.to,
		subject: 'Reset your QR Guest password',
		html: renderEmailShell(
			'Reset your password',
			'Use the link below to choose a new password for your QR Guest account.',
			'Reset password',
			url,
			'This reset link expires in 1 hour.',
		),
		text: `Reset your QR Guest password here: ${url}\n\nThis link expires in 1 hour.`,
	});
}
