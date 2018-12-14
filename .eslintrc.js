'use strict';

const os = require('os');

module.exports = {
  extends: ['airbnb-base', 'plugin:prettier/recommended'],

  parserOptions: {
    sourceType: 'script',
  },

  env: {
    node: true,
    es6: true,
    mocha: true,
  },

  rules: {
    // Prettier overrides
    'prettier/prettier': [
      'error',
      {
        singleQuote: true,
        trailingComma: 'es5',
        bracketSpacing: false,
        arrowParens: 'always',
      },
    ],

    // ESLint overrides
    'class-methods-use-this': 'off',
    'consistent-return': 'off',
    'linebreak-style': ['error', os.EOL === '\r\n' ? 'windows' : 'unix'],
    'object-shorthand': 'off',
    'one-var': 'off',
    'prefer-destructuring': 'off',
    'no-param-reassign': 'off',
    'no-prototype-builtins': 'off',
    'no-restricted-syntax': 'off',
    'no-underscore-dangle': 'off',
    'no-plusplus': 'off',
    strict: ['error', 'global'],
    'require-yield': 'off',
  },

  overrides: [
    {
      files: ['*.spec.js', '*.test.js'],
      rules: {
        'func-names': 0, // allow anonymous functions, useful with mocha
      },
    },
  ]
};
