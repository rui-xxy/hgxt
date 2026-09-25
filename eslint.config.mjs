// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'apps/api/src/generated/**', // Prisma 生成的客户端
      'apps/admin/.vite/**',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/admin/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ['apps/api/**/*.ts', 'packages/shared/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    rules: {
      // 常见且高信噪比的规则；其余保持 recommended 默认，避免 lint 变成噪音源
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // CLI 脚本（seed）与测试本身就是靠 console 输出结果的（放最后以覆盖通用规则）
    files: ['apps/api/prisma/**/*.ts', '**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
