import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

/**
 * Generates a PDF with one QR code per page for each guest.
 * Returns the PDF as a Blob.
 */
export async function generateQrPdf(
	guests: { id: string; name: string; qrToken: string }[],
	eventName: string,
): Promise<Blob> {
	const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
	const pageWidth = doc.internal.pageSize.getWidth();
	const pageHeight = doc.internal.pageSize.getHeight();
	const qrSizeMm = 100;
	const qrX = (pageWidth - qrSizeMm) / 2;
	const qrY = (pageHeight - qrSizeMm) / 2 - 20;

	for (let i = 0; i < guests.length; i++) {
		if (i > 0) doc.addPage();

		const guest = guests[i];

		// Event name at the top
		doc.setFontSize(14);
		doc.setFont('helvetica', 'bold');
		doc.text(eventName, pageWidth / 2, 20, { align: 'center' });

		// Guest name below event name
		doc.setFontSize(18);
		doc.text(guest.name, pageWidth / 2, 35, { align: 'center' });

		// Generate QR code as data URL
		const dataUrl = await QRCode.toDataURL(guest.qrToken, {
			width: 400,
			margin: 2,
			color: { dark: '#000000', light: '#ffffff' },
		});

		// Embed QR image
		doc.addImage(dataUrl, 'PNG', qrX, qrY, qrSizeMm, qrSizeMm);

		// Guest ID in small print below QR
		doc.setFontSize(8);
		doc.setFont('helvetica', 'normal');
		doc.setTextColor(150);
		doc.text(guest.id, pageWidth / 2, qrY + qrSizeMm + 8, { align: 'center' });
		doc.setTextColor(0);
	}

	return doc.output('blob');
}

/**
 * Triggers a browser download of the given blob.
 */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

/**
 * Tries to share the blob via the Web Share API.
 * Falls back to downloading if sharing is not supported.
 * Returns true if shared via native share, false if downloaded.
 */
export async function sharePdfOrDownload(blob: Blob, filename: string, title: string): Promise<boolean> {
	if (
		typeof navigator.share === 'function' &&
		typeof navigator.canShare === 'function' &&
		navigator.canShare({ files: [new File([blob], filename, { type: 'application/pdf' })] })
	) {
		await navigator.share({
			files: [new File([blob], filename, { type: 'application/pdf' })],
			title,
		});
		return true;
	}
	downloadBlob(blob, filename);
	return false;
}
