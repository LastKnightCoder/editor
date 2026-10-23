import { expect, it, vi } from "vitest";
import { locateOutlineHeader } from "../position";

it("跨越数百节时测量次数保持对数级，同一节内只读邻近标题", () => {
  const count = 500;
  const read = vi.fn((index: number) => ({ top: index * 100, bottom: index * 100 + 30 }));
  const first = locateOutlineHeader(count, read, 40_050, 40_450, 0);
  expect(first).toEqual({ active: 401, next: 401 });
  expect(read.mock.calls.length).toBeLessThanOrEqual(12);
  read.mockClear();
  expect(locateOutlineHeader(count, read, 40_060, 40_460, first.next)).toEqual(first);
  expect(read.mock.calls.length).toBeLessThanOrEqual(2);
});

it("随机上下跳转与逐个测量的章节判定一致，支持文首、文末与空目录", () => {
  const count = 358;
  const read = (index: number) => ({ top: index * 150 + 10, bottom: index * 150 + 40 });
  let previous = 0;
  for (const top of [-200, 0, 100, 40_000, 30_000, 120, 80_000, 29_999, 15, 53_450]) {
    const bottom = top + 100;
    let active = -1;
    for (let index = 0; index < count; index++) {
      const rect = read(index);
      if (rect.bottom <= top) active = index;
      else {
        if (rect.top < bottom) active = index;
        break;
      }
    }
    const result = locateOutlineHeader(count, read, top, bottom, previous);
    expect(result.active).toBe(active);
    previous = result.next;
  }
  expect(locateOutlineHeader(0, read, 0, 100, previous)).toEqual({ active: -1, next: 0 });
});
