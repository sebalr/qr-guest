import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';

import { resetPasswordApi } from '../api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ResetPasswordPage() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const token = searchParams.get('token') ?? '';
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [error, setError] = useState('');
	const [message, setMessage] = useState('');
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (event: FormEvent) => {
		event.preventDefault();
		setError('');
		setMessage('');

		if (!token) {
			setError('This reset link is missing its token.');
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
			const res = await resetPasswordApi(token, password);
			setMessage(res.data.data.message);
			window.setTimeout(() => navigate('/login', { replace: true }), 1200);
		} catch (err) {
			if (axios.isAxiosError(err)) {
				setError((err.response?.data as { error?: string } | undefined)?.error ?? 'Unable to reset your password.');
			} else {
				setError('Unable to reset your password.');
			}
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Choose a new password</CardTitle>
					<CardDescription>Reset your QR Guest password.</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						onSubmit={handleSubmit}
						className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="password">New password</Label>
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
						{message && (
							<Alert>
								<AlertDescription>{message}</AlertDescription>
							</Alert>
						)}
						<Button
							type="submit"
							className="w-full"
							disabled={loading}>
							{loading ? 'Updating password…' : 'Update password'}
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
