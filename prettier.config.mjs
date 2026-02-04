/**
 * @see https://prettier.io/docs/configuration
 * @type {import('prettier').Config & import('prettier-plugin-tailwindcss').PluginOptions}
 */
const config = {
  trailingComma: 'es5',
  tabWidth: 2,
  useTabs: false,
  singleQuote: true,
  printWidth: 120,
  endOfLine: 'lf',
  semi: true,
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindStylesheet: './src/styles/globals.css',
  tailwindFunctions: ['cn', 'clsx', 'tw', 'twMerge'],
};

export default config;
