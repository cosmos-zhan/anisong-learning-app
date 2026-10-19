/** Keep staff lines readable. Overflow is scrollable instead of crushing pitches. */
export function fitScore(
  width: number,
  height: number,
  availableWidth: number,
  availableHeight: number,
) {
  const scale = Math.max(
    0.75,
    Math.min(Math.max(1, availableWidth) / Math.max(1, width),
      Math.max(1, availableHeight) / Math.max(1, height), 1.5),
  );
  return { scale, width: width * scale, height: height * scale };
}
/** A short landscape must not silently replace the requested four-bar page. */
export function scorePageSize(_width: number, _height: number) {
  return 4;
}

export function pianoKeyHeight(height: number) {
  return Math.round(Math.max(112, Math.min(200, height * 0.32)));
}
