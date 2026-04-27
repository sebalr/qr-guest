import { LocalTicket, LocalScan } from '../db';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
	ticket: LocalTicket;
	lastScan: LocalScan;
	onScanAgain: () => void;
	onCancel: () => void;
}

export default function DuplicateDialog({ ticket, lastScan, onScanAgain, onCancel }: Props) {
	const { t, i18n } = useTranslation();
	const scanTime = new Date(lastScan.scanned_at).toLocaleString(i18n.language);

	return (
		<div className="fixed inset-0 bg-black/75 flex items-end sm:items-center justify-center z-50 p-4">
			<div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm text-gray-800">
				<div className="p-6 text-center">
					<div className="flex justify-center mb-4">
						<div className="bg-orange-100 rounded-full p-3">
							<AlertTriangle className="h-8 w-8 text-orange-500" />
						</div>
					</div>
					<h2 className="text-xl font-bold text-orange-600 mb-1">{t('scanner.duplicateDialog.title')}</h2>
					<p className="font-semibold text-gray-800">{ticket.name}</p>
					<p className="text-gray-500 text-sm mt-1">{t('scanner.duplicateDialog.alreadyScannedAt', { scanTime })}</p>
					<p className="text-gray-500 text-sm mt-1">{t('scanner.duplicateDialog.description')}</p>
				</div>
				<div className="px-6 pb-6 flex gap-3">
					<Button
						variant="outline"
						className="flex-1"
						onClick={onCancel}>
						{t('common.cancel')}
					</Button>
					<Button
						className="flex-1 bg-orange-500 hover:bg-orange-600"
						onClick={onScanAgain}>
						{t('scanner.duplicateDialog.recordAgain')}
					</Button>
				</div>
			</div>
		</div>
	);
}
