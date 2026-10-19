import { readableBody } from './body-text';

describe('readable body view', () => {
  it('preserves textual UTF-8, including whitespace and malformed JSON', () => {
    expect(readableBody(Buffer.from(' {bad json\n'), 'application/json')).toBe(' {bad json\n');
    expect(readableBody(Buffer.from('hello'), 'text/plain; charset=utf-8')).toBe('hello');
  });
  it('does not pretend binary, compressed, invalid UTF-8, or unknown encodings are text', () => {
    expect(readableBody(Buffer.from('hello'), 'application/octet-stream')).toBeNull();
    expect(readableBody(Buffer.from([255]), 'text/plain')).toBeNull();
    expect(readableBody(Buffer.from([0]), 'text/plain')).toBeNull();
    expect(readableBody(Buffer.from('hello'), 'application/json', 'gzip')).toBeNull();
    expect(readableBody(Buffer.from('hello'), 'text/plain; charset=iso-8859-1')).toBeNull();
  });
});
