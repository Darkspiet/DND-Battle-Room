type AxisGrid = { spacing: number; origin: number; coverage: number };

function modulo(value: number, period: number) {
  return ((value % period) + period) % period;
}

/** Find repeated dark lines, rejecting patterns that cover too little of an axis. */
function detectAxis(signal: number[]): AxisGrid[] {
  const scores = signal.map((value, index) =>
    index < 3 || index >= signal.length - 3 ? 0 : Math.max(0, (signal[index - 3] + signal[index + 3]) / 2 - value)
  );
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const deviation = Math.sqrt(scores.reduce((sum, value) => sum + (value - mean) ** 2, 0) / scores.length);
  const threshold = Math.max(1, mean + deviation * 0.75);
  const peaks: Array<{ position: number; weight: number }> = [];
  for (let index = 3; index < scores.length - 3; index++) {
    if (scores[index] < threshold || scores[index] < Math.max(...scores.slice(index - 2, index + 3))) continue;
    if (peaks.length && index - peaks[peaks.length - 1].position < 4) continue;
    const weights = scores.slice(index - 1, index + 2);
    const weight = weights.reduce((sum, value) => sum + value, 0);
    peaks.push({ position: index + (weights[2] - weights[0]) / weight, weight: scores[index] });
  }
  if (peaks.length < 10) return [];
  const candidates = new Map<number, number[]>();
  for (let first = 0; first < peaks.length; first++) {
    for (let second = first + 1; second < Math.min(peaks.length, first + 9); second++) {
      const distance = peaks[second].position - peaks[first].position;
      if (distance < Math.max(8, signal.length / 200) || distance > Math.min(1000, signal.length / 9)) continue;
      const bucket = Math.round(distance);
      candidates.set(bucket, [...(candidates.get(bucket) ?? []), distance]);
    }
  }
  const grids: AxisGrid[] = [];
  const ranked = [...candidates].sort((a, b) => b[1].length - a[1].length).slice(0, 32);
  for (const [, distances] of ranked) {
    let spacing = distances.reduce((sum, value) => sum + value, 0) / distances.length;
    const phaseScores = new Array<number>(Math.ceil(spacing)).fill(0);
    for (const peak of peaks) phaseScores[Math.floor(modulo(peak.position, spacing))] += peak.weight;
    let origin = 0;
    let strongest = -1;
    for (let phase = 0; phase < phaseScores.length; phase++) {
      const strength = [-2, -1, 0, 1, 2].reduce(
        (sum, offset) => sum + phaseScores[modulo(phase + offset, phaseScores.length)],
        0
      );
      if (strength > strongest) {
        strongest = strength;
        origin = phase + 0.5;
      }
    }
    const phaseIndex = Math.floor(origin);
    const localWeight = [-2, -1, 0, 1, 2].reduce(
      (sum, offset) => sum + phaseScores[modulo(phaseIndex + offset, phaseScores.length)],
      0
    );
    origin +=
      [-2, -1, 0, 1, 2].reduce(
        (sum, offset) => sum + offset * phaseScores[modulo(phaseIndex + offset, phaseScores.length)],
        0
      ) / localWeight;
    let aligned = new Map<number, { position: number; weight: number }>();
    for (let iteration = 0; iteration < 3; iteration++) {
      aligned = new Map();
      const tolerance = Math.max(1.5, spacing * 0.025);
      for (const peak of peaks) {
        const index = Math.round((peak.position - origin) / spacing);
        if (Math.abs(peak.position - (origin + index * spacing)) > tolerance) continue;
        if (!aligned.has(index) || aligned.get(index)!.weight < peak.weight) aligned.set(index, peak);
      }
      if (aligned.size < 10) break;
      const entries = [...aligned];
      const meanIndex = entries.reduce((sum, [index]) => sum + index, 0) / entries.length;
      const meanPosition = entries.reduce((sum, [, peak]) => sum + peak.position, 0) / entries.length;
      const denominator = entries.reduce((sum, [index]) => sum + (index - meanIndex) ** 2, 0);
      spacing =
        entries.reduce((sum, [index, peak]) => sum + (index - meanIndex) * (peak.position - meanPosition), 0) /
        denominator;
      origin = meanPosition - spacing * meanIndex;
    }
    const expected = signal.length / spacing;
    const coverage = aligned.size / expected;
    const positions = [...aligned.values()].map((peak) => peak.position);
    if (aligned.size < 10 || coverage < 0.85 || Math.max(...positions) - Math.min(...positions) < signal.length * 0.65)
      continue;
    origin = modulo(origin, spacing);
    if (Math.min(origin, spacing - origin) < Math.min(2, spacing * 0.03)) origin = 0;
    grids.push({ spacing, origin, coverage: Math.min(1, coverage) });
  }
  return grids;
}

export function detectGridFromProjections(vertical: number[], horizontal: number[]) {
  if (vertical.length < 80 || horizontal.length < 80) return null;
  const horizontalGrids = detectAxis(horizontal);
  const pairs = detectAxis(vertical).flatMap((x) =>
    horizontalGrids
      .filter((y) => Math.abs(x.spacing - y.spacing) / Math.max(x.spacing, y.spacing) < 0.025)
      .map((y) => ({ x, y, spacing: (x.spacing + y.spacing) / 2 }))
  );
  pairs.sort((a, b) => a.spacing - b.spacing);
  const best = pairs[0];
  if (!best) return null;
  const extent = (length: number, origin: number) =>
    Math.max(4, Math.min(200, Math.ceil((length - origin) / best.spacing - 0.03)));
  return {
    originX: best.x.origin,
    originY: best.y.origin,
    pixelsPerCell: best.spacing,
    columns: extent(vertical.length, best.x.origin),
    rows: extent(horizontal.length, best.y.origin)
  };
}

export function detectPrintedGrid(image: { width: number; height: number; data: Uint8ClampedArray }) {
  const { width, height, data } = image;
  const vertical = new Array<number>(width).fill(0);
  const horizontal = new Array<number>(height).fill(0);
  let rows = 0;
  let columns = 0;
  const brightness = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    const alpha = data[offset + 3] / 255;
    return (data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722) * alpha + 255 * (1 - alpha);
  };
  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 256))) {
    rows++;
    for (let x = 0; x < width; x++) vertical[x] += brightness(x, y);
  }
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 256))) {
    columns++;
    for (let y = 0; y < height; y++) horizontal[y] += brightness(x, y);
  }
  return detectGridFromProjections(
    vertical.map((value) => value / rows),
    horizontal.map((value) => value / columns)
  );
}
