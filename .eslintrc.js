module.exports = {
  root: true,
  ignorePatterns: ['/build/', '/docs/', '/lib/', '/node_modules/'],
  overrides: [
    {
      files: ['*.js'],
      extends: 'eslint:recommended',
      parserOptions: { ecmaVersion: 2018 },
      env: { node: true },
    },
    {
      files: ['**/*.ts'],
      plugins: ['@typescript-eslint', 'import'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: './tsconfig.json',
      },
      extends: [
        'plugin:@typescript-eslint/recommended',
        'prettier',
        'prettier/@typescript-eslint',
      ],
      rules: {
        // Disallow `any`.  (This is overridden for test files, below)
        '@typescript-eslint/no-explicit-any': 'error',

        // Allow "newspaper" code structure
        '@typescript-eslint/no-use-before-define': 'off',

        // Allow TS convention of ignoring args
        // https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-0.html#flag-unused-declarations-with---nounusedparameters-and---nounusedlocals
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_' },
        ],

        // Soften eslint defaults so that callbacks don't need to be as verbose
        '@typescript-eslint/explicit-function-return-type': [
          'error',
          {
            allowExpressions: true,
            allowTypedFunctionExpressions: true,
          },
        ],
      },
    },
    {
      files: ['**/*.d.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
    {
      files: [
        'tests/**/*.ts',
        '**/*.spec.ts',
        '**/test/**/*.ts',
        'integration-tests/**/*.ts',
        'src/utils/testing/**/*.ts',
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
      },
    },
  ],
}
