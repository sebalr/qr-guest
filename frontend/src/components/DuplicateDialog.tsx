import { LocalTicket, LocalScan } from '../db';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface Props {
	ticket: LocalTicket;
	lastScan: LocalScan;
	onScanAgain: () => void;
	onCancel: () => void;
}

export default function DuplicateDialog({ ticket, lastScan, onScanAgain, onCancel }: Props) {
	const scanTime = new Date(lastScan.scanned_at).toLocaleString();

	return (
		<div className="fixed inset-0 bg-black/75 flex items-end sm:items-center justify-center z-50 p-4">
			<div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm text-gray-800">
				<div className="p-6 text-center">
					<div className="flex justify-center mb-4">
						<div className="bg-orange-100 rounded-full p-3">
							<AlertTriangle className="h-8 w-8 text-orange-500" />
						</div>
					</div>
					<h2 className="text-xl font-bold text-orange-600 mb-1">Duplicate Scan Detected</h2>
					<p className="font-semibold text-gray-800">{ticket.name}</p>
					<p className="text-gray-500 text-sm mt-1">
						This ticket was already scanned at <span className="font-medium text-gray-700">{scanTime}</span>.
					</p>
					<p className="text-gray-500 text-sm mt-1">You can still record this scan if this person needs to be counted again.</p>
				</div>
				<div className="px-6 pb-6 flex gap-3">
					<Button
						variant="outline"
						className="flex-1"
						onClick={onCancel}>
						Cancel
					</Button>
					<Button
						className="flex-1 bg-orange-500 hover:bg-orange-600"
						onClick={onScanAgain}>
						Record Again
					</Button>
				</div>
			</div>
		</div>
	);
}
