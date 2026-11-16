import js from '@eslint/js'

// TypeScript 7 is not supported by typescript-eslint 8.x yet, so ESLint
// currently only covers JavaScript files. TypeScript is checked by `tsc`.
export default [
  {
    ignores: [
      'build/**',
      'node_modules/**',
      'coverage/**',
      'dist/**',
      'types/**',
      // 实验性模块，API 与风格尚不稳定，暂不纳入 lint
      'src/experimental/**',
      '**/*.test.ts',
      '**/*.test.js',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  },
]
