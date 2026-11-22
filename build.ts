import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import * as sass from 'sass';

async function build() {
  console.log('⚡ Starting TypeScript & SCSS build...');

  // Ensure output directory
  fs.mkdirSync('dist/renderer', { recursive: true });

  // 1. Compile Modular SCSS to CSS
  console.log('🎨 Compiling SCSS modules...');
  const scssResult = sass.compile('src/renderer/styles/main.scss', {
    style: 'compressed',
    sourceMap: false
  });
  fs.writeFileSync('dist/renderer/style.css', scssResult.css);

  // 2. Build Main Process TypeScript
  console.log('🖥️  Bundling Electron Main process...');
  await esbuild.build({
    entryPoints: ['src/main/main.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    external: ['electron'],
    outfile: 'dist/main.js',
    sourcemap: true
  });

  // 3. Build Preload Process TypeScript
  console.log('🔗 Bundling Preload bridge...');
  await esbuild.build({
    entryPoints: ['src/main/preload.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    external: ['electron'],
    outfile: 'dist/preload.js',
    sourcemap: true
  });

  // 4. Build Renderer TypeScript with Modular Components & WebGL
  console.log('🚀 Bundling Renderer UI with WebGL...');
  await esbuild.build({
    entryPoints: ['src/renderer/app.ts'],
    bundle: true,
    platform: 'browser',
    target: 'es2022',
    outfile: 'dist/renderer/app.js',
    sourcemap: true
  });

  // 5. Copy static assets
  fs.copyFileSync('src/renderer/index.html', 'dist/renderer/index.html');

  console.log('✅ Build completed successfully in dist/ with WebGL & SCSS!');
}

build().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
