// The serve-sim address the "Open in serve-sim" button opens. Stored per
// OpenChamber instance, never shipped: it names a machine in the user's own
// network.

/** Instance storage key. */
export const DIRECT_URL_KEY = 'serveSimUrl';

/**
 * A plain http(s) address without credentials, query or fragment, trailing
 * slashes removed; `null` for anything else.
 */
export const normalizeDirectUrl = (input: unknown): string | null => {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname || url.username || url.password || url.search || url.hash) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
};
