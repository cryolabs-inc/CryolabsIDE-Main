import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import commonjs from 'vite-plugin-commonjs';
import * as monacoEditorPlugin from 'vite-plugin-monaco-editor';
const fun = (monacoEditorPlugin.default as unknown as typeof monacoEditorPlugin).default;
export default defineConfig({ plugins: [tailwindcss(), sveltekit(), commonjs(), fun({})], build: {
    minify: 'esbuild',
}, esbuild: {
    pure: ['console.debug'],
    legalComments: 'none',
}, resolve: {
    alias: {
        "path": "path-browserify"
    },
},server: {
    hmr: false,
    allowedHosts: ["disc.hs.vc", "cryolabs.org"]
}, "worker": {
    format: "es"
},
   preview: {
	allowedHosts: ["disc.hs.vc", "cryolabs.org"],
    
}


});
