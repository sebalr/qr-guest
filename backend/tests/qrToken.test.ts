import { describe, expect, it } from 'vitest';

import { generateCompactQRToken, verifyCompactQRToken } from '../src/lib/qrToken';

describe('qrToken', () => {
	const ticketId = '11111111-2222-3333-4444-555555555555';
	const eventId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
	const secret = 'test-qr-secret';

	it('generates a compact token with embedded ids and valid HMAC', () => {
		const token = generateCompactQRToken(ticketId, eventId, secret);
		const bytes = Buffer.from(token, 'base64url');

		expect(token).toHaveLength(54);
		expect(bytes).toHaveLength(40);
		expect(bytes.subarray(0, 16).toString('hex')).toBe('11111111222233334444555555555555');
		expect(bytes.subarray(16, 32).toString('hex')).toBe('aaaaaaaabbbbccccddddeeeeeeeeeeee');
		expect(verifyCompactQRToken(token, ticketId, eventId, secret)).toBe(true);
	});

	it('rejects a token if ids do not match', () => {
		const token = generateCompactQRToken(ticketId, eventId, secret);

		expect(verifyCompactQRToken(token, ticketId, 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff', secret)).toBe(false);
	});

	it('rejects a token if the MAC is tampered', () => {
		const bytes = Buffer.from(generateCompactQRToken(ticketId, eventId, secret), 'base64url');
		bytes[39] ^= 0xff;

		expect(verifyCompactQRToken(bytes.toString('base64url'), ticketId, eventId, secret)).toBe(false);
	});

	it('rejects malformed tokens and invalid UUIDs', () => {
		expect(verifyCompactQRToken('not-a-token', ticketId, eventId, secret)).toBe(false);
		expect(() => generateCompactQRToken('invalid-uuid', eventId, secret)).toThrow('Invalid UUID');
	});
});