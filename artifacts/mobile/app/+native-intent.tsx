/**
 * Map canonical HTTPS links to the in-app screen that handles them.
 *
 * /s/:token   → Private-share payload screen (existing).
 * /trails/:slug → Map tab with ?communityGuide=<slug> so the map screen can
 *                 resolve and focus the linked trail-guide dataset.
 *
 * The OS delivers the original path after Universal Links / App Links
 * verification; Expo Router's file route is intentionally named share/[token]
 * for the existing custom scheme links.
 */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    const url = new URL(path, "https://mapper.one");

    // Private-share deep link: /s/<token>
    if (url.pathname.startsWith("/s/")) {
      const encodedToken = url.pathname.slice("/s/".length).split("/")[0];
      if (encodedToken) {
        const token = decodeURIComponent(encodedToken);
        return `/share/${encodeURIComponent(token)}?mode=private`;
      }
    }

    // Trail-guide deep link: /trails/<slug>
    // Resolves to the map tab with a communityGuide param so the map can
    // look up (or import) the linked community dataset and focus it.
    if (url.pathname.startsWith("/trails/")) {
      const slug = url.pathname.slice("/trails/".length).split("/")[0];
      if (slug) {
        return `/?communityGuide=${encodeURIComponent(slug)}`;
      }
    }
  } catch {
    // Let Expo Router handle malformed or unrelated links normally.
  }

  return path;
}
