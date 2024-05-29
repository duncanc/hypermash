
import { RollupOptions } from 'rollup';
import tsPlugin from '@rollup/plugin-typescript';

const bundle: RollupOptions[] = [];

bundle.push({
  output: {
    file: 'build/hypermash.js',
    format: 'iife',
  },
  input: 'src/main.ts',
  plugins: [
    tsPlugin({
    }),
  ],
});

export default bundle;
