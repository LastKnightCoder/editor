import { afterEach, expect, it, vi } from "vitest";
import { measureSwapSettle, type SwapSettleResult } from "../swapSettle";

afterEach(() => {
  vi.restoreAllMocks();
});

it("逐帧采样后汇总最大位移、最终位移与去重高度序列", () => {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
    frames.push(callback);
    return frames.length;
  });
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const tops = [100, 100, 92, 104, 101];
  const rootHeights = [500, 500, 520, 520, 520];
  const keyboardHeights = [300, 300, 150, 0, 0];
  let sampleIndex = 0;
  const done = vi.fn<(result: SwapSettleResult) => void>();

  measureSwapSettle({
    direction: "open",
    reference: "selection",
    readReferenceTop: () => tops[Math.min(sampleIndex, tops.length - 1)],
    readRootHeight: () => rootHeights[sampleIndex],
    readKeyboardHeight: () => keyboardHeights[sampleIndex++],
    onDone: done,
    durationMs: 300,
  });
  for (const elapsed of [100, 200, 300, 400]) {
    now = elapsed;
    frames.shift()?.(elapsed);
  }

  expect(done).toHaveBeenCalledTimes(1);
  expect(done.mock.calls[0][0]).toEqual({
    direction: "open",
    reference: "selection",
    maxShiftPx: 8,
    finalShiftPx: 4,
    rootHeights: [500, 520],
    kbHeights: [300, 150, 0],
    durationMs: 300,
  });
});
