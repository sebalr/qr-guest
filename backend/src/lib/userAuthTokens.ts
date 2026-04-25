import crypto from 'node:crypto';

import prisma from '../prisma';

export const AUTH_TOKEN_TYPES = {
	emailVerification: 'email_verification',
	invitation: 'invitation',
	passwordReset: 'password_reset',
} as const;

export type AuthTokenType = (typeof AUTH_TOKEN_TYPES)[keyof typeof AUTH_TOKEN_TYPES];

function hashToken(token: string): string {
	return crypto.createHash('sha256').update(token).digest('hex');
}

export async function issueUserAuthToken(params: { userId: string; type: AuthTokenType; ttlHours: number }) {
	const token = crypto.randomBytes(32).toString('hex');
	const expiresAt = new Date(Date.now() + params.ttlHours * 60 * 60 * 1000);
	const consumedAt = new Date();

	await prisma.userAuthToken.updateMany({
		where: {
			userId: params.userId,
			type: params.type,
			consumedAt: null,
		},
		data: { consumedAt },
	});

	await prisma.userAuthToken.create({
		data: {
			userId: params.userId,
			tokenHash: hashToken(token),
			type: params.type,
			expiresAt,
		},
	});

	return { token, expiresAt };
}

export async function findActiveUserAuthToken(rawToken: string, type: AuthTokenType) {
	const tokenRecord = await prisma.userAuthToken.findUnique({
		where: { tokenHash: hashToken(rawToken) },
		include: {
			user: {
				include: {
					userTenants: {
						include: { tenant: true },
					},
				},
			},
		},
	});

	if (!tokenRecord) {
		return null;
	}

	if (tokenRecord.type !== type || tokenRecord.consumedAt || tokenRecord.expiresAt.getTime() <= Date.now()) {
		return null;
	}

	return tokenRecord;
}

export async function consumeUserAuthToken(tokenId: string) {
	await prisma.userAuthToken.update({
		where: { id: tokenId },
		data: { consumedAt: new Date() },
	});
}
