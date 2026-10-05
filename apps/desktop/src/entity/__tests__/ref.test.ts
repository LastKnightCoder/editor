import { describe, expect, it } from "vitest";
import {
  ENTITY_REF_KINDS,
  ENTITY_REF_PRIORITY,
  entityRefKey,
  isSameEntityRef,
  normalizeEntityRefKind,
} from "../ref";

describe("normalizeEntityRefKind", () => {
  it("收口各处存量写法", () => {
    expect(normalizeEntityRefKind("card")).toBe("card");
    expect(normalizeEntityRefKind("article")).toBe("article");
    expect(normalizeEntityRefKind("project-item")).toBe("project-item");
    expect(normalizeEntityRefKind("project_item")).toBe("project-item");
    expect(normalizeEntityRefKind("diary")).toBe("diary");
    expect(normalizeEntityRefKind("diary-daily")).toBe("diary");
  });

  it("不认识的写法返回 null", () => {
    expect(normalizeEntityRefKind("white_board")).toBeNull();
    expect(normalizeEntityRefKind("")).toBeNull();
    expect(normalizeEntityRefKind(undefined)).toBeNull();
    expect(normalizeEntityRefKind(3)).toBeNull();
  });
});

describe("EntityRef 工具", () => {
  it("key 与相等判断", () => {
    expect(entityRefKey({ kind: "project-item", id: 7 })).toBe("project-item:7");
    expect(isSameEntityRef({ kind: "card", id: 1 }, { kind: "card", id: 1 })).toBe(true);
    expect(isSameEntityRef({ kind: "card", id: 1 }, { kind: "article", id: 1 })).toBe(false);
  });

  it("每种类型都有代表优先级，且卡片最先", () => {
    for (const kind of ENTITY_REF_KINDS) expect(ENTITY_REF_PRIORITY[kind]).toBeTypeOf("number");
    const order = [...ENTITY_REF_KINDS].sort(
      (a, b) => ENTITY_REF_PRIORITY[a] - ENTITY_REF_PRIORITY[b]
    );
    expect(order[0]).toBe("card");
  });
});
