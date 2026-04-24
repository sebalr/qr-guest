import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { loginApi } from '../api';
import { isRecaptchaEnabled, executeRecaptcha } from '../recaptcha';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { QrCode, AlertCircle } from 'lucide-react';

export default function LoginPage() {
	const { login } = useAuth();
	const navigate = useNavigate();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		setError('');
		setLoading(true);

		try {
			let recaptchaToken: string | undefined;
			if (isRecaptchaEnabled()) {
				recaptchaToken = await executeRecaptcha('login');
			}

			const res = await loginApi(email, password, recaptchaToken);
			login(res.data.data.token);
			navigate('/events');
		} catch {
			setError('Invalid credentials. Please try again.');
		} finally {
			setLoading(false);
		}
	}

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
								<Label htmlFor="password">Password</Label>
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
		</div>
	);
}

