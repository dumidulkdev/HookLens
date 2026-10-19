const { config } = require('dotenv');
const { resolve } = require('node:path');
const { execFileSync } = require('node:child_process');

config({ path: resolve(__dirname, '../../../.env'), quiet: true });
const testUrl = process.env.TEST_DATABASE_URL;
if (
  !testUrl ||
  !new URL(testUrl).pathname.endsWith('_test') ||
  testUrl === process.env.DATABASE_URL
) {
  console.error(
    'Set TEST_DATABASE_URL to a separate PostgreSQL database whose name ends in _test.',
  );
  process.exit(1);
}
process.env.DATABASE_URL = testUrl;
process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
process.env.FRONTEND_ORIGIN ??= 'http://localhost:5173';
process.env.CREATE_RATE_LIMIT = '1000';
process.env.CAPTURE_RATE_LIMIT = '1000';
try {
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: process.env,
  });
  execFileSync(
    process.execPath,
    [
      '--experimental-vm-modules',
      require.resolve('jest/bin/jest'),
      '--config',
      'jest.e2e.config.cjs',
      '--runInBand',
    ],
    { stdio: 'inherit', env: process.env },
  );
} catch {
  process.exitCode = 1;
}
