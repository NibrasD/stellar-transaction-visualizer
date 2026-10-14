import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/sdk/index.ts'),
      name: 'StellarTransactionVisualizer',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    outDir: 'dist/sdk',
    emptyOutDir: false,
    rollupOptions: {
      external: [
        '@stellar/stellar-sdk',
        '@supabase/supabase-js',
        'react',
        'react-dom',
        'reactflow',
        'buffer',
      ],
      output: {
        exports: 'named',
        globals: {
          '@stellar/stellar-sdk': 'StellarSdk',
          react: 'React',
          'react-dom': 'ReactDOM',
          reactflow: 'ReactFlow',
        },
      },
    },
  },
});
