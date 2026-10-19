const { execFileSync } = require('node:child_process');

execFileSync(
  process.execPath,
  [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.build.json'],
  {
    stdio: 'inherit',
  },
);
require('./dist/main.js');
