import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';

import { verifyEmailApi } from '../api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export default function VerifyEmailPage() {
	const [searchParams] = useSearchParams();
	const token = searchParams.get('token') ?? '';
	const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
	const [message, setMessage] = useState('Verifying your email...');

	useEffect(() => {
		if (!token) {
			setStatus('error');
			setMessage('This verification link is missing its token.');
			return;
		}

		verifyEmailApi(token)
			.then(res => {
				setStatus('success');
				setMessage(res.data.data.message);
			})
			.catch(err => {
				setStatus('error');
				if (axios.isAxiosError(err)) {
					setMessage((err.response?.data as { error?: string } | undefined)?.error ?? 'Unable to verify this email.');
				} else {
					setMessage('Unable to verify this email.');
				}
			});
	}, [token]);

	return (
		<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Email verification</CardTitle>
					<CardDescription>Finish activating your QR Guest account.</CardDescription>
				</CardHeader>
				<CardContent>
					<Alert variant={status === 'error' ? 'destructive' : 'default'}>
						<AlertDescription>{message}</AlertDescription>
					</Alert>
				</CardContent>
				<CardFooter>
					<Button
						asChild
						className="w-full">
						<Link to="/login">Go to login</Link>
					</Button>
				</CardFooter>
			</Card>
		</div>
	);
}
