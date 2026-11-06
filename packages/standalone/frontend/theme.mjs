// The theme is initialized by a local external module, respecting the management-page CSP that forbids inline scripts.
let saved
try { saved = localStorage.getItem('ofm-theme') } catch {
  // When storage is unavailable, the page can still be shown according to the system preference.
}
document.documentElement.dataset.theme = saved === 'dark' || saved === 'light'
  ? saved : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
