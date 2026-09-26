import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/commands/skill", () => ({
  listSkills: vi.fn(async () => []),
  createSkill: vi.fn(),
  deleteSkill: vi.fn(),
}));
vi.mock("@/constants/internal-skills", () => ({ getAllInternalSkills: () => [] }));

import useSkillStore, { dedupeSkills } from "@/stores/useSkillStore";
import { resolveAgentSkills } from "@/agent/desktopSkillAdapter";
import { toSkillItems } from "../useSkills";
import type { Skill } from "@/types";

const skill = (folderName: string, source: Skill["source"], extra: Partial<Skill> = {}): Skill => ({
  folderName,
  name: folderName,
  description: `${folderName} 的描述，用户提到时使用`,
  path: `/${source}/${folderName}`,
  source,
  defaultInvocation: "auto",
  ...extra,
});

describe("Skill 条目与交给 agent 的过滤", () => {
  beforeEach(() => useSkillStore.setState({ preferences: {}, usage: {} }));

  it("同名优先级：内置 > 我的 > 关联目录", () => {
    const list = [
      skill("pdf", "linked"),
      skill("pdf", "mine"),
      skill("mindmap", "builtin"),
      skill("mindmap", "mine"),
    ];
    const winners = dedupeSkills(list);
    expect(winners.map(s => `${s.source}:${s.folderName}`)).toEqual([
      "mine:pdf",
      "builtin:mindmap",
    ]);
    const items = toSkillItems(list, {}, {});
    expect(items.filter(i => i.shadowed).map(i => i.key)).toEqual([
      "linked:/linked/pdf",
      "mine:/mine/mindmap",
    ]);
  });

  it("停用的不给；仅手动的只在点名时给", () => {
    const list = [
      skill("a", "mine"),
      skill("b", "mine", { defaultInvocation: "manual" }),
      skill("c", "mine"),
    ];
    useSkillStore.getState().setEnabled("c", false);
    expect(resolveAgentSkills(list).map(s => s.folderName)).toEqual(["a"]);
    expect(resolveAgentSkills(list, ["b", "c"]).map(s => s.folderName)).toEqual(["a", "b"]);
  });

  it("本机偏好覆盖 front-matter 默认值；设调用方式同时解除停用", () => {
    const list = [skill("b", "mine", { defaultInvocation: "manual" })];
    useSkillStore.getState().setEnabled("b", false);
    useSkillStore.getState().setInvocation("b", "auto");
    const [item] = toSkillItems(list, useSkillStore.getState().preferences, {});
    expect(item.mode).toBe("auto");
  });

  it("缺描述标红、描述过长标黄", () => {
    const items = toSkillItems(
      [
        skill("empty", "mine", { description: "" }),
        skill("long", "mine", { description: "很".repeat(200) }),
      ],
      {},
      {}
    );
    expect(items[0].warning?.level).toBe("danger");
    expect(items[1].warning?.level).toBe("warn");
  });
});
