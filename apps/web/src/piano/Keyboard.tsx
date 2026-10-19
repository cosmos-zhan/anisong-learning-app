import { useEffect, useRef, useState } from "react";
const WHITE = [0, 2, 4, 5, 7, 9, 11];
const names = [
  "C",
  "C♯/D♭",
  "D",
  "D♯/E♭",
  "E",
  "F",
  "F♯/G♭",
  "G",
  "G♯/A♭",
  "A",
  "A♯/B♭",
  "B",
];
export function Keyboard({
  labels = "name",
  start = 60,
  octaves = 2,
  target,
  enabled,
  resetKey,
  onDown,
  onUp,
}: {
  labels?: "name" | "solfege" | "none";
  start?: number;
  octaves?: number;
  target?: number;
  enabled: boolean;
  resetKey?: unknown;
  onDown: (id: string, midi: number) => void;
  onUp: (id: string) => void;
}) {
  const pointers = useRef(new Map<number, { midi: number; id: string }>()),
    serial = useRef(0);
  const [pressed, setPressed] = useState<number[]>([]);
  const upRef = useRef(onUp);
  upRef.current = onUp;
  const release = (pointer: number) => {
    const note = pointers.current.get(pointer);
    if (!note) return;
    pointers.current.delete(pointer);
    upRef.current(note.id);
    setPressed(Array.from(pointers.current.values(), (n) => n.midi));
  };
  useEffect(() => {
    const all = () => {
      for (const note of pointers.current.values()) upRef.current(note.id);
      pointers.current.clear();
      setPressed([]);
    };
    const up = (event: PointerEvent) => release(event.pointerId);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", all);
    const hidden = () => {
      if (document.hidden) all();
    };
    document.addEventListener("visibilitychange", hidden);
    all();
    return () => {
      all();
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", all);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [start, octaves, enabled, resetKey]);
  const notes = Array.from(
    { length: octaves * 12 + 1 },
    (_, i) => start + i,
  ).filter((n) => n <= 127);
  let whites = 0;
  const keys = notes.map((midi) => {
    const white = WHITE.includes(midi % 12);
    const position = white ? whites++ : whites - 0.31;
    return { midi, white, position };
  });
  return (
    <div
      className="piano-keys"
      aria-label="虚拟钢琴（先启用声音，按住发声，松开释放）"
      style={{ touchAction: "none" }}
    >
      {keys.map(({ midi, white, position }) => (
        <button
          key={midi}
          type="button"
          aria-label={`琴键 ${names[midi % 12]}${Math.floor(midi / 12) - 1}`}
          aria-pressed={pressed.includes(midi)}
          disabled={!enabled}
          className={`piano-key ${white ? "white" : "black"} ${pressed.includes(midi) ? "pressed" : ""} ${midi === target ? "target" : ""}`}
          style={{
            left: `${(position / whites) * 100}%`,
            width: `${((white ? 1 : 0.62) / whites) * 100}%`,
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            if (event.pointerType === "mouse" && event.button !== 0) return;
            release(event.pointerId);
            const id = `${event.pointerId}:${++serial.current}`;
            pointers.current.set(event.pointerId, { midi, id });
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              /* pointer capture unsupported; window release is the fallback */
            }
            setPressed(Array.from(pointers.current.values(), (n) => n.midi));
            onDown(id, midi);
          }}
          onPointerUp={(e) => release(e.pointerId)}
          onPointerCancel={(e) => release(e.pointerId)}
          onLostPointerCapture={(e) => release(e.pointerId)}
          onKeyDown={(e) => {
            if ((e.key === " " || e.key === "Enter") && !e.repeat) {
              e.preventDefault();
              const pointer = -midi;
              release(pointer);
              const id = `kbd:${midi}:${++serial.current}`;
              pointers.current.set(pointer, { midi, id });
              setPressed(Array.from(pointers.current.values(), (n) => n.midi));
              onDown(id, midi);
            }
          }}
          onKeyUp={(e) => {
            if (e.key === " " || e.key === "Enter") release(-midi);
          }}
          onBlur={() => release(-midi)}
        >
          <span>
            {labels === "none"
              ? ""
              : labels === "solfege"
                ? [
                    "Do",
                    "Di",
                    "Re",
                    "Ri",
                    "Mi",
                    "Fa",
                    "Fi",
                    "Sol",
                    "Si",
                    "La",
                    "Li",
                    "Ti",
                  ][midi % 12]
                : `${names[midi % 12].split("/")[0]}${Math.floor(midi / 12) - 1}`}
          </span>
        </button>
      ))}
    </div>
  );
}
