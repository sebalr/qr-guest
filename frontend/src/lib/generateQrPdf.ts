import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

/**
 * Generates a PDF with one QR code per page for each guest.
 * Returns the PDF as a Blob.
 */
export async function generateQrPdf(
	guests: { id: string; name: string; qrToken: string }[],
	eventName: string,
	options?: {
		description?: string | null;
		imageUrl?: string | null;
		includeDescriptionInPdf?: boolean;
		includeImageInPdf?: boolean;
		tiqraUrl?: string;
	},
): Promise<Blob> {
	const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
	const pageWidth = doc.internal.pageSize.getWidth();
	const pageHeight = doc.internal.pageSize.getHeight();
	const qrSizeMm = 100;
	const qrX = (pageWidth - qrSizeMm) / 2;
	const qrY = (pageHeight - qrSizeMm) / 2 - 20;
	const hasDescription =
		options?.includeDescriptionInPdf === true && typeof options?.description === 'string' && options.description.trim().length > 0;
	const hasImage = options?.includeImageInPdf === true && typeof options?.imageUrl === 'string' && options.imageUrl.trim().length > 0;
	const footerHintY = pageHeight - 12;
	const footerUrlY = footerHintY - 5;

	for (let i = 0; i < guests.length; i++) {
		if (i > 0) doc.addPage();

		const guest = guests[i];

		// Event name at the top
		doc.setFontSize(14);
		doc.setFont('helvetica', 'bold');
		doc.text(eventName, pageWidth / 2, 20, { align: 'center' });

		if (hasDescription) {
			doc.setFontSize(10);
			doc.setFont('helvetica', 'normal');
			doc.setTextColor(80);
			const descriptionLines = doc.splitTextToSize(options?.description?.trim() ?? '', pageWidth - 30) as string[];
			doc.text(descriptionLines, pageWidth / 2, 35, { align: 'center' });
			doc.setTextColor(0);
		}

		// Generate QR code as data URL
		const dataUrl = await QRCode.toDataURL(guest.qrToken, {
			width: 400,
			margin: 2,
			color: { dark: '#000000', light: '#ffffff' },
		});

		// Embed QR image
		doc.addImage(dataUrl, 'PNG', qrX, qrY, qrSizeMm, qrSizeMm);

		let imageBottomY = qrY + qrSizeMm;
		if (hasImage) {
			try {
				const imageAsset = await fetchImageAsDataUrl(options?.imageUrl ?? '');
				const imageWidthMm = 70;
				const imageHeightMm = 28;
				const imageX = (pageWidth - imageWidthMm) / 2;
				const imageY = qrY + qrSizeMm + 16;
				doc.addImage(imageAsset.dataUrl, imageAsset.format, imageX, imageY, imageWidthMm, imageHeightMm);
				imageBottomY = imageY + imageHeightMm;
			} catch {
				// Ignore image rendering failures so QR export still succeeds.
			}
		}

		// Guest ID in small print below the QR/image stack
		doc.setFontSize(8);
		doc.setFont('helvetica', 'normal');
		doc.setTextColor(150);
		doc.text(guest.id, pageWidth / 2, imageBottomY + 8, { align: 'center' });

		doc.setFontSize(7);
		doc.setTextColor(110);
		doc.text(
			'For best scanning results, keep the phone brightness high and the QR near the top of the screen.',
			pageWidth / 2,
			footerHintY,
			{
				align: 'center',
				maxWidth: pageWidth - 20,
			},
		);

		if (options?.tiqraUrl?.trim()) {
			doc.text(options.tiqraUrl.trim(), pageWidth / 2, footerUrlY, { align: 'center' });
		}
		doc.setTextColor(0);
	}

	return doc.output('blob');
}

async function fetchImageAsDataUrl(imageUrl: string): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' }> {
	const response = await fetch(imageUrl, { mode: 'cors' });
	if (!response.ok) {
		throw new Error(`Failed to load image: ${response.status}`);
	}
	const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
	const format: 'PNG' | 'JPEG' = contentType.includes('png') ? 'PNG' : 'JPEG';
	const blob = await response.blob();
	return await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === 'string') {
				resolve(reader.result);
				return;
			}
			reject(new Error('Unable to convert image to data URL'));
		};
		reader.onerror = () => reject(new Error('Unable to read image blob'));
		reader.readAsDataURL(blob);
	}).then(dataUrl => ({ dataUrl, format }));
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
	const file = new File([blob], filename, { type: 'application/pdf' });
	if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
		await navigator.share({ files: [file], title });
		return true;
	}
	downloadBlob(blob, filename);
	return false;
}
