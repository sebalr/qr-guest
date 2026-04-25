import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { MailCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

interface LocationState {
	message?: string;
}

export default function RegisterCheckEmailPage() {
	const [searchParams] = useSearchParams();
	const location = useLocation();
	const state = location.state as LocationState | null;
	const email = searchParams.get('email') ?? '';
	const message =
		state?.message ?? 'We sent a verification link to your inbox. Open that email and confirm your address to activate your account.';

	return (
		<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4">
			<Card className="w-full max-w-lg">
				<CardHeader className="text-center space-y-3">
					<div className="mx-auto bg-emerald-100 text-emerald-700 rounded-full p-3 w-fit">
						<MailCheck className="h-8 w-8" />
					</div>
					<CardTitle className="text-2xl">Check your email</CardTitle>
					<CardDescription className="text-base">Your account is almost ready.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3 text-center">
					<p className="text-sm text-muted-foreground">{message}</p>
					{email && <p className="text-sm font-medium">Verification email sent to: {email}</p>}
					<p className="text-sm text-muted-foreground">If you do not see it, check your spam folder.</p>
				</CardContent>
				<CardFooter className="flex flex-col gap-2">
					<Button
						asChild
						className="w-full">
						<Link to="/login">Go to login</Link>
					</Button>
					<Button
						asChild
						variant="ghost"
						className="w-full">
						<Link to="/register">Create a different account</Link>
					</Button>
				</CardFooter>
			</Card>
		</div>
	);
}
