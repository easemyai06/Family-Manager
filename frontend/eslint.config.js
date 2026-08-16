// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
    rules: {
      // Apostrophes/quotes inside <Text> render fine in React Native; this
      // rule is an HTML concern and produces false positives here.
      'react/no-unescaped-entities': 'off',
    },
  },
]);
