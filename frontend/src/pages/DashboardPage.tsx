import { PageHeading, WorkspaceState } from '../components/WorkspaceLayout';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
	getEventApi,
	getEventStatsApi,
	getEventDeviceDebugDataApi,
	getEventDeviceDebugDataItemApi,
	Event,
	EventStats,
	EventDeviceDebugDataItem,
	EventDeviceDebugDataDetail,
} from '../api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, CheckCircle2, XCircle, AlertTriangle, RefreshCw, BarChart2, Clock, Shield, Download, Bug } from 'lucide-react';
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	AreaChart,
	Area,
	Cell,
	PieChart,
	Pie,
	Legend,
} from 'recharts';

type Interval = '1h' | '30m' | '5m';

function formatBucket(bucket: string, interval: Interval): string {
	const d = new Date(bucket);
	if (interval === '1h') {
		return d.toLocaleTimeString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}
	return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Compute a gradient colour for the bar fill based on relative height */
function barFill(count: number, maxCount: number): string {
	if (maxCount === 0) return '#416a4f';
	const ratio = count / maxCount;
	if (ratio > 0.75) return '#163e32';
	if (ratio > 0.5) return '#416a4f';
	if (ratio > 0.25) return '#628051';
	return '#8ba55f';
}

export default function DashboardPage() {
	const { t } = useTranslation();
	const { id } = useParams<{ id: string }>();
	const [searchParams] = useSearchParams();
	const tenantId = searchParams.get('tenantId') ?? undefined;
	const [loadError, setLoadError] = useState(false);
	const [event, setEvent] = useState<Event | null>(null);
	const [stats, setStats] = useState<EventStats | null>(null);
	const [loading, setLoading] = useState(true);
	const [autoRefresh, setAutoRefresh] = useState(false);
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
	const [interval, setSelectedInterval] = useState<Interval>('1h');
	const [debugDataRows, setDebugDataRows] = useState<EventDeviceDebugDataItem[]>([]);
	const [debugDataLoading, setDebugDataLoading] = useState(false);
	const [downloadingDebugId, setDownloadingDebugId] = useState<string | null>(null);
	const [debugDataError, setDebugDataError] = useState('');

	const fetchStats = useCallback(async () => {
		if (!id) return;
		try {
			const [evRes, stRes] = await Promise.all([getEventApi(id, { tenantId }), getEventStatsApi(id, interval, { tenantId })]);
			setEvent(evRes.data.data);
			setStats(stRes.data.data);
			setLoadError(false);
			setLastUpdated(new Date());
		} catch {
			setLoadError(true);
		} finally {
			setLoading(false);
		}
	}, [id, interval, tenantId]);

	useEffect(() => {
		fetchStats();
	}, [fetchStats]);

	const fetchDeviceDebugData = useCallback(async () => {
		if (!id) return;
		setDebugDataLoading(true);
		setDebugDataError('');

		try {
			const res = await getEventDeviceDebugDataApi(id, { tenantId });
			setDebugDataRows(res.data.data);
		} catch {
			setDebugDataError(t('dashboardPage.errors.loadDeviceDebugFailed'));
		} finally {
			setDebugDataLoading(false);
		}
	}, [id, t, tenantId]);

	useEffect(() => {
		fetchDeviceDebugData();
	}, [fetchDeviceDebugData]);

	const downloadDebugPayload = useCallback(
		async (dumpId: string) => {
			if (!id) return;
			setDownloadingDebugId(dumpId);
			setDebugDataError('');

			try {
				const res = await getEventDeviceDebugDataItemApi(id, dumpId, { tenantId });
				const item: EventDeviceDebugDataDetail = res.data.data;
				const serialized = JSON.stringify(item, null, 2);
				const blob = new Blob([serialized], { type: 'application/json' });
				const url = URL.createObjectURL(blob);
				const anchor = document.createElement('a');
				anchor.href = url;
				anchor.download = `event-${id}-device-debug-${item.deviceId}-${item.id}.json`;
				document.body.appendChild(anchor);
				anchor.click();
				anchor.remove();
				URL.revokeObjectURL(url);
			} catch {
				setDebugDataError(t('dashboardPage.errors.downloadDeviceDebugFailed'));
			} finally {
				setDownloadingDebugId(null);
			}
		},
		[id, t, tenantId],
	);

	useEffect(() => {
		if (!autoRefresh) return;
		const timer = setInterval(fetchStats, 30_000);
		return () => clearInterval(timer);
	}, [autoRefresh, fetchStats]);

	const attendanceRate = stats && stats.totalGuests > 0 ? Math.round((stats.scannedGuests / stats.totalGuests) * 100) : 0;

	const maxScanCount = stats?.scansByInterval?.length ? Math.max(...stats.scansByInterval.map(h => h.count), 1) : 1;

	const chartScansByInterval = (stats?.scansByInterval ?? []).map(row => ({
		label: formatBucket(row.bucket, interval),
		count: row.count,
		fill: barFill(row.count, maxScanCount),
	}));

	const chartCumulative = (stats?.firstScansByInterval ?? []).map(row => ({
		label: formatBucket(row.bucket, interval),
		checkedIn: row.count,
	}));

	const chartUserRanking = (stats?.userScanRanking ?? []).map(row => ({
		label: row.email.split('@')[0],
		email: row.email,
		scans: row.scanCount,
	}));

	const chartTopScannerShare = (() => {
		const ranking = stats?.userScanRanking ?? [];
		if (ranking.length === 0) return [] as { name: string; value: number }[];

		const top = ranking.slice(0, 5).map(row => ({
			name: row.email.split('@')[0],
			value: row.scanCount,
		}));

		const others = ranking.slice(5).reduce((sum, row) => sum + row.scanCount, 0);
		if (others > 0) {
			top.push({ name: t('dashboardPage.labels.others'), value: others });
		}

		return top;
	})();

	if (loading) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<p className="text-muted-foreground">{t('dashboardPage.loading')}</p>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-background">
			<PageHeading title={event?.name ?? t('dashboardPage.fallbackEventName')} description={t('dashboardPage.title')}>
				<Button variant={autoRefresh ? 'default' : 'outline'} aria-pressed={autoRefresh} onClick={() => setAutoRefresh(v => !v)}>
					<RefreshCw size={16} />
					{t(autoRefresh ? 'dashboardPage.actions.auto' : 'dashboardPage.actions.manual')}
				</Button>
				<Button variant="outline" aria-label={t('workspace.refresh')} onClick={fetchStats}>
					<RefreshCw size={16} />
				</Button>
			</PageHeading>
			{loadError && (
				<div role="alert" className="mb-5">
					<WorkspaceState title={t('workspace.loadFailed')} action={<Button onClick={fetchStats}>{t('workspace.retry')}</Button>} />
				</div>
			)}
			{lastUpdated && (
				<p className="text-xs text-muted-foreground mb-5">{t('dashboardPage.lastUpdated', { value: lastUpdated.toLocaleTimeString() })}</p>
			)}

			{stats && (
				<main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
					{/* Summary cards */}
					<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
						<Card>
							<CardContent className="pt-5 flex flex-col items-center text-center">
								<Users className="h-5 w-5 text-muted-foreground mb-2" />
								<p className="text-3xl font-bold">{stats?.totalGuests ?? 0}</p>
								<p className="text-xs text-muted-foreground mt-1">{t('dashboardPage.summary.totalGuests')}</p>
							</CardContent>
						</Card>
						<Card className="border-green-100 bg-secondary">
							<CardContent className="pt-5 flex flex-col items-center text-center">
								<CheckCircle2 className="h-5 w-5 text-primary mb-2" />
								<p className="text-3xl font-bold text-primary">{stats?.scannedGuests ?? 0}</p>
								<p className="text-xs text-muted-foreground mt-1">{t('dashboardPage.summary.checkedIn')}</p>
							</CardContent>
						</Card>
						<Card className="border-yellow-100 bg-yellow-50">
							<CardContent className="pt-5 flex flex-col items-center text-center">
								<XCircle className="h-5 w-5 text-yellow-600 mb-2" />
								<p className="text-3xl font-bold text-yellow-700">{stats?.notScannedGuests ?? 0}</p>
								<p className="text-xs text-muted-foreground mt-1">{t('dashboardPage.summary.notArrived')}</p>
							</CardContent>
						</Card>
						<Card className="border-red-100 bg-red-50">
							<CardContent className="pt-5 flex flex-col items-center text-center">
								<AlertTriangle className="h-5 w-5 text-red-500 mb-2" />
								<p className="text-3xl font-bold text-red-600">{stats?.duplicates ?? 0}</p>
								<p className="text-xs text-muted-foreground mt-1">{t('dashboardPage.summary.duplicateScans')}</p>
							</CardContent>
						</Card>
					</div>

					{/* Attendance rate */}
					<Card>
						<CardHeader>
							<CardTitle className="text-base">{t('dashboardPage.attendance.title')}</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="flex items-center gap-4">
								<div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
									<div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${attendanceRate}%` }} />
								</div>
								<span className="font-bold text-lg w-14 text-right">{attendanceRate}%</span>
							</div>
							<p className="text-xs text-muted-foreground mt-2">
								{t('dashboardPage.attendance.detail', { scanned: stats?.scannedGuests ?? 0, total: stats?.totalGuests ?? 0 })}
							</p>
						</CardContent>
					</Card>

					{/* Scan arrival heat map */}
					<Card>
						<CardHeader>
							<div className="flex items-center justify-between flex-wrap gap-2">
								<CardTitle className="text-base flex items-center gap-2">
									<BarChart2 className="h-4 w-4" />
									{t('dashboardPage.charts.scanArrivals')}
								</CardTitle>
								<div className="flex items-center gap-1 text-xs">
									<Clock className="h-3.5 w-3.5 text-muted-foreground" />
									{(['1h', '30m', '5m'] as Interval[]).map(iv => (
										<button
											key={iv}
											onClick={() => setSelectedInterval(iv)}
											className={`px-2.5 py-1 rounded-md border font-medium transition-colors ${
												interval === iv
													? 'bg-primary text-primary-foreground border-primary'
													: 'bg-background text-muted-foreground hover:bg-accent border-input'
											}`}>
											{iv}
										</button>
									))}
								</div>
							</div>
						</CardHeader>
						<CardContent>
							{chartScansByInterval.length === 0 ? (
								<p className="text-sm text-muted-foreground text-center py-8">{t('dashboardPage.empty.noScans')}</p>
							) : (
								<ResponsiveContainer width="100%" height={220}>
									<BarChart data={chartScansByInterval} margin={{ top: 4, right: 4, left: -20, bottom: 48 }}>
										<CartesianGrid strokeDasharray="3 3" stroke="#e8eddf" />
										<XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-40} textAnchor="end" interval="preserveStartEnd" />
										<YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
										<Tooltip
											formatter={v => [v, t('dashboardPage.charts.scans')]}
											contentStyle={{ fontSize: '12px', borderRadius: '8px' }}
										/>
										<Bar isAnimationActive={false} dataKey="count" radius={[4, 4, 0, 0]}>
											{chartScansByInterval.map((entry, i) => (
												<Cell key={i} fill={entry.fill} />
											))}
										</Bar>
									</BarChart>
								</ResponsiveContainer>
							)}
						</CardContent>
					</Card>

					{/* Cumulative check-ins */}
					{chartCumulative.length > 0 && (
						<Card>
							<CardHeader>
								<CardTitle className="text-base flex items-center gap-2">
									<CheckCircle2 className="h-4 w-4 text-primary" />
									{t('dashboardPage.charts.cumulativeCheckins')}
								</CardTitle>
							</CardHeader>
							<CardContent>
								<ResponsiveContainer width="100%" height={200}>
									<AreaChart data={chartCumulative} margin={{ top: 4, right: 4, left: -20, bottom: 48 }}>
										<defs>
											<linearGradient id="checkinGrad" x1="0" y1="0" x2="0" y2="1">
												<stop offset="5%" stopColor="#628051" stopOpacity={0.3} />
												<stop offset="95%" stopColor="#628051" stopOpacity={0} />
											</linearGradient>
										</defs>
										<CartesianGrid strokeDasharray="3 3" stroke="#e8eddf" />
										<XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-40} textAnchor="end" interval="preserveStartEnd" />
										<YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
										<Tooltip
											formatter={v => [v, t('dashboardPage.summary.checkedIn')]}
											contentStyle={{ fontSize: '12px', borderRadius: '8px' }}
										/>
										<Area
											isAnimationActive={false}
											type="monotone"
											dataKey="checkedIn"
											stroke="#628051"
											strokeWidth={2}
											fill="url(#checkinGrad)"
										/>
									</AreaChart>
								</ResponsiveContainer>
							</CardContent>
						</Card>
					)}

					{/* User scan ranking */}
					{chartUserRanking.length > 0 && (
						<Card>
							<CardHeader>
								<CardTitle className="text-base flex items-center gap-2">
									<Shield className="h-4 w-4 text-indigo-500" />
									{t('dashboardPage.charts.scannerRanking')}
								</CardTitle>
							</CardHeader>
							<CardContent>
								<ResponsiveContainer width="100%" height={Math.max(120, chartUserRanking.length * 36)}>
									<BarChart layout="vertical" data={chartUserRanking} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
										<CartesianGrid strokeDasharray="3 3" stroke="#e8eddf" horizontal={false} />
										<XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
										<YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={90} />
										<Tooltip
											formatter={v => [v, t('dashboardPage.charts.scans')]}
											contentStyle={{ fontSize: '12px', borderRadius: '8px' }}
										/>
										<Bar isAnimationActive={false} dataKey="scans" fill="#416a4f" radius={[0, 4, 4, 0]} />
									</BarChart>
								</ResponsiveContainer>
							</CardContent>
						</Card>
					)}

					{chartTopScannerShare.length > 0 && (
						<Card>
							<CardHeader>
								<CardTitle className="text-base flex items-center gap-2">
									<Shield className="h-4 w-4 text-indigo-500" />
									{t('dashboardPage.charts.topScannerShare')}
								</CardTitle>
							</CardHeader>
							<CardContent>
								<ResponsiveContainer width="100%" height={260}>
									<PieChart>
										<Pie
											isAnimationActive={false}
											data={chartTopScannerShare}
											dataKey="value"
											nameKey="name"
											cx="50%"
											cy="50%"
											outerRadius={84}
											label={({ name, percent }) => `${name} ${(((percent ?? 0) as number) * 100).toFixed(0)}%`}>
											{chartTopScannerShare.map((_, index) => (
												<Cell key={`slice-${index}`} fill={['#163e32', '#416a4f', '#628051', '#8ba55f', '#b8ce87', '#d6e5b4'][index % 6]} />
											))}
										</Pie>
										<Tooltip formatter={value => [`${value}`, t('dashboardPage.charts.scans')]} />
										<Legend />
									</PieChart>
								</ResponsiveContainer>
							</CardContent>
						</Card>
					)}

					{/* Duplicate scans table */}
					{stats && stats.duplicateTickets && stats.duplicateTickets.length > 0 && (
						<Card>
							<CardHeader>
								<CardTitle className="text-base flex items-center gap-2">
									<AlertTriangle className="h-4 w-4 text-red-500" />
									{t('dashboardPage.charts.multipleScansTitle')}
								</CardTitle>
							</CardHeader>
							<CardContent className="p-0 overflow-x-auto">
								<table className="w-full text-sm">
									<thead>
										<tr className="border-b bg-background">
											<th className="text-left px-4 py-2 font-medium text-muted-foreground">#</th>
											<th className="text-left px-4 py-2 font-medium text-muted-foreground">{t('dashboardPage.table.guest')}</th>
											<th className="text-right px-4 py-2 font-medium text-muted-foreground">{t('dashboardPage.table.timesScanned')}</th>
										</tr>
									</thead>
									<tbody>
										{stats.duplicateTickets.map((t, idx) => (
											<tr key={t.ticketId} className="border-b last:border-0">
												<td className="px-4 py-2 text-muted-foreground">{idx + 1}</td>
												<td className="px-4 py-2 font-medium">{t.name}</td>
												<td className="px-4 py-2 text-right">
													<Badge variant="warning">{t.scanCount}×</Badge>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</CardContent>
						</Card>
					)}

					{/* Top guests */}
					{stats && stats.topGuests.length > 0 && (
						<Card>
							<CardHeader>
								<CardTitle className="text-base">{t('dashboardPage.charts.topScannedGuests')}</CardTitle>
							</CardHeader>
							<CardContent className="p-0 overflow-x-auto">
								<table className="w-full text-sm">
									<thead>
										<tr className="border-b bg-background">
											<th className="text-left px-4 py-2 font-medium text-muted-foreground">#</th>
											<th className="text-left px-4 py-2 font-medium text-muted-foreground">{t('dashboardPage.table.guest')}</th>
											<th className="text-right px-4 py-2 font-medium text-muted-foreground">{t('dashboardPage.charts.scans')}</th>
											<th className="text-right px-4 py-2 font-medium text-muted-foreground">{t('dashboardPage.table.status')}</th>
										</tr>
									</thead>
									<tbody>
										{stats.topGuests.map((guest, idx) => (
											<tr key={guest.ticketId} className="border-b last:border-0">
												<td className="px-4 py-2 text-muted-foreground">{idx + 1}</td>
												<td className="px-4 py-2 font-medium">{guest.name}</td>
												<td className="px-4 py-2 text-right">
													<Badge variant={guest.scanCount > 1 ? 'warning' : guest.scanCount === 1 ? 'success' : 'secondary'}>
														{guest.scanCount}
													</Badge>
												</td>
												<td className="px-4 py-2 text-right">
													{guest.scanCount >= 1 ? (
														<Badge variant="success">{t('dashboardPage.table.scanned')}</Badge>
													) : (
														<Badge variant="secondary">{t('dashboardPage.table.pending')}</Badge>
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
								<p className="text-muted-foreground">{t('dashboardPage.empty.noScans')}</p>
							</CardContent>
						</Card>
					)}
					<details className="ws-details">
						<summary>{t('dashboardPage.debug.title')}</summary>
						<Card>
							<CardHeader>
								<div className="flex items-center justify-between gap-3 flex-wrap">
									<CardTitle className="text-base flex items-center gap-2">
										<Bug className="h-4 w-4" />
										{t('dashboardPage.debug.title')}
									</CardTitle>
									<Button
										variant="outline"
										size="sm"
										aria-label={t('workspace.refresh')}
										onClick={fetchDeviceDebugData}
										disabled={debugDataLoading}>
										<RefreshCw className={`h-3.5 w-3.5 ${debugDataLoading ? 'animate-spin' : ''}`} />
									</Button>
								</div>
							</CardHeader>
							<CardContent>
								{debugDataError && <p className="text-sm text-destructive mb-3">{debugDataError}</p>}
								{debugDataRows.length === 0 ? (
									<p className="text-sm text-muted-foreground">{t('dashboardPage.debug.empty')}</p>
								) : (
									<div className="space-y-2">
										{debugDataRows.map(item => (
											<div key={item.id} className="border rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap">
												<div className="min-w-0">
													<p className="text-sm font-medium">{t('dashboardPage.debug.device', { deviceId: item.deviceId })}</p>
													<p className="text-xs text-muted-foreground truncate">
														{t('dashboardPage.debug.uploadedByOn', {
															uploader: item.uploaderEmail || item.userId,
															date: new Date(item.createdAt).toLocaleString(),
														})}
													</p>
													<p className="text-[11px] text-muted-foreground">
														{t('dashboardPage.debug.bytes', { value: item.payloadSizeBytes })}
													</p>
												</div>
												<Button
													variant="outline"
													size="sm"
													onClick={() => downloadDebugPayload(item.id)}
													disabled={downloadingDebugId === item.id}
													className="gap-1.5">
													<Download className="h-3.5 w-3.5" />
													{downloadingDebugId === item.id ? t('dashboardPage.debug.downloading') : t('dashboardPage.debug.downloadJson')}
												</Button>
											</div>
										))}
									</div>
								)}
							</CardContent>
						</Card>
					</details>
				</main>
			)}
		</div>
	);
}
