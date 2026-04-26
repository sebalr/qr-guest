import { createHmac, timingSafeEqual } from 'crypto';

const TOKEN_BYTE_LENGTH = 40;
const UUID_BYTE_LENGTH = 16;
const MAC_BYTE_LENGTH = 8;

export function generateCompactQRToken(tid: string, eid: string, secret: string): string {
	const tidBytes = uuidToBytes(tid);
	const eidBytes = uuidToBytes(eid);
	const mac = createQrMac(tidBytes, eidBytes, secret);
	return Buffer.concat([tidBytes, eidBytes, mac]).toString('base64url');
}

export function verifyCompactQRToken(token: string, tid: string, eid: string, secret: string): boolean {
	try {
		const buf = Buffer.from(token, 'base64url');
		if (buf.length !== TOKEN_BYTE_LENGTH) return false;

		const tidBytes = uuidToBytes(tid);
		const eidBytes = uuidToBytes(eid);
		const expectedMac = createQrMac(tidBytes, eidBytes, secret);
		const actualMac = buf.subarray(UUID_BYTE_LENGTH * 2, UUID_BYTE_LENGTH * 2 + MAC_BYTE_LENGTH);

		return timingSafeEqual(expectedMac, actualMac);
	} catch {
		return false;
	}
}

function createQrMac(tidBytes: Buffer, eidBytes: Buffer, secret: string): Buffer {
	return createHmac('sha256', secret)
		.update(Buffer.concat([tidBytes, eidBytes]))
		.digest()
		.subarray(0, MAC_BYTE_LENGTH);
}

function uuidToBytes(uuid: string): Buffer {
	const bytes = Buffer.from(uuid.replace(/-/g, ''), 'hex');
	if (bytes.length !== UUID_BYTE_LENGTH) {
		throw new Error('Invalid UUID');
	}
	return bytes;
}