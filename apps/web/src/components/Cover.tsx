import { useEffect, useState } from 'react';
import { cachedSongCover, songCover } from '../../../../packages/core/song-cover';
import { HARUHIKAGE } from '../../../../packages/core/presets';
import { Icon } from './Icon';
import recordArtwork from '../lyrics/record-artwork.webp';

export function Cover({ id, small = false, download = false, fallback, piano = false }: {
  id: string; small?: boolean; download?: boolean; fallback?: string; piano?: boolean;
}) {
  const [image, setImage] = useState<string | null>(() => cachedSongCover(id));
  const [failedFallback, setFailedFallback] = useState<string>();
  useEffect(() => {
    let alive = true;
    setImage(cachedSongCover(id));
    void songCover(id).then(value => { if (alive) setImage(value); });
    return () => { alive = false; };
  }, [id]);
  const bundled = fallback ?? (id === HARUHIKAGE.id ? recordArtwork : undefined);
  const source = image ?? (bundled === failedFallback ? undefined : bundled);
  return <div className={`${download ? 'download-cover' : `art-cover ${small ? 'small' : ''}`} ${piano ? 'cover-piano' : ''}`} aria-hidden="true">
    {source ? <img src={source} alt="" referrerPolicy="no-referrer" loading={small || download ? 'lazy' : 'eager'} onError={() => { if (image) setImage(null); else setFailedFallback(source); }} /> : <Icon name={piano ? 'piano' : 'note'} />}
  </div>;
}
