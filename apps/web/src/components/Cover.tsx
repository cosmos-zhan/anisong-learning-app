import { useEffect, useState } from 'react';
import { cachedSongCover, songCover } from '../../../../packages/core/song-cover';

export function Cover({ id, title, small = false, download = false, fallback }: {
  id: string; title: string; small?: boolean; download?: boolean; fallback?: string;
}) {
  const [image, setImage] = useState<string | null>(() => cachedSongCover(id));
  useEffect(() => {
    let alive = true;
    setImage(cachedSongCover(id));
    void songCover(id).then(value => { if (alive) setImage(value); });
    return () => { alive = false; };
  }, [id]);
  const source = image ?? fallback;
  return <div className={download ? 'download-cover' : `art-cover ${small ? 'small' : ''}`} aria-hidden="true">
    {source ? <img src={source} alt="" referrerPolicy="no-referrer" loading={fallback ? 'eager' : 'lazy'} onError={() => setImage(null)} /> : download ? '♪' : <><i /><span>{title.slice(0, 1)}<br />{title.slice(1, 3)}</span><b>♪</b></>}
  </div>;
}
