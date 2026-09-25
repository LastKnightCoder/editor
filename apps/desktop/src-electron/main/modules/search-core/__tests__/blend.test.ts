import { describe, expect, it } from "vitest";

import { blendScore } from "../blend";
import { DEFAULT_SEARCH_CORE_CONFIG } from "../types";

describe("search-core/blend", () => {
  it("section 级证据在同等 RRF 分数下应高于普通 passage", () => {
    const sectionScore = blendScore({
      rrfScore: 0.7,
      config: DEFAULT_SEARCH_CORE_CONFIG,
      structureLevel: "section",
    });
    const passageScore = blendScore({
      rrfScore: 0.7,
      config: DEFAULT_SEARCH_CORE_CONFIG,
      structureLevel: "passage",
    });

    expect(sectionScore).toBeGreaterThan(passageScore);
  });
});
