// 规范化时长范围
export function normalizeDurationRange(min: number, max: number): [number, number] {
  const clamp = (value: number) => {
    if (Number.isNaN(value)) return 1;
    return Math.min(15, Math.max(1, Math.round(value)));
  };
  const a = clamp(min);
  const b = clamp(max);
  return a <= b ? [a, b] : [b, a];
}
