export function Icon({
  name,
}: {
  name:
    | "back"
    | "play"
    | "pause"
    | "restart"
    | "more"
    | "settings"
    | "previous"
    | "next"
    | "languages"
    | "follow"
    | "repeat"
    | "segment"
    | "home"
    | "library"
    | "note"
    | "piano"
    | "download"
    | "plus"
    | "search"
    | "file"
    | "right"
    | "close"
    | "sparkle";
}) {
  const paths = {
    back: "m14 5-7 7 7 7",
    play: "m9 5 11 7-11 7Z",
    pause: "M8 5v14M16 5v14",
    restart: "M4 10a8 8 0 1 1 1 8M4 4v6h6",
    more: "M5 12h.01M12 12h.01M19 12h.01",
    settings: "M4 7h16M4 17h16M8 4v6M16 14v6",
    previous: "M6 5v14M18 5 8 12l10 7Z",
    languages: "M3 5h12M9 3v2M5 5c0 5 6 9 9 9M13 5c0 5-6 9-10 9M14 21l4-10 4 10M16 17h4",
    follow: "M3 5h12M3 10h9M3 15h6M18 7v10a3 3 0 1 1-3-3h3",
    next: "M18 5v14M6 5l10 7-10 7Z",
    repeat: "m17 3 4 4-4 4M21 7H7a4 4 0 0 0-4 4m4 10-4-4 4-4m-4 4h14a4 4 0 0 0 4-4",
    segment: "M8 5H4v14h4m8-14h4v14h-4M8 9h8m-8 3h8m-8 3h8",
    home: "m3 10 9-7 9 7v10h-6v-6H9v6H3z",
    library: "M4 4h4v16H4zM10 4h4v16h-4zM16 5l3-1 4 15-3 1z",
    note: "M9 18V5l11-2v13M9 9l11-2M9 18c0 3-6 4-6 1s6-4 6-1zm11-2c0 3-6 4-6 1s6-4 6-1z",
    piano: "M3 5h18v14H3zM7 5v8m5-8v9m5-9v8",
    download: "M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4",
    plus: "M12 5v14M5 12h14",
    search: "M20 20l-4-4m1-5a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z",
    file: "M6 3h8l4 4v14H6zM14 3v5h4m-9 5h6m-6 4h6",
    right: "m10 5 7 7-7 7",
    close: "m6 6 12 12M18 6 6 18",
    sparkle: "m11 3 2.5 6.5L20 12l-6.5 2.5L11 21l-2.5-6.5L2 12l6.5-2.5L11 3Zm9 0v4m-2-2h4",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      fill={
        ["play", "previous", "next"].includes(name) ? "currentColor" : "none"
      }
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
