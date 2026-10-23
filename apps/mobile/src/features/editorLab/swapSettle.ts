export type SwapDirection = "open" | "close";

export type SwapSettleResult = {
  direction: SwapDirection;
  reference: string;
  maxShiftPx: number;
  finalShiftPx: number;
  rootHeights: number[];
  kbHeights: number[];
  durationMs: number;
};

type SwapSettleOptions = {
  direction: SwapDirection;
  /** 参照点名称，写入结果便于区分选区矩形与可见块 */
  reference: string;
  readReferenceTop: () => number;
  readRootHeight: () => number;
  readKeyboardHeight: () => number;
  onDone: (result: SwapSettleResult) => void;
  durationMs?: number;
};

const MAX_DISTINCT_VALUES = 10;

function pushDistinct(values: number[], value: number) {
  if (values.length >= MAX_DISTINCT_VALUES) return;
  if (values[values.length - 1] !== value) values.push(value);
}

/** 逐帧采样参照点位置、根容器高度与键盘高度，到时后回调汇总；返回取消函数 */
export function measureSwapSettle(options: SwapSettleOptions): () => void {
  const durationMs = options.durationMs ?? 700;
  const startedAt = performance.now();
  const baseTop = options.readReferenceTop();
  const rootHeights: number[] = [];
  const kbHeights: number[] = [];
  let maxShift = 0;
  let lastShift = 0;
  let frame = 0;

  const sample = () => {
    lastShift = Math.round(options.readReferenceTop() - baseTop);
    maxShift = Math.max(maxShift, Math.abs(lastShift));
    pushDistinct(rootHeights, Math.round(options.readRootHeight()));
    pushDistinct(kbHeights, Math.round(options.readKeyboardHeight()));
  };

  const tick = () => {
    sample();
    const elapsed = performance.now() - startedAt;
    if (elapsed < durationMs) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    frame = 0;
    options.onDone({
      direction: options.direction,
      reference: options.reference,
      maxShiftPx: maxShift,
      finalShiftPx: lastShift,
      rootHeights,
      kbHeights,
      durationMs: Math.round(elapsed),
    });
  };

  sample();
  frame = window.requestAnimationFrame(tick);
  return () => {
    if (frame) window.cancelAnimationFrame(frame);
  };
}
