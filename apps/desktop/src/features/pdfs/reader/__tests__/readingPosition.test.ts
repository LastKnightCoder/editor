import { beforeEach, describe, expect, it } from "vitest";
import { initialReadingPosition, useReadingPositions } from "../readingPosition";

describe("阅读位置", () => {
  beforeEach(() => useReadingPositions.setState({ positions: {} }));

  it("库里的页码为准，本机页内位置页码对得上才用", () => {
    useReadingPositions.getState().save(7, { page: 12, y: 340 });
    expect(initialReadingPosition(7, 12)).toEqual({ page: 12, y: 340 });
    // 别的设备读到了更后面：页码以库为准，从页顶开始
    expect(initialReadingPosition(7, 20)).toEqual({ page: 20, y: 0 });
    expect(initialReadingPosition(7, null)).toBeNull();
    expect(initialReadingPosition(8, 3)).toEqual({ page: 3, y: 0 });
  });

  it("超出上限时丢掉最久没读的", () => {
    const positions = Object.fromEntries(
      Array.from({ length: 300 }, (_, i) => [i + 1, { page: 1, y: 0, at: i + 1 }])
    );
    useReadingPositions.setState({ positions });
    useReadingPositions.getState().save(999, { page: 2, y: 5 });
    const saved = useReadingPositions.getState().positions;
    expect(Object.keys(saved)).toHaveLength(300);
    expect(saved[1]).toBeUndefined();
    expect(saved[999]).toMatchObject({ page: 2, y: 5 });
  });
});
