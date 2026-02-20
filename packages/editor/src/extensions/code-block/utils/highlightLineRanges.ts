const clampPositiveInt = (value: number): number => {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
};

export const normalizeLineRange = (
  start: number,
  end: number,
): [number, number] => {
  const safeStart = clampPositiveInt(start);
  const safeEnd = clampPositiveInt(end);
  return safeStart <= safeEnd ? [safeStart, safeEnd] : [safeEnd, safeStart];
};

const normalizeLine = (line: number, totalLines?: number): number | null => {
  const normalized = clampPositiveInt(line);
  if (typeof totalLines !== "number") {
    return normalized;
  }
  if (totalLines < 1 || normalized > totalLines) {
    return null;
  }
  return normalized;
};

export const parseHighlightLinesToSet = (
  highlightLines?: string,
  totalLines?: number,
): Set<number> => {
  const result = new Set<number>();
  if (!highlightLines?.trim()) {
    return result;
  }

  for (const part of highlightLines.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (trimmed.includes("-")) {
      const [rawStart, rawEnd] = trimmed.split("-").map((n) => Number(n));
      if (Number.isNaN(rawStart) || Number.isNaN(rawEnd)) {
        continue;
      }
      const [start, end] = normalizeLineRange(rawStart, rawEnd);
      for (let line = start; line <= end; line += 1) {
        const normalized = normalizeLine(line, totalLines);
        if (normalized !== null) {
          result.add(normalized);
        }
      }
      continue;
    }

    const value = Number(trimmed);
    if (Number.isNaN(value)) {
      continue;
    }
    const normalized = normalizeLine(value, totalLines);
    if (normalized !== null) {
      result.add(normalized);
    }
  }
  return result;
};

const collapseLineSet = (lineSet: Set<number>): string => {
  if (lineSet.size === 0) return "";
  const lines = Array.from(lineSet).sort((a, b) => a - b);
  const parts: string[] = [];
  let start = lines[0];
  let end = lines[0];

  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === end + 1) {
      end = lines[i];
      continue;
    }
    parts.push(start === end ? `${start}` : `${start}-${end}`);
    start = lines[i];
    end = lines[i];
  }
  parts.push(start === end ? `${start}` : `${start}-${end}`);
  return parts.join(",");
};

export const mergeHighlightRange = (
  existing: string | undefined,
  start: number,
  end: number,
): string => {
  const lineSet = parseHighlightLinesToSet(existing);
  const [safeStart, safeEnd] = normalizeLineRange(start, end);
  for (let line = safeStart; line <= safeEnd; line += 1) {
    lineSet.add(line);
  }
  return collapseLineSet(lineSet);
};

export const removeHighlightRange = (
  existing: string | undefined,
  start: number,
  end: number,
): string => {
  const lineSet = parseHighlightLinesToSet(existing);
  if (lineSet.size === 0) return "";
  const [safeStart, safeEnd] = normalizeLineRange(start, end);
  for (let line = safeStart; line <= safeEnd; line += 1) {
    lineSet.delete(line);
  }
  return collapseLineSet(lineSet);
};

export const hasHighlightedLineInRange = (
  highlightLines: string | undefined,
  start: number,
  end: number,
): boolean => {
  const lineSet = parseHighlightLinesToSet(highlightLines);
  if (lineSet.size === 0) return false;
  const [safeStart, safeEnd] = normalizeLineRange(start, end);
  for (let line = safeStart; line <= safeEnd; line += 1) {
    if (lineSet.has(line)) {
      return true;
    }
  }
  return false;
};
