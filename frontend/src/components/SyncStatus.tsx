interface Props {
  online: boolean;
  lastSync: string | null;
  scannedCount: number;
  totalCount: number;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function SyncStatus({ online, lastSync, scannedCount, totalCount }: Props) {
  return (
    <div className="text-right text-xs text-gray-300 leading-snug">
      <div className="flex items-center justify-end gap-1 font-medium">
        <span>{online ? '🟢' : '🔴'}</span>
        <span>{online ? 'Online' : 'Offline'}</span>
      </div>
      {lastSync && <div>Synced {timeAgo(lastSync)}</div>}
      <div>
        {scannedCount}/{totalCount} scanned
      </div>
    </div>
  );
}
