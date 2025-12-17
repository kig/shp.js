import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

const external = ['three'];

export default [
  // Main SHP parser - ESM
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.esm.js',
      format: 'esm',
      sourcemap: true,
    },
    plugins: [typescript()],
    external,
  },
  // Main SHP parser - CJS
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.cjs',
      format: 'cjs',
      sourcemap: true,
    },
    plugins: [typescript()],
    external,
  },
  // THREE.js integration - ESM
  {
    input: 'src/three.ts',
    output: {
      file: 'dist/three.esm.js',
      format: 'esm',
      sourcemap: true,
    },
    plugins: [typescript()],
    external,
  },
  // THREE.js integration - CJS
  {
    input: 'src/three.ts',
    output: {
      file: 'dist/three.cjs',
      format: 'cjs',
      sourcemap: true,
    },
    plugins: [typescript()],
    external,
  },
  // Type declarations
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.d.ts',
      format: 'esm',
    },
    plugins: [dts()],
    external,
  },
  {
    input: 'src/three.ts',
    output: {
      file: 'dist/three.d.ts',
      format: 'esm',
    },
    plugins: [dts()],
    external,
  },
];
