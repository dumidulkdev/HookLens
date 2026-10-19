import { loadConfig } from './config';

describe('configuration', () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env = {
      ...original,
      DATABASE_URL: 'postgresql://test:local@localhost:5432/test',
      PUBLIC_BASE_URL: 'http://localhost:3000',
      FRONTEND_ORIGIN: 'http://localhost:5173',
    };
  });
  afterAll(() => {
    process.env = original;
  });

  it('loads valid configuration', () => {
    expect(loadConfig()).toMatchObject({ port: 3000, captureRateLimit: 120 });
  });
  it('rejects missing database configuration', () => {
    delete process.env.DATABASE_URL;
    expect(loadConfig).toThrow('DATABASE_URL');
  });
  it('rejects origins with credentials or paths', () => {
    process.env.FRONTEND_ORIGIN = 'http://localhost:5173/path';
    expect(loadConfig).toThrow('FRONTEND_ORIGIN');
  });
  it('rejects invalid numeric limits', () => {
    process.env.CAPTURE_RATE_LIMIT = '0';
    expect(loadConfig).toThrow('CAPTURE_RATE_LIMIT');
  });
});
