import { parseCatalog } from './downloads';
import metadata from './haruhikage-catalog.json';

export const DEFAULT_SOURCE = 'https://anisong-media-source.woolly-mochi-2205.chatgpt.site/catalog.json';
export const PREVIOUS_DEMO_SOURCE = 'https://raw.githubusercontent.com/cosmos-zhan/anisong-learning-app/4dba5c242d602e7a408b9208b4d76ed147f866f0/public/demo/catalog.json';
// Only public catalog metadata is bundled. Audio, lyrics and score bytes are downloaded.
export const defaultCatalog = () => parseCatalog(metadata, DEFAULT_SOURCE);
export const isDefaultSource = (address: string) => address === DEFAULT_SOURCE;
export function preferredSource(bundled?: string | null): string {
  const fallback = bundled ? new URL(bundled, location.href).href : DEFAULT_SOURCE;
  try {
    const previous = localStorage.getItem('anisong:mediaSource');
    const localDemo = new URL('demo/catalog.json', location.href).href;
    return !previous || previous === PREVIOUS_DEMO_SOURCE || previous === localDemo ? fallback : previous;
  } catch { return fallback; }
}
