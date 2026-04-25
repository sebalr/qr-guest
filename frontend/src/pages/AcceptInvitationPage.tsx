import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';

import { acceptInvitationApi } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function AcceptInvitationPage() {
	const navigate = useNavigate();
	const { login, setAvailableTenants } = useAuth();
	const [searchParams] = useSearchParams();
	const token = searchParams.get('token') ?? '';
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (event: FormEvent) => {
		event.preventDefault();
		setError('');

		if (!token) {
			setError('This invitation link is missing its token.');
			return;
		}

		if (password.length < 8) {
			setError('Password must be at least 8 characters.');
			return;
		}

		if (password !== confirmPassword) {
			setError('Passwords do not match.');
			return;
		}

		setLoading(true);
		try {
			const res = await acceptInvitationApi(token, password);
			const data = res.data.data;

			if (data.token) {
				login(data.token);
				navigate('/events', { replace: true });
				return;
			}

			if (data.tenants) {
				setAvailableTenants(data.tenants);
				navigate('/login', { replace: true });
				return;
			}

			navigate('/login', { replace: true });
		} catch (err) {
			if (axios.isAxiosError(err)) {
				setError((err.response?.data as { error?: string } | undefined)?.error ?? 'Unable to accept invitation.');
			} else {
				setError('Unable to accept invitation.');
			}
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Accept invitation</CardTitle>
					<CardDescription>Set a password to activate your QR Guest account.</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						onSubmit={handleSubmit}
						className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								type="password"
								value={password}
								onChange={event => setPassword(event.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="confirmPassword">Confirm password</Label>
							<Input
								id="confirmPassword"
								type="password"
								value={confirmPassword}
								onChange={event => setConfirmPassword(event.target.value)}
								required
							/>
						</div>
						{error && (
							<Alert variant="destructive">
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						<Button
							type="submit"
							className="w-full"
							disabled={loading}>
							{loading ? 'Activating account…' : 'Activate account'}
						</Button>
					</form>
				</CardContent>
				<CardFooter>
					<Button
						asChild
						variant="ghost"
						className="w-full">
						<Link to="/login">Back to login</Link>
					</Button>
				</CardFooter>
			</Card>
		</div>
	);
}
