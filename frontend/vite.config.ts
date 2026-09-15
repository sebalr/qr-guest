import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  build: { rollupOptions: { output: { manualChunks(id) {
    if (id.includes('pdfjs-dist')) return 'pdf-preview';
    if (id.includes('pdf-lib') || id.includes('@pdf-lib')) return 'pdf-edit';
    if (id.includes('jspdf')) return 'pdf-basic';
  } } } },
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
	plugins: [
		react(),
		VitePWA({
			registerType: 'prompt',
			manifest: {
				name: 'Tiqra',
				short_name: 'Tiqra',
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
        clientsClaim: true,
				globPatterns: ['**/*.{js,mjs,css,html,svg}'],
				runtimeCaching: [], // Authenticated data is stored only in tenant/event-scoped IndexedDB.
			},
		}),
	],
});
