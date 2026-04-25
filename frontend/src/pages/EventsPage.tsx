import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getEventsApi, createEventApi, Event } from '../api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { QrCode, Plus, X, Calendar, ChevronRight, AlertCircle, LogOut, Shield, Image } from 'lucide-react';

export default function EventsPage() {
	const { logout, user } = useAuth();
	const navigate = useNavigate();
	const [events, setEvents] = useState<Event[]>([]);
	const [loading, setLoading] = useState(true);
	const [showForm, setShowForm] = useState(false);
	const [name, setName] = useState('');
	const [startsAt, setStartsAt] = useState<Date | undefined>(undefined);
	const [endsAt, setEndsAt] = useState<Date | undefined>(undefined);
	const [description, setDescription] = useState('');
	const [imageUrl, setImageUrl] = useState('');
	const [formError, setFormError] = useState('');
	const [creating, setCreating] = useState(false);

	useEffect(() => {
		getEventsApi()
			.then(r => setEvents(r.data.data))
			.catch(() => setEvents([]))
			.finally(() => setLoading(false));
	}, []);

	async function handleCreate(e: FormEvent) {
		e.preventDefault();
		setFormError('');
		setCreating(true);
		try {
			const res = await createEventApi({
				name,
				startsAt: startsAt?.toISOString(),
				endsAt: endsAt?.toISOString(),
				description: description || undefined,
				imageUrl: imageUrl || undefined,
			});
			setEvents(prev => [res.data.data, ...prev]);
			setShowForm(false);
			setName('');
			setStartsAt(undefined);
			setEndsAt(undefined);
			setDescription('');
			setImageUrl('');
		} catch (error: unknown) {
			const errorMsg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create event.';
			setFormError(errorMsg);
		} finally {
			setCreating(false);
		}
	}

	function formatDateRange(ev: Event) {
		if (!ev.startsAt && !ev.endsAt) return null;
		if (ev.startsAt && ev.endsAt) {
			return `${new Date(ev.startsAt).toLocaleString()} – ${new Date(ev.endsAt).toLocaleString()}`;
		}
		if (ev.startsAt) return `From ${new Date(ev.startsAt).toLocaleString()}`;
		if (ev.endsAt) return `Until ${new Date(ev.endsAt).toLocaleString()}`;
		return null;
	}

	return (
		<div className="min-h-screen bg-slate-50">
			<header className="bg-background border-b sticky top-0 z-10">
				<div className="max-w-3xl mx-auto px-4 py-3 flex justify-between items-center">
					<div className="flex items-center gap-2">
						<div className="bg-primary rounded-lg p-1.5">
							<QrCode className="h-5 w-5 text-primary-foreground" />
						</div>
						<span className="font-bold text-lg tracking-tight">QR Guest</span>
					</div>
					<div className="flex items-center gap-2">
						<span className="text-sm text-muted-foreground hidden sm:block">{user?.email}</span>
						{user?.isSuperAdmin && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => navigate('/super-admin')}
								className="gap-1.5">
								<Shield className="h-3.5 w-3.5" />
								<span className="hidden sm:inline">Super Admin</span>
							</Button>
						)}
						<Button
							variant="ghost"
							size="sm"
							onClick={logout}
							className="gap-1.5">
							<LogOut className="h-3.5 w-3.5" />
							<span className="hidden sm:inline">Logout</span>
						</Button>
					</div>
				</div>
			</header>

			<main className="max-w-3xl mx-auto px-4 py-8">
				<div className="flex justify-between items-center mb-6">
					<div>
						<h1 className="text-2xl font-bold tracking-tight">Events</h1>
						<p className="text-muted-foreground text-sm">Manage your guest events</p>
					</div>
					<Button
						onClick={() => setShowForm(v => !v)}
						className="gap-2">
						{showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
						{showForm ? 'Cancel' : 'New Event'}
					</Button>
				</div>

				{showForm && (
					<Card className="mb-6">
						<CardHeader>
							<CardTitle className="text-lg">Create Event</CardTitle>
						</CardHeader>
						<CardContent>
							<form
								onSubmit={handleCreate}
								className="space-y-4">
								<div className="space-y-2">
									<Label htmlFor="event-name">
										Event Name <span className="text-destructive">*</span>
									</Label>
									<Input
										id="event-name"
										type="text"
										placeholder="e.g. Annual Conference 2025"
										required
										value={name}
										onChange={e => setName(e.target.value)}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="event-description">Description</Label>
									<Textarea
										id="event-description"
										rows={3}
										placeholder="Optional event description"
										value={description}
										onChange={e => setDescription(e.target.value)}
									/>
								</div>
								<div className="grid gap-4">
									<div className="space-y-2">
										<Label>Start Date & Time</Label>
										<DateTimePicker
											value={startsAt}
											onChange={setStartsAt}
											placeholder="Pick start date & time"
										/>
									</div>
									<div className="space-y-2">
										<Label>End Date & Time</Label>
										<DateTimePicker
											value={endsAt}
											onChange={setEndsAt}
											placeholder="Pick end date & time"
										/>
									</div>
								</div>
								<div className="space-y-2">
									<Label htmlFor="image-url">
										<Image className="inline h-3.5 w-3.5 mr-1" />
										Image URL
									</Label>
									<Input
										id="image-url"
										type="url"
										placeholder="https://example.com/event-image.jpg"
										value={imageUrl}
										onChange={e => setImageUrl(e.target.value)}
									/>
								</div>
								{formError && (
									<Alert variant="destructive">
										<AlertCircle className="h-4 w-4" />
										<AlertDescription>{formError}</AlertDescription>
									</Alert>
								)}
								<Button
									type="submit"
									disabled={creating}>
									{creating ? 'Creating…' : 'Create Event'}
								</Button>
							</form>
						</CardContent>
					</Card>
				)}

				{loading ? (
					<div className="text-center py-16 text-muted-foreground">Loading events…</div>
				) : events.length === 0 ? (
					<Card className="py-16 text-center">
						<CardContent>
							<Calendar className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
							<p className="text-muted-foreground">No events yet. Create your first event above.</p>
						</CardContent>
					</Card>
				) : (
					<div className="space-y-3">
						{events.map(ev => (
							<Card
								key={ev.id}
								className="cursor-pointer hover:shadow-md transition-shadow"
								onClick={() => navigate(`/events/${ev.id}`)}>
								<CardContent className="p-5 flex justify-between items-center gap-4">
									<div className="flex items-center gap-4 min-w-0">
										{ev.imageUrl && (
											<img
												src={ev.imageUrl}
												alt={ev.name}
												className="h-12 w-12 rounded-lg object-cover shrink-0"
												onError={e => ((e.target as HTMLImageElement).style.display = 'none')}
											/>
										)}
										<div className="min-w-0">
											<p className="font-semibold truncate">{ev.name}</p>
											{ev.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{ev.description}</p>}
											{formatDateRange(ev) && <p className="text-sm text-muted-foreground mt-0.5">{formatDateRange(ev)}</p>}
										</div>
									</div>
									<ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
								</CardContent>
							</Card>
						))}
					</div>
				)}
			</main>

			<Separator className="hidden" />
		</div>
	);
}
