import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

import { forgotPasswordApi } from '../api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPasswordPage() {
	const [email, setEmail] = useState('');
	const [message, setMessage] = useState('');
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (event: FormEvent) => {
		event.preventDefault();
		setLoading(true);
		setError('');
		setMessage('');

		try {
			const res = await forgotPasswordApi(email);
			setMessage(res.data.data.message);
		} catch (err) {
			if (axios.isAxiosError(err)) {
				setError((err.response?.data as { error?: string } | undefined)?.error ?? 'Unable to send password reset email.');
			} else {
				setError('Unable to send password reset email.');
			}
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Reset your password</CardTitle>
					<CardDescription>Enter your email and we’ll send you a reset link.</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						onSubmit={handleSubmit}
						className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								value={email}
								onChange={event => setEmail(event.target.value)}
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
							{loading ? 'Sending reset link…' : 'Send reset link'}
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
