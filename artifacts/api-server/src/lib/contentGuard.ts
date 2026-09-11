// Anonymous, no-login community content is a prime spam target. We reject any
// content that looks like it carries a link so the feedback board can't be used
// to seed SEO spam or phishing. This is deliberately strict: a few false
// positives (e.g. "see www") are an acceptable tradeoff for a public, unauthed
// board.

const URL_PATTERNS: RegExp[] = [
  // Explicit schemes: http://, https://, ftp://, mailto:, etc.
  /\b[a-z][a-z0-9+.-]*:\/\//i,
  /\bmailto:/i,
  // www.something
  /\bwww\.[a-z0-9-]+/i,
  // Markdown link / image syntax: [text](...) or ![alt](...)
  /\]\s*\([^)]*\)/,
  // Any bare domain followed by a slash/path — strongly link-shaped.
  /\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.[a-z]{2,}\/[^\s]*/i,
  // Bare domains with a recognized TLD. Deliberately broad: an unauthed,
  // anonymous board is a spam magnet, so we err toward rejecting anything
  // that looks like a hostname over letting links through.
  /\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:com|net|org|io|co|app|dev|gg|me|info|biz|xyz|online|site|shop|store|link|ly|to|gl|sh|ai|ad|page|tech|cloud|email|club|live|tv|cc|fm|news|blog|pro|us|uk|ca|au|nz|de|fr|es|it|nl|se|no|fi|dk|pl|ru|cn|jp|kr|in|br|mx|za|ch|at|be|ie|pt|cz|gr|ro|hu|edu|gov|mil|int|eu|asia|co\.uk|com\.au|co\.nz)\b/i,
];

export function containsUrl(...values: (string | null | undefined)[]): boolean {
  for (const value of values) {
    if (!value) continue;
    for (const pattern of URL_PATTERNS) {
      if (pattern.test(value)) return true;
    }
  }
  return false;
}
