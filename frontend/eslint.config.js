import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Design system: no black weights or sub-11px text (docs/ui-redesign-plan.md, type scale). Warn while old screens migrate.
      'no-restricted-syntax': ['warn',
        { selector: 'Literal[value=/font-black|text-.(8|9|10)px/]', message: 'Use the type scale: no font-black, no text below 11px (Eyebrow for small labels).' },
        { selector: 'TemplateElement[value.raw=/font-black|text-.(8|9|10)px/]', message: 'Use the type scale: no font-black, no text below 11px (Eyebrow for small labels).' },
      ],
    },
  },
])
