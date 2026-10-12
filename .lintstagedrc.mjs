// See https://nextjs.org/docs/basic-features/eslint#lint-staged for details

import path from 'path';

const buildEslintCommand = (filenames) =>
  `eslint --fix ${filenames.map((f) => `"${path.relative(process.cwd(), f)}"`).join(' ')}`;
const prettier = 'prettier --write';

const config = {
  '**/*.{js,jsx,ts,tsx}': [buildEslintCommand, prettier],
  '**/*.{css,scss,json,html}': prettier,
};

export default config;
