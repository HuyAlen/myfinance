export function formatCompactVND(value: number) {
  const rounded = Math.round(Number.isFinite(value) ? value : 0);
  if (Math.abs(rounded) >= 1_000_000) {
    return `${Math.round(rounded / 1_000_000)}M`;
  }
  if (Math.abs(rounded) >= 1_000) {
    return `${Math.round(rounded / 1_000)}K`;
  }
  return `${rounded}`;
}
