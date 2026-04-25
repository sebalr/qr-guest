export type AccountStatus = 'active' | 'pending_verification' | 'invited';

export function getAccountStatus(user: { passwordHash: string | null; emailVerifiedAt: Date | null }): AccountStatus {
	if (!user.passwordHash) {
		return 'invited';
	}

	if (!user.emailVerifiedAt) {
		return 'pending_verification';
	}

	return 'active';
}

export function canSignIn(user: { passwordHash: string | null; emailVerifiedAt: Date | null }): boolean {
	return getAccountStatus(user) === 'active';
}
