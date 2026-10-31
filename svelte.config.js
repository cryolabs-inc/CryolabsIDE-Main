import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess({
		style: {
			
		}
	}),

	kit: {
		adapter: adapter(),
		serviceWorker: {
			register: false,
			// VM disks, kernels and initrds belong exclusively to the existing OPFS cache.
			files: (file) => [
				'manifest.webmanifest', 'xterm.css', 'manual_config.yaml',
				'libv86.mjs', 'v86.wasm', 'seabios.bin', 'vgabios.bin',
				'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
			].includes(file)
		},
	},
};

export default config;
