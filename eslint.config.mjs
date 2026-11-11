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
