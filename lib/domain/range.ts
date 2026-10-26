export type ByteRange = { start: number; end: number; partial: boolean };

export function parseByteRange(range: string | null | undefined, total: number): ByteRange | null {
  if (!range) return total > 0 ? { start: 0, end: total - 1, partial: false } : null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2]) || total < 1) return null;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(0, total - suffixLength), end: total - 1, partial: true };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : total - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= total || requestedEnd < start) return null;
  return { start, end: Math.min(requestedEnd, total - 1), partial: true };
}
