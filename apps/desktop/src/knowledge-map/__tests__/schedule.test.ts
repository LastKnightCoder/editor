/**
 * 离线地图的两个规模阈值（压测之后改成按比例）：万级库的整体重算是分钟级的，触发条件不能再按固定张数算。
 */

import { describe, expect, it } from "vitest";
import { syncPlaceLimit, WAIT_FIRST_BUILD_CARDS } from "@/knowledge-map/schedule";

describe("同步落位上限", () => {
  it("小库至少 10 张：新写几张卡不该触发整体重算", () => {
    expect(syncPlaceLimit(0)).toBe(10);
    expect(syncPlaceLimit(674)).toBe(10);
  });

  it("大库按比例放宽：2 万张时 200 张，才不会一天写几十张就触发分钟级重算", () => {
    expect(syncPlaceLimit(5000)).toBe(50);
    expect(syncPlaceLimit(20000)).toBe(200);
  });

  it("单调不减", () => {
    const sizes = [0, 100, 674, 1000, 5000, 20000, 100000];
    const limits = sizes.map(syncPlaceLimit);
    expect(limits).toEqual([...limits].sort((a, b) => a - b));
  });
});

describe("首次构建是否干等", () => {
  it("阈值落在「等一下更好」与「等不起」之间：700 张约 1 秒要等，2000 张约 8 秒不等", () => {
    expect(WAIT_FIRST_BUILD_CARDS).toBeGreaterThan(700);
    expect(WAIT_FIRST_BUILD_CARDS).toBeLessThan(2000);
  });
});
