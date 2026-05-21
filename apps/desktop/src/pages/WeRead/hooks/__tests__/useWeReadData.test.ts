import { describe, expect, it } from "vitest";
import { resolveWeReadReadingStatus } from "../useWeReadData";

describe("resolveWeReadReadingStatus", () => {
  it("进度大于 0 时应视为进行中", () => {
    expect(
      resolveWeReadReadingStatus({
        readingProgress: 1,
        readingTime: 0,
        readingBookDate: 0,
        finishedDate: 0,
      }),
    ).toBe("reading");
  });

  it("进度达到 100 时应视为已完成", () => {
    expect(
      resolveWeReadReadingStatus({
        readingProgress: 100,
        readingTime: 3600,
        readingBookDate: 1710000000,
        finishedDate: 0,
      }),
    ).toBe("finished");
  });
});
