import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
	online: boolean;
	lastSync: string | null;
	scannedCount: number;
	totalCount: number;
	unsyncedCount?: number;
	hasIndexedDbError?: boolean;
}

function timeAgo(iso: string, t: (key: string, options?: Record<string, unknown>) => string): string {
	const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
	if (diff < 60) return t('scanner.syncStatus.secondsAgo', { count: diff });
	if (diff < 3600) return t('scanner.syncStatus.minutesAgo', { count: Math.floor(diff / 60) });
	return t('scanner.syncStatus.hoursAgo', { count: Math.floor(diff / 3600) });
}

export default function SyncStatus({ online, lastSync, scannedCount, totalCount, unsyncedCount = 0, hasIndexedDbError = false }: Props) {
	const { t } = useTranslation();

	return (
		<div className="text-right text-xs text-gray-400 leading-snug">
			<div className="flex items-center justify-end gap-1.5 font-medium mb-0.5">
				{online ? <Wifi className="h-3.5 w-3.5 text-green-400" /> : <WifiOff className="h-3.5 w-3.5 text-red-400" />}
				<span className={online ? 'text-green-400' : 'text-red-400'}>
					{online ? t('scanner.syncStatus.online') : t('scanner.syncStatus.offline')}
				</span>
			</div>
			{lastSync && (
				<div className="flex items-center justify-end gap-1">
					<RefreshCw className="h-3 w-3" />
					{timeAgo(lastSync, t)}
				</div>
			)}
			<div className="font-mono">
				{scannedCount}/{totalCount}
			</div>
			{hasIndexedDbError && (
				<div className="text-red-400 flex items-center justify-end gap-1">
					<span
						className="inline-block h-2 w-2 rounded-full bg-red-500"
						aria-hidden="true"
					/>
					{t('scanner.syncStatus.notSynced')}
				</div>
			)}
			{unsyncedCount > 0 && <div className="text-yellow-400">{t('scanner.syncStatus.pending', { count: unsyncedCount })}</div>}
		</div>
	);
}
