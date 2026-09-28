import { describe, expect, it } from "vitest";
import { localSessionId, resolveSessionId } from "../session-identity";

describe("会话身份", () => {
  it("本机 id 由数据库、内容 id 与创建时间派生，可重复得出同一个值", () => {
    const first = localSessionId("/data/main.db", 7, 1700000000000);
    expect(first).toBe(localSessionId("/data/main.db", 7, 1700000000000));
    expect(first).not.toBe(localSessionId("/data/other.db", 7, 1700000000000));
    expect(first).not.toBe(localSessionId("/data/main.db", 8, 1700000000000));
    // 内容被删除重建（创建时间变化）算另一篇内容
    expect(first).not.toBe(localSessionId("/data/main.db", 7, 1700000000001));
  });

  it("旧 documentId 经别名表解析到当前会话", () => {
    const local = localSessionId("/data/main.db", 7, 1);
    // 升级：本机 id 让位给服务器文档 id
    expect(resolveSessionId(new Map([[local, "server-1"]]), local)).toBe("server-1");
    // 降级：换身份时清掉指向新 id 的旧别名（rekeySession 负责），当前 id 不再指回作废的那个
    const afterDemote = new Map([["server-1", local]]);
    expect(resolveSessionId(afterDemote, "server-1")).toBe(local);
    expect(resolveSessionId(afterDemote, local)).toBe(local);
    expect(resolveSessionId(afterDemote, "unknown")).toBe("unknown");
  });

  it("超长别名链在跳数上限处停下，不会死循环", () => {
    const aliases = new Map(
      Array.from({ length: 30 }, (_, index) => [`id-${index}`, `id-${index + 1}`])
    );
    expect(resolveSessionId(aliases, "id-0")).toBe("id-8");
  });
});
