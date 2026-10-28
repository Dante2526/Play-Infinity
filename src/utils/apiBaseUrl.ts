/** Native API requests must never inherit a developer's Vite proxy address. */
export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  const native = (window as any).Capacitor?.isNativePlatform?.() || window.location.protocol === 'capacitor:';
  return native ? 'https://play-infinity.stream' : '';
}
