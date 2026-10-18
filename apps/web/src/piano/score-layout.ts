/** Uniform scaling is shared by notation and hit targets; never stretch pitches. */
export function fitScore(
  width: number,
  height: number,
  availableWidth: number,
  availableHeight: number,
) {
  const scale = Math.min(
    Math.max(1, availableWidth) / Math.max(1, width),
    Math.max(1, availableHeight) / Math.max(1, height),
    1.6,
  );
  return { scale, width: width * scale, height: height * scale };
}

export function scorePageSize(width: number, height: number) {
  return width < 560 || height < 84 ? 2 : 4;
}
