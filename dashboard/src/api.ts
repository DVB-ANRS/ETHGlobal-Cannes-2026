// Central API base URL — uses VITE_API_URL in production, empty string in dev (Vite proxy handles it)
export const API_BASE = import.meta.env.VITE_API_URL ?? ''
