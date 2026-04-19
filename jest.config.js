/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
  modulePathIgnorePatterns: ['<rootDir>/android/', '<rootDir>/ios/'],
};
