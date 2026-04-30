const RAW_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
export const API_BASE = RAW_BASE.replace(/\/$/, '');

export function apiUrl(path) {
  if (!path.startsWith('/')) path = `/${path}`;
  return `${API_BASE}${path}`;
}
