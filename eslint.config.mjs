import nextVitals from 'eslint-config-next/core-web-vitals'

const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'public/vendor/**', '.codex-tmp/**', '.playwright-cli/**', 'scratch/**', 'output/**', '.zwork/**', '.agents/**', '.agent/**', 'skills/**'],
  },
  ...nextVitals,
  {
    rules: {
      'import/no-anonymous-default-export': 'off',
      'react/no-unescaped-entities': 'off',
    },
  },
]

export default config
