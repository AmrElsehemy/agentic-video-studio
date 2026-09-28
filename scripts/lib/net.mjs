// Network errors that say what failed and why. Node's fetch throws a bare
// "fetch failed" and hides the reason (DNS, TLS, proxy, timeout) in `cause`.

const HINTS = {
  ENOTFOUND: 'the host name could not be resolved: check your internet connection or DNS',
  EAI_AGAIN: 'DNS lookup timed out: check your internet connection or DNS',
  ECONNREFUSED: 'the connection was refused: a firewall or proxy may be blocking it',
  ECONNRESET: 'the connection was reset: a VPN, firewall or proxy may be interfering',
  ETIMEDOUT: 'the connection timed out: check your network, VPN or proxy',
  UND_ERR_CONNECT_TIMEOUT: 'the connection timed out: check your network, VPN or proxy',
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'a TLS certificate could not be verified; if a corporate proxy re-signs HTTPS traffic, point NODE_EXTRA_CA_CERTS at its CA certificate',
  SELF_SIGNED_CERT_IN_CHAIN: 'a TLS certificate could not be verified; if a corporate proxy re-signs HTTPS traffic, point NODE_EXTRA_CA_CERTS at its CA certificate',
  CERT_HAS_EXPIRED: 'a TLS certificate has expired (or your system clock is wrong)',
};

/** Walk an error's cause chain to the innermost error with a code or message. */
const rootCause = (error) => {
  let current = error;
  while (current?.cause && current.cause !== current) current = current.cause;
  return current;
};

/** The URL's origin for the message; never throws, so the real failure isn't masked by a bad URL. */
const hostOf = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return String(url);
  }
};

/** Explain a failed request: which service and URL, the underlying reason, and what to check. */
export const networkError = (label, url, error) => {
  const cause = rootCause(error);
  const code = cause?.code ?? cause?.errno;
  const reason = [code, cause?.message && cause.message !== error?.message ? cause.message : undefined].filter(Boolean).join(': ') || error?.message || String(error);
  const hint = HINTS[code] ?? (process.env.HTTPS_PROXY || process.env.https_proxy
    ? 'HTTPS_PROXY is set, but Node\'s fetch ignores it: run with NODE_USE_ENV_PROXY=1 (Node 24+) or unset it'
    : 'check your internet connection, VPN or proxy');
  const wrapped = new Error(`${label} request to ${hostOf(url)} failed (${reason}): ${hint}.`);
  wrapped.cause = error;
  return wrapped;
};

/** fetch that throws networkError instead of a bare "fetch failed". */
export const fetchWithReason = async (label, url, init, fetchImpl = fetch) => {
  try {
    return await fetchImpl(url, init);
  } catch (error) {
    throw networkError(label, url, error);
  }
};
