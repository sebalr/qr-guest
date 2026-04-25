import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../auth/AuthContext';
import { loginApi, resendVerificationApi } from '../api';
import { isRecaptchaEnabled, executeRecaptcha } from '../recaptcha';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { QrCode, AlertCircle } from 'lucide-react';
import { TenantSelectionDialog } from '@/components/TenantSelectionDialog';

interface Tenant {
	id: string;
	name: string;
	role: string;
}

export default function LoginPage() {
	const { login, selectTenant, setAvailableTenants } = useAuth();
	const navigate = useNavigate();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState('');
	const [errorCode, setErrorCode] = useState('');
	const [infoMessage, setInfoMessage] = useState('');
	const [loading, setLoading] = useState(false);
	const [resendingVerification, setResendingVerification] = useState(false);
	const [showTenantDialog, setShowTenantDialog] = useState(false);
	const [availableTenants, setLocalAvailableTenants] = useState<Tenant[]>([]);
	const [pendingUserId, setPendingUserId] = useState('');

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		setError('');
		setErrorCode('');
		setInfoMessage('');
		setLoading(true);

		try {
			let recaptchaToken: string | undefined;
			if (isRecaptchaEnabled()) {
				recaptchaToken = await executeRecaptcha('login');
			}

			const res = await loginApi(email, password, recaptchaToken);
			const responseData = res.data.data;

			// Check if user has multiple tenants or single tenant
			if (responseData.token) {
				login(responseData.token);
				navigate('/events');
			} else if (responseData.tenants && responseData.tenants.length > 0) {
				setPendingUserId(responseData.userId ?? '');
				setLocalAvailableTenants(responseData.tenants);
				setAvailableTenants(responseData.tenants);
				setShowTenantDialog(true);
			} else {
				setError('No tenants available for this account.');
			}
		} catch (err) {
			if (axios.isAxiosError(err)) {
				const apiError = err.response?.data as { error?: string; code?: string } | undefined;
				setError(apiError?.error ?? 'Invalid credentials. Please try again.');
				setErrorCode(apiError?.code ?? '');
			} else {
				setError('Invalid credentials. Please try again.');
			}
		} finally {
			setLoading(false);
		}
	}

	const handleTenantSelect = async (tenantId: string) => {
		try {
			setError('');
			if (!pendingUserId) {
				throw new Error('Missing tenant selection session.');
			}

			await selectTenant(pendingUserId, tenantId);
			setShowTenantDialog(false);
			navigate('/events');
		} catch (err) {
			setError('Failed to select tenant. Please try again.');
		}
	};

	const handleResendVerification = async () => {
		setResendingVerification(true);
		setError('');
		setInfoMessage('');

		try {
			const res = await resendVerificationApi(email);
			setInfoMessage(res.data.data.message);
		} catch (err) {
			if (axios.isAxiosError(err)) {
				setError((err.response?.data as { error?: string } | undefined)?.error ?? 'Failed to resend verification email.');
			} else {
				setError('Failed to resend verification email.');
			}
		} finally {
			setResendingVerification(false);
		}
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4">
			<div className="w-full max-w-sm">
				<div className="flex justify-center mb-6">
					<div className="flex items-center gap-2">
						<div className="bg-primary rounded-xl p-2.5">
							<QrCode className="h-7 w-7 text-primary-foreground" />
						</div>
						<span className="text-2xl font-bold tracking-tight">QR Guest</span>
					</div>
				</div>
				<Card>
					<CardHeader className="space-y-1">
						<CardTitle className="text-2xl text-center">Welcome back</CardTitle>
						<CardDescription className="text-center">Sign in to your account to continue</CardDescription>
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
									placeholder="you@example.com"
									required
									value={email}
									onChange={e => setEmail(e.target.value)}
								/>
							</div>
							<div className="space-y-2">
								<div className="flex items-center justify-between gap-3">
									<Label htmlFor="password">Password</Label>
									<Link
										to="/forgot-password"
										className="text-xs text-primary font-medium hover:underline">
										Forgot password?
									</Link>
								</div>
								<Input
									id="password"
									type="password"
									placeholder="••••••••"
									required
									value={password}
									onChange={e => setPassword(e.target.value)}
								/>
							</div>
							{error && (
								<Alert variant="destructive">
									<AlertCircle className="h-4 w-4" />
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							)}
							{infoMessage && (
								<Alert>
									<AlertDescription>{infoMessage}</AlertDescription>
								</Alert>
							)}
							{errorCode === 'EMAIL_NOT_VERIFIED' && email && (
								<Button
									type="button"
									variant="outline"
									className="w-full"
									onClick={handleResendVerification}
									disabled={resendingVerification}>
									{resendingVerification ? 'Sending verification email…' : 'Resend verification email'}
								</Button>
							)}
							<Button
								type="submit"
								className="w-full"
								disabled={loading}>
								{loading ? 'Signing in…' : 'Sign In'}
							</Button>
						</form>
					</CardContent>
					<CardFooter>
						<p className="text-sm text-center text-muted-foreground w-full">
							No account?{' '}
							<Link
								to="/register"
								className="text-primary font-medium hover:underline">
								Create one
							</Link>
						</p>
					</CardFooter>
				</Card>
			</div>

			<TenantSelectionDialog
				tenants={availableTenants}
				onSelect={handleTenantSelect}
				isOpen={showTenantDialog}
			/>
		</div>
	);
}
