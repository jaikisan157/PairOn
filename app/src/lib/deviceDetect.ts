/**
 * Detect mobile/tablet devices via User-Agent string.
 * This uses the actual device type, NOT screen size,
 * so resizing a laptop browser window won't trigger a false positive.
 */
export function isMobileOrTablet(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || navigator.vendor || (window as any).opera || '';
    // Matches phones and tablets by common UA strings
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua);
}
