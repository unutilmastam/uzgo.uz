/** Public rating summary from the denormalized product aggregates. */
export function ratingOf(sum: number, count: number): { average: number; count: number } | null {
  if (count <= 0) return null;
  const average = Math.min(5, Math.max(1, Math.round((sum / count) * 10) / 10));
  return { average, count };
}
