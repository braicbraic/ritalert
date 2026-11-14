const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['rainbowkit-init.jsx'],
  bundle: true,
  minify: true,
  format: 'iife',
  outfile: 'rainbowkit-bundle.js',
  define: {
    'process.env.NODE_ENV': '"development"',
    'global': 'window'
  }
}).then(() => {
  console.log('✅ RainbowKit bundle built successfully with process.env polyfills!');
}).catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
