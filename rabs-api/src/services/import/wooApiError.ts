export const WOO_PERMISSION_HINT =
  'WooCommerce key needs Read/Write permission — regenerate in WooCommerce > Settings > Advanced > REST API';

/** Build a WooCommerce REST error, replacing permission failures with an actionable message. */
export function wooApiError(label: string, status: number, body: string, maxLen = 300): Error {
  let code = '';
  try {
    code = String((JSON.parse(body) as { code?: unknown }).code ?? '');
  } catch {
    /* non-JSON body */
  }
  const permissionDenied =
    (status === 401 || status === 403) &&
    (/^woocommerce_rest_cannot_/.test(code) || code === 'woocommerce_rest_authentication_error' || code === 'rest_forbidden');
  if (permissionDenied) {
    return new Error(`${WOO_PERMISSION_HINT} (store returned ${status} ${code}).`);
  }
  return new Error(`${label} (${status}): ${body.slice(0, maxLen)}`);
}
