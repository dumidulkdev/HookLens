/** A readable view is supplementary; Base64 is always the source of truth. */
export function readableBody(
  body: Uint8Array,
  contentType: string | null,
  contentEncoding?: string,
): string | null {
  if (contentEncoding && contentEncoding.toLowerCase() !== 'identity') return null;
  const mime = contentType?.toLowerCase() ?? '';
  const charset = /charset\s*=\s*"?([^;"\s]+)/.exec(mime)?.[1];
  if (charset && !['utf-8', 'utf8', 'us-ascii'].includes(charset)) return null;
  if (
    !/^(text\/|application\/(json|[^;]+\+json|xml|[^;]+\+xml|x-www-form-urlencoded|javascript)(;|$))/.test(
      mime,
    )
  )
    return null;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(body);
    // eslint-disable-next-line no-control-regex
    return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text) ? null : text;
  } catch {
    return null;
  }
}
