import { useEffect, useRef, useState } from "react";
import { HARUHIKAGE_REFERENCE as reference } from "../../../../packages/core/presets";

/** Standard, user-opened publisher embed; never extracts or caches the recording. */
export function OfficialReference({
  active,
  onOpen,
}: {
  active: boolean;
  onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null),
    close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!active) setOpen(false);
  }, [active]);
  useEffect(() => {
    if (!open) return;
    const hidden = () => {
      if (document.hidden) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    close.current?.focus();
    document.addEventListener("visibilitychange", hidden);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      document.removeEventListener("keydown", key);
      trigger.current?.focus();
    };
  }, [open]);
  return (
    <>
      <button
        ref={trigger}
        onClick={() => {
          onOpen();
          setOpen(true);
        }}
      >
        官方试听（片段）
      </button>
      {open && active && (
        <div className="modal-backdrop">
          <section
            className="reference-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reference-title"
          >
            <div className="reference-heading">
              <strong id="reference-title">春日影 · {reference.label}</strong>
              <button
                ref={close}
                aria-label="关闭官方试听"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
            <iframe
              title="春日影 CRYCHIC 官方试听"
              src={`https://www.youtube-nocookie.com/embed/${reference.videoId}?playsinline=1&rel=0`}
              allow="encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
            <p>
              片段由 YouTube 播放，需联网；地区或嵌入限制时可
              <a href={reference.watchUrl} target="_blank" rel="noreferrer">
                打开官方视频 ↗
              </a>
              。此处用于参考试听，逐小节练习需导入 MusicXML/MXL。
            </p>
          </section>
        </div>
      )}
    </>
  );
}
