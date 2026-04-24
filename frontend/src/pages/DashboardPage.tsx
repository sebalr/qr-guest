import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getEventApi, getEventStatsApi, Event, EventStats } from '../api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Users, CheckCircle2, XCircle, AlertTriangle, RefreshCw, BarChart2 } from 'lucide-react';

export default function DashboardPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const [event, setEvent] = useState<Event | null>(null);
	const [stats, setStats] = useState<EventStats | null>(null);
	const [loading, setLoading] = useState(true);
	const [autoRefresh, setAutoRefresh] = useState(false);
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

	const fetchStats = useCallback(async () => {
		if (!id) return;
		try {
			const [evRes, stRes] = await Promise.all([getEventApi(id), getEventStatsApi(id)]);
			setEvent(evRes.data.data);
			setStats(stRes.data.data);
			setLastUpdated(new Date());
		} catch {
			// silent
		} finally {
			setLoading(false);
		}
	}, [id]);

	useEffect(() => {
		fetchStats();
	}, [fetchStats]);

	useEffect(() => {
		if (!autoRefresh) return;
		const interval = setInterval(fetchStats, 30_000);
		return () => clearInterval(interval);
	}, [autoRefresh, fetchStats]);

	const attendanceRate = stats && stats.totalGuests > 0 ? Math.round((stats.scannedGuests / stats.totalGuests) * 100) : 0;

	const maxBarCount = stats?.scansByHour.length ? Math.max(...stats.scansByHour.map(h => h.count), 1) : 1;

	if (loading) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<p className="text-muted-foreground">Loading dashboard…</p>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-slate-50">
			<header className="bg-background border-b sticky top-0 z-10">
				<div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
					<Button
						variant="ghost"
						size="icon"
						onClick={() => navigate(`/events/${id}`)}>
						<ArrowLeft className="h-4 w-4" />
					</Button>
					<div className="flex-1 min-w-0">
						<h1 className="font-bold text-lg truncate">{event?.name ?? 'Event'}</h1>
						<p className="text-xs text-muted-foreground">Scan Dashboard</p>
					</div>
					<div className="flex items-center gap-2">
						{lastUpdated && <span className="text-xs text-muted-foreground hidden sm:block">Updated {lastUpdated.toLocaleTimeString()}</span>}
						<Button
							variant={autoRefresh ? 'default' : 'outline'}
							size="sm"
							className="gap-1.5"
							onClick={() => setAutoRefresh(v => !v)}>
							<RefreshCw className={`h-3.5 w-3.5 ${autoRefresh ? 'animate-spin' : ''}`} />
							<span className="hidden sm:inline">{autoRefresh ? 'Auto' : 'Manual'}</span>
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={fetchStats}>
							<RefreshCw className="h-3.5 w-3.5" />
						</Button>
					</div>
				</div>
			</header>

			<main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
				{/* Summary cards */}
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
					<Card>
						<CardContent className="pt-5 flex flex-col items-center text-center">
							<Users className="h-5 w-5 text-muted-foreground mb-2" />
							<p className="text-3xl font-bold">{stats?.totalGuests ?? 0}</p>
							<p className="text-xs text-muted-foreground mt-1">Total Guests</p>
						</CardContent>
					</Card>
					<Card className="border-green-100 bg-green-50">
						<CardContent className="pt-5 flex flex-col items-center text-center">
							<CheckCircle2 className="h-5 w-5 text-green-600 mb-2" />
							<p className="text-3xl font-bold text-green-700">{stats?.scannedGuests ?? 0}</p>
							<p className="text-xs text-muted-foreground mt-1">Checked In</p>
						</CardContent>
					</Card>
					<Card className="border-yellow-100 bg-yellow-50">
						<CardContent className="pt-5 flex flex-col items-center text-center">
							<XCircle className="h-5 w-5 text-yellow-600 mb-2" />
							<p className="text-3xl font-bold text-yellow-700">{stats?.notScannedGuests ?? 0}</p>
							<p className="text-xs text-muted-foreground mt-1">Not Arrived</p>
						</CardContent>
					</Card>
					<Card className="border-red-100 bg-red-50">
						<CardContent className="pt-5 flex flex-col items-center text-center">
							<AlertTriangle className="h-5 w-5 text-red-500 mb-2" />
							<p className="text-3xl font-bold text-red-600">{stats?.duplicates ?? 0}</p>
							<p className="text-xs text-muted-foreground mt-1">Duplicate Scans</p>
						</CardContent>
					</Card>
				</div>

				{/* Attendance rate */}
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Attendance Rate</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex items-center gap-4">
							<div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
								<div
									className="h-full bg-green-500 rounded-full transition-all duration-500"
									style={{ width: `${attendanceRate}%` }}
								/>
							</div>
							<span className="font-bold text-lg w-14 text-right">{attendanceRate}%</span>
						</div>
						<p className="text-xs text-muted-foreground mt-2">
							{stats?.scannedGuests ?? 0} of {stats?.totalGuests ?? 0} guests checked in
						</p>
					</CardContent>
				</Card>

				{/* Scan timeline */}
				{stats && stats.scansByHour.length > 0 && (
					<Card>
						<CardHeader>
							<CardTitle className="text-base flex items-center gap-2">
								<BarChart2 className="h-4 w-4" />
								Scans by Hour (last 48 h)
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="flex items-end gap-1 h-32 overflow-x-auto">
								{stats.scansByHour.map(point => {
									const barHeight = Math.max(4, Math.round((point.count / maxBarCount) * 120));
									const hour = new Date(point.hour);
									const label = hour.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
									return (
										<div
											key={point.hour}
											className="flex flex-col items-center gap-1 shrink-0"
											title={`${label}: ${point.count} scan${point.count !== 1 ? 's' : ''}`}>
											<span className="text-xs text-muted-foreground">{point.count}</span>
											<div
												className="w-7 bg-primary rounded-t"
												style={{ height: `${barHeight}px` }}
											/>
											<span className="text-xs text-muted-foreground rotate-45 origin-left w-8 truncate">{label}</span>
										</div>
									);
								})}
							</div>
						</CardContent>
					</Card>
				)}

				{/* Top guests */}
				{stats && stats.topGuests.length > 0 && (
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Top Scanned Guests</CardTitle>
						</CardHeader>
						<CardContent className="p-0">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b bg-slate-50">
										<th className="text-left px-4 py-2 font-medium text-muted-foreground">#</th>
										<th className="text-left px-4 py-2 font-medium text-muted-foreground">Guest</th>
										<th className="text-right px-4 py-2 font-medium text-muted-foreground">Scans</th>
										<th className="text-right px-4 py-2 font-medium text-muted-foreground">Status</th>
									</tr>
								</thead>
								<tbody>
									{stats.topGuests.map((guest, idx) => (
										<tr
											key={guest.ticketId}
											className="border-b last:border-0">
											<td className="px-4 py-2 text-muted-foreground">{idx + 1}</td>
											<td className="px-4 py-2 font-medium">{guest.name}</td>
											<td className="px-4 py-2 text-right">
												<Badge variant={guest.scanCount > 1 ? 'warning' : guest.scanCount === 1 ? 'success' : 'secondary'}>
													{guest.scanCount}
												</Badge>
											</td>
											<td className="px-4 py-2 text-right">
												{guest.scanCount >= 1 ? (
													<Badge variant="success">Scanned</Badge>
												) : (
													<Badge variant="secondary">Pending</Badge>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</CardContent>
					</Card>
				)}

				{stats && stats.totalScans === 0 && (
					<Card className="py-12 text-center">
						<CardContent>
							<BarChart2 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
							<p className="text-muted-foreground">No scans recorded yet.</p>
						</CardContent>
					</Card>
				)}
			</main>
		</div>
	);
}
