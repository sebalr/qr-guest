import { LocalTicket, LocalScan } from '../db';

interface Props {
  ticket: LocalTicket;
  lastScan: LocalScan;
  onScanAgain: () => void;
  onCancel: () => void;
}

export default function DuplicateDialog({ ticket, lastScan, onScanAgain, onCancel }: Props) {
  const scanTime = new Date(lastScan.scanned_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-gray-800">
        <div className="text-center mb-4">
          <span className="text-5xl">⚠️</span>
        </div>
        <h2 className="text-xl font-bold text-center text-orange-600 mb-2">
          Ticket Already Scanned
        </h2>
        <p className="text-center text-gray-600 mb-1">
          <span className="font-semibold">{ticket.name}</span>
        </p>
        <p className="text-center text-gray-500 text-sm mb-6">
          Last scanned at <span className="font-medium text-gray-700">{scanTime}</span>
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onScanAgain}
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-xl font-medium"
          >
            Scan Again
          </button>
        </div>
      </div>
    </div>
  );
}
