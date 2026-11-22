import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

async function build() {
  console.log('⚡ Starting TypeScript build...');

  // Ensure output directory
  fs.mkdirSync('dist/renderer', { recursive: true });

  // 1. Build Main Process
  await esbuild.build({
    entryPoints: ['src/main/main.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    external: ['electron'],
    outfile: 'dist/main.js',
    sourcemap: true
  });

  // 2. Build Preload Process
  await esbuild.build({
    entryPoints: ['src/main/preload.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    external: ['electron'],
    outfile: 'dist/preload.js',
    sourcemap: true
  });

  // 3. Build Renderer TypeScript
  await esbuild.build({
    entryPoints: ['src/renderer/app.ts'],
    bundle: true,
    platform: 'browser',
    target: 'es2022',
    outfile: 'dist/renderer/app.js',
    sourcemap: true
  });

  // 4. Copy static assets
  fs.copyFileSync('src/renderer/index.html', 'dist/renderer/index.html');
  fs.copyFileSync('src/renderer/style.css', 'dist/renderer/style.css');

  console.log('✅ Build completed successfully in dist/');
}

build().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
