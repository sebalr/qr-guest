import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { temporalLoginApi } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function TemporalScannerLoginPage() {
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const { login } = useAuth();
	const [error, setError] = useState('');

	useEffect(() => {
		const token = (searchParams.get('token') ?? '').trim();
		if (!token) {
			setError('Missing scanner token.');
			return;
		}

		temporalLoginApi(token)
			.then(response => {
				const authToken = response.data.data.token;
				const eventId = response.data.data.eventId;
				login(authToken);
				navigate(`/events/${eventId}/scan`, { replace: true });
			})
			.catch(() => {
				setError('Invalid or inactive scanner link.');
			});
	}, [login, navigate, searchParams]);

	return (
		<div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle className="text-xl">Scanner Access</CardTitle>
				</CardHeader>
				<CardContent>
					{error ? (
						<Alert variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					) : (
						<p className="text-sm text-muted-foreground">Signing you in...</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
