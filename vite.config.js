import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
    plugins: [viteSingleFile()],
    base: './',
    build: {
        outDir: 'docs',
        emptyOutDir: true,
        target: 'es2020',
        cssCodeSplit: false,
        assetsInlineLimit: 100000000,
        chunkSizeWarningLimit: 4000
    }
});
