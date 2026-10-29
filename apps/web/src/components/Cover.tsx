import { useEffect, useState } from 'react';
import { cachedSongCover, songCover } from '../../../../packages/core/song-cover';

export function Cover({ id, title, small = false, download = false }: { id: string; title: string; small?: boolean; download?: boolean }) {
  const [image, setImage] = useState<string | null>(() => cachedSongCover(id));
  useEffect(() => {
    let alive = true;
    setImage(cachedSongCover(id));
    void songCover(id).then(value => { if (alive) setImage(value); });
    return () => { alive = false; };
  }, [id]);
  return <div className={download ? 'download-cover' : `art-cover ${small ? 'small' : ''}`} aria-hidden="true">
    {image ? <img src={image} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setImage(null)} /> : download ? '♪' : <><i /><span>{title.slice(0, 1)}<br />{title.slice(1, 3)}</span><b>♪</b></>}
  </div>;
}
