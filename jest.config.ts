import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/tests/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  collectCoverageFrom: [
    'app/api/reserve/**/*.ts',
    'app/services/kubernetes-reserve.ts',
    'lib/validators/reserve.ts',
  ],
  coverageThreshold: {
    global: {
      lines: 80,
      branches: 80,
    },
  },
};

export default config;