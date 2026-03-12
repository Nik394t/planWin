const baseUrl = import.meta.env.BASE_URL;

export function assetUrl(path: string): string {
  return `${baseUrl}${path.replace(/^\/+/, '')}`;
}

export function appTabUrl(tab: string): string {
  return `${baseUrl}?tab=${encodeURIComponent(tab)}`;
}
