import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
	plugins: [
		react(),
		VitePWA({
			registerType: 'autoUpdate',
			manifest: {
				name: 'QR Guest',
				short_name: 'QRGuest',
				description: 'Offline-first QR event management',
				start_url: '/',
				scope: '/',
				display: 'standalone',
				background_color: '#ffffff',
				theme_color: '#1d4ed8',
				icons: [
					{
						src: 'favicon.svg',
						sizes: 'any',
						type: 'image/svg+xml',
						purpose: 'any',
					},
				],
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,svg}'],
				runtimeCaching: [
					{
						urlPattern: /^https?:\/\/.*\/api\/.*/i,
						handler: 'NetworkFirst',
						options: {
							cacheName: 'api-cache',
							expiration: { maxEntries: 100, maxAgeSeconds: 86400 },
						},
					},
				],
			},
		}),
	],
});
