import { describe, expect, it } from "vitest";
import { localSessionId } from "../session-identity";

describe("会话身份", () => {
  it("本机 id 由数据库、内容 id 与创建时间派生，可重复得出同一个值", () => {
    const first = localSessionId("/data/main.db", 7, 1700000000000);
    expect(first).toBe(localSessionId("/data/main.db", 7, 1700000000000));
    expect(first).not.toBe(localSessionId("/data/other.db", 7, 1700000000000));
    expect(first).not.toBe(localSessionId("/data/main.db", 8, 1700000000000));
    // 内容被删除重建（创建时间变化）算另一篇内容
    expect(first).not.toBe(localSessionId("/data/main.db", 7, 1700000000001));
  });
});
