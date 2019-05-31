import nodeResolve from 'rollup-plugin-node-resolve'
import cjs from 'rollup-plugin-commonjs'
import babel from 'rollup-plugin-babel'

export default {
  input: 'src/index.js',

  output: [
    {
      file: 'dist/vait.esm.js',
      format: 'es',
      sourcemap: true,
      name: 'Vait'
    },
    {
      file: 'dist/vait.common.js',
      format: 'cjs',
      sourcemap: true,
      name: 'Vait'
    }
  ],

  plugins: [
    nodeResolve(),

    cjs({
      namedExports: { './vait.common.js': ['Vait', 'bar' ] }
    }),

    babel({
      exclude: 'node_modules/**'
    })
  ]
}
