import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

interface Props {
  online: boolean;
  lastSync: string | null;
  scannedCount: number;
  totalCount: number;
  unsyncedCount?: number;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function SyncStatus({ online, lastSync, scannedCount, totalCount, unsyncedCount = 0 }: Props) {
  return (
    <div className="text-right text-xs text-gray-400 leading-snug">
      <div className="flex items-center justify-end gap-1.5 font-medium mb-0.5">
        {online
          ? <Wifi className="h-3.5 w-3.5 text-green-400" />
          : <WifiOff className="h-3.5 w-3.5 text-red-400" />
        }
        <span className={online ? 'text-green-400' : 'text-red-400'}>
          {online ? 'Online' : 'Offline'}
        </span>
      </div>
      {lastSync && (
        <div className="flex items-center justify-end gap-1">
          <RefreshCw className="h-3 w-3" />
          {timeAgo(lastSync)}
        </div>
      )}
      <div className="font-mono">
        {scannedCount}/{totalCount}
      </div>
      {unsyncedCount > 0 && (
        <div className="text-yellow-400">{unsyncedCount} pending</div>
      )}
    </div>
  );
}

