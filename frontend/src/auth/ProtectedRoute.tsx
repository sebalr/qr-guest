import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ReactNode } from 'react';

interface Props {
	children: ReactNode;
	roles?: string[];
}

export function ProtectedRoute({ children, roles }: Props) {
	const { user } = useAuth();
	const location = useLocation();

	if (!user) {
		return (
			<Navigate
				to="/login"
				state={{ from: location }}
				replace
			/>
		);
	}

	if (user.isTemporaryScanner) {
		if (!user.eventId) {
			return (
				<Navigate
					to="/login"
					replace
				/>
			);
		}

		const scannerPath = `/events/${user.eventId}/scan`;
		if (location.pathname !== scannerPath) {
			return (
				<Navigate
					to={scannerPath}
					replace
				/>
			);
		}
	}

	if (!user.isSuperAdmin && roles && !roles.includes(user.role)) {
		return (
			<Navigate
				to="/events"
				replace
			/>
		);
	}

	return <>{children}</>;
}
