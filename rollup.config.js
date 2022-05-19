import pkg from './package.json'
import cjs from '@rollup/plugin-commonjs'
import typescript from "@rollup/plugin-typescript"

export default {
  input: './src/index.ts',
  output: [
    {
      format: 'cjs',
      file: pkg.main,
      sourcemap: true
    },
    {
      format: 'es',
      file: pkg.module,
      sourcemap: true
    }
  ],
  plugins: [
    typescript({
      exclude: 'node_modules/**',
      typescript: require('typescript'),
    }),
    
    cjs({
      extensions: ['.js', '.ts']
    })
  ],
};
