export function Icon({
  name,
}: {
  name: "back" | "play" | "pause" | "restart" | "more" | "settings";
}) {
  const paths = {
    back: "m14 5-7 7 7 7",
    play: "m9 5 11 7-11 7Z",
    pause: "M8 5v14M16 5v14",
    restart: "M4 10a8 8 0 1 1 1 8M4 4v6h6",
    more: "M5 12h.01M12 12h.01M19 12h.01",
    settings: "M4 7h16M4 17h16M8 4v6M16 14v6",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      fill={name === "play" ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
