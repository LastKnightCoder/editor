import { describe, expect, it } from "vitest";

import { shouldWrapDatabaseEventInTransaction } from "../database-event-transaction";

describe("database event transaction policy", () => {
  it("小宇宙网络解析事件不应包裹数据库事务", () => {
    expect(shouldWrapDatabaseEventInTransaction("xiaoyuzhou:parse-url")).toBe(
      false,
    );
    expect(
      shouldWrapDatabaseEventInTransaction("xiaoyuzhou:fetch-episode"),
    ).toBe(false);
  });

  it("普通数据库事件仍应包裹事务", () => {
    expect(shouldWrapDatabaseEventInTransaction("update-audio-note")).toBe(
      true,
    );
  });
});
