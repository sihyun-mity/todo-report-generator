// See https://nextjs.org/docs/basic-features/eslint#lint-staged for details

// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

const buildEslintCommand = (filenames) =>
  `eslint --fix ${filenames.map((f) => `"${path.relative(process.cwd(), f)}"`).join(' ')}`;
const prettier = 'prettier --write';

module.exports = {
  '**/*.{js,jsx,ts,tsx}': [buildEslintCommand, prettier],
  '**/*.{css,scss,json,html}': prettier,
};
