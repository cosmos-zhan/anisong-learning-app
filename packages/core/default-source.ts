import { parseCatalog } from './downloads';
import metadata from './haruhikage-catalog.json';

export const PRIVATE_SOURCE = 'https://anisong-media-source.woolly-mochi-2205.chatgpt.site/catalog.json';
export const PREVIOUS_DEMO_SOURCE = 'https://raw.githubusercontent.com/cosmos-zhan/anisong-learning-app/4dba5c242d602e7a408b9208b4d76ed147f866f0/public/demo/catalog.json';
// Public metadata only. The recordings and the access code remain on the private service.
export const defaultCatalog = () => parseCatalog(metadata, PRIVATE_SOURCE);
export const isDefaultSource = (address: string) => address === PRIVATE_SOURCE;
export function preferredSource(bundled?: string | null): string {
  const fallback = bundled ? new URL(bundled, location.href).href : PRIVATE_SOURCE;
  try {
    const previous = localStorage.getItem('anisong:mediaSource');
    return !previous || previous === PREVIOUS_DEMO_SOURCE ? fallback : previous;
  } catch { return fallback; }
}
