import { describe, expect, it } from "vitest";
import {
  estimateTokens,
  hasTriggerHint,
  joinSkillDocument,
  splitSkillDocument,
} from "@/utils/skill-frontmatter";

describe("SKILL.md 拆分 / 合并", () => {
  const source = `---
name: weekly-report
description: 整理周报。用户提到「周报」时使用。
allowed-tools: Read, Grep
metadata:
  version: 2
---

# 周报

正文`;

  it("拆出 front-matter 与正文，未知字段原样保留", () => {
    const doc = splitSkillDocument(source);
    expect(doc.meta.name).toBe("weekly-report");
    expect(doc.body.trim()).toBe("# 周报\n\n正文");
    const joined = joinSkillDocument({ ...doc.meta, title: "周报整理" }, doc.body);
    const again = splitSkillDocument(joined);
    expect(again.meta).toMatchObject({
      "allowed-tools": "Read, Grep",
      metadata: { version: 2 },
      title: "周报整理",
    });
    expect(again.body.trim()).toBe("# 周报\n\n正文");
  });

  it("false / 空值不写回（关闭仅手动即删除字段）", () => {
    const joined = joinSkillDocument(
      { name: "a", "disable-model-invocation": false, description: "" },
      "x"
    );
    expect(joined).not.toContain("disable-model-invocation");
    expect(joined).not.toContain("description");
  });

  it("没有 front-matter 时整份都是正文；YAML 写坏给出 error", () => {
    expect(splitSkillDocument("# 标题").body).toBe("# 标题");
    expect(splitSkillDocument("---\nname: [oops\n---\nbody").error).toBeTruthy();
  });

  it("触发场景提示与 tokens 粗估", () => {
    expect(hasTriggerHint("整理周报。用户提到「周报」时使用。")).toBe(true);
    expect(hasTriggerHint("整理周报")).toBe(false);
    expect(estimateTokens("周报")).toBe(2);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });
});
