import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, CloudOff, QrCode, ShieldCheck, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import './LandingPage.css';

const freePlanFeatures = ['1 active event', 'Basic check-in metrics', 'Email support'];
const paidPlanFeatures = ['Unlimited events', 'Advanced analytics dashboard', 'Priority support and faster sync'];

const steps = [
	{
		title: 'Create your event and QR passes',
		description: 'Launch in minutes with a clean workflow for teams and volunteers.',
	},
	{
		title: 'Scan guests even with no internet',
		description: 'Tiqra stores scans locally and syncs safely when your connection returns.',
	},
	{
		title: 'Handle updates instantly',
		description: 'Need to cancel a pass or registration? Apply it once and scanners receive it on sync.',
	},
];

export default function LandingPage() {
	return (
		<div className="landing-shell min-h-screen text-slate-900">
			<div className="landing-aurora" />
			<div className="landing-grid" />
			<header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6 md:px-8">
				<div className="flex items-center gap-3">
					<div className="rounded-xl bg-slate-900 p-2 text-white shadow-lg shadow-slate-900/25">
						<QrCode className="h-5 w-5" />
					</div>
					<div>
						<p className="landing-logo text-lg leading-none">Tiqra</p>
						<p className="text-xs text-slate-500">Guest operations that keep moving</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Button
						asChild
						variant="ghost"
						className="font-semibold text-slate-700 hover:text-slate-950">
						<Link to="/register">Start free</Link>
					</Button>
					<Button
						asChild
						className="bg-slate-900 text-white hover:bg-slate-800">
						<Link to="/login">Login</Link>
					</Button>
				</div>
			</header>

			<main className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-20 md:px-8">
				<section className="grid items-center gap-10 py-10 md:grid-cols-[1.15fr_0.85fr] md:py-14">
					<div>
						<Badge className="mb-4 bg-emerald-100 text-emerald-900 hover:bg-emerald-100">Built for busy check-in teams</Badge>
						<h1 className="landing-headline max-w-xl text-4xl leading-tight md:text-6xl">
							Guest access done fast, reliable, and ready for real-world chaos.
						</h1>
						<p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 md:text-lg">
							Tiqra helps you run check-in with confidence: scan offline, manage cancellations, and keep your data consistent across
							devices.
						</p>
						<div className="mt-8 flex flex-wrap items-center gap-3">
							<Button
								asChild
								size="lg"
								className="bg-slate-900 text-white hover:bg-slate-800">
								<Link to="/login">
									Login to Tiqra
									<ArrowRight className="ml-2 h-4 w-4" />
								</Link>
							</Button>
							<Button
								asChild
								size="lg"
								variant="outline"
								className="border-slate-300 bg-white/70 text-slate-800 hover:bg-white">
								<Link to="/register">Try free plan</Link>
							</Button>
						</div>
					</div>
					<Card className="overflow-hidden border-white/70 bg-white/80 shadow-xl shadow-slate-200/70 backdrop-blur">
						<CardContent className="space-y-5 p-6">
							<div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
								<CloudOff className="mt-0.5 h-5 w-5 text-slate-700" />
								<div>
									<p className="font-semibold text-slate-900">Offline scanning that just works</p>
									<p className="text-sm text-slate-600">No signal at the venue? Keep scanning and sync later without duplicates.</p>
								</div>
							</div>
							<div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
								<ShieldCheck className="mt-0.5 h-5 w-5 text-slate-700" />
								<div>
									<p className="font-semibold text-slate-900">Cancellation-aware check-ins</p>
									<p className="text-sm text-slate-600">Protect entrances by marking canceled guests and enforcing at scan time.</p>
								</div>
							</div>
							<div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
								<WalletCards className="mt-0.5 h-5 w-5 text-slate-700" />
								<div>
									<p className="font-semibold text-slate-900">Free and paid plans</p>
									<p className="text-sm text-slate-600">Start free now, then unlock advanced controls when your events grow.</p>
								</div>
							</div>
						</CardContent>
					</Card>
				</section>

				<section className="mt-4 grid gap-4 md:grid-cols-3">
					{steps.map((step, index) => (
						<Card
							key={step.title}
							className="border-slate-200 bg-white/80 backdrop-blur">
							<CardContent className="p-5">
								<p className="text-xs font-semibold tracking-[0.12em] text-slate-500">STEP 0{index + 1}</p>
								<h2 className="mt-2 text-lg font-semibold text-slate-900">{step.title}</h2>
								<p className="mt-2 text-sm leading-relaxed text-slate-600">{step.description}</p>
							</CardContent>
						</Card>
					))}
				</section>

				<section className="mt-10 grid gap-5 md:grid-cols-2">
					<Card className="border-slate-300 bg-white/85 shadow-sm">
						<CardContent className="p-6">
							<p className="text-sm font-semibold tracking-wide text-slate-500">FREE PLAN</p>
							<p className="mt-2 text-3xl font-extrabold text-slate-900">$0</p>
							<p className="mt-1 text-sm text-slate-600">Perfect for smaller events and testing workflows.</p>
							<ul className="mt-4 space-y-2 text-sm text-slate-700">
								{freePlanFeatures.map(feature => (
									<li
										key={feature}
										className="flex items-center gap-2">
										<CheckCircle2 className="h-4 w-4 text-emerald-600" />
										<span>{feature}</span>
									</li>
								))}
							</ul>
						</CardContent>
					</Card>

					<Card className="border-slate-900 bg-slate-900 text-white shadow-sm">
						<CardContent className="p-6">
							<p className="text-sm font-semibold tracking-wide text-slate-300">PAID PLAN</p>
							<p className="mt-2 text-3xl font-extrabold">From $29/mo</p>
							<p className="mt-1 text-sm text-slate-200">For teams that need speed, control, and detailed visibility.</p>
							<ul className="mt-4 space-y-2 text-sm text-slate-100">
								{paidPlanFeatures.map(feature => (
									<li
										key={feature}
										className="flex items-center gap-2">
										<CheckCircle2 className="h-4 w-4 text-emerald-300" />
										<span>{feature}</span>
									</li>
								))}
							</ul>
						</CardContent>
					</Card>
				</section>

				<section className="mt-10 rounded-3xl border border-slate-200 bg-white/85 p-8 text-center shadow-sm">
					<h2 className="landing-headline text-3xl text-slate-900 md:text-4xl">Ready to run your next check-in with Tiqra?</h2>
					<p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 md:text-base">
						Set up your team, publish QR passes, and keep entry lines moving even when connectivity drops.
					</p>
					<div className="mt-6 flex flex-wrap justify-center gap-3">
						<Button
							asChild
							size="lg"
							className="bg-slate-900 text-white hover:bg-slate-800">
							<Link to="/login">Login</Link>
						</Button>
						<Button
							asChild
							size="lg"
							variant="outline"
							className="border-slate-300 bg-white text-slate-800 hover:bg-slate-50">
							<Link to="/register">Create account</Link>
						</Button>
					</div>
				</section>
			</main>
		</div>
	);
}
