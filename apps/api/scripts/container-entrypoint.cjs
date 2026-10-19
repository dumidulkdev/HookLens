const { spawn } = require('node:child_process');
const { URL } = require('node:url');
const { createInterface } = require('node:readline');

function fail(message) {
  process.stderr.write(`[DB] [ERROR] ${message}\n`);
  process.exit(1);
}

function databaseUrl() {
  const { DB_HOST = 'postgres', POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB } = process.env;
  if (!POSTGRES_USER || !POSTGRES_PASSWORD || !POSTGRES_DB) {
    fail(
      'database settings are incomplete; set POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB.',
    );
  }

  const url = new URL('postgresql://localhost');
  url.hostname = DB_HOST;
  url.port = '5432';
  url.username = POSTGRES_USER;
  url.password = POSTGRES_PASSWORD;
  url.pathname = `/${POSTGRES_DB}`;
  url.searchParams.set('schema', 'public');
  return url.toString();
}

function safeLog(line) {
  let message = line.replace(/postgres(?:ql)?:\/\/[^\s@/]+@/gi, 'postgresql://[redacted]@');
  const password = process.env.POSTGRES_PASSWORD;
  if (password) {
    message = message.replaceAll(password, '[redacted]');
    const encoded = new URL('postgresql://localhost');
    encoded.password = password;
    if (encoded.password !== password) message = message.replaceAll(encoded.password, '[redacted]');
  }
  return message;
}

const mode = process.argv[2];
const environment = { ...process.env, DATABASE_URL: databaseUrl() };
let command;
let args;

if (mode === 'migrate') {
  process.stdout.write('[DB] [READY] PostgreSQL is ready; applying migrations.\n');
  command = 'npm';
  args = ['run', 'db:deploy', '--workspace', '@hooklens/api'];
} else if (mode === 'api') {
  command = 'node';
  args = ['apps/api/dist/main.js'];
} else {
  fail('unknown container entrypoint mode.');
}

const child = spawn(command, args, {
  cwd: '/app',
  env: environment,
  stdio: ['inherit', 'pipe', 'pipe'],
});
for (const [stream, destination] of [
  [child.stdout, process.stdout],
  [child.stderr, process.stderr],
]) {
  createInterface({ input: stream }).on('line', (line) => destination.write(`${safeLog(line)}\n`));
}
child.on('error', (error) => {
  process.stderr.write(`[DB] [ERROR] Could not start ${mode}: ${error.name}.\n`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  if (mode === 'migrate' && code === 0) {
    process.stdout.write('[DB] [READY] Migrations applied.\n');
  } else if (mode === 'migrate') {
    process.stderr.write(
      `[DB] [ERROR] Migration job stopped${signal ? ` by ${signal}` : ` with exit code ${code}`}.\n`,
    );
  }
  process.exitCode = signal ? (signal === 'SIGINT' ? 130 : 143) : (code ?? 1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
