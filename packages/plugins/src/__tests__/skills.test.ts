import { describe, expect, it } from "vitest";
import { validatePluginManifest } from "../package";
import { isSkillPackageManifest, validateDistributionManifest } from "../template";
import { hasSkillScripts } from "../skills";

const hash = (char: string) => char.repeat(64);
const plugin = {
  formatVersion: 2,
  id: "example.skills",
  name: "示例",
  version: "1.0.0",
  apiVersion: 1,
  platform: "desktop",
  format: "cjs",
  main: "main.js",

  minAppVersion: "0.59.0",
  backend: {
    entry: "backend.js",
    runtime: "node",
    apiVersion: 1,
    scope: "application",
    activation: "on-demand",
    lifetime: "idle",
    reason: "执行 Skill",
    systemAccess: [],
  },
};

describe("插件包内 Skill", () => {
  it("声明的 Skill 目录文件进入完整性清单，未声明的文件被丢弃", () => {
    const manifest = validatePluginManifest({
      ...plugin,
      skills: ["guide"],
      integrity: {
        "main.js": hash("a"),
        "backend.js": hash("d"),
        "skills/guide/SKILL.md": hash("b"),
        "skills/guide/references/api.md": hash("c"),
        "notes.txt": hash("d"),
      },
    });
    expect(manifest.skills).toEqual(["guide"]);
    expect(Object.keys(manifest.integrity).sort()).toEqual([
      "backend.js",
      "main.js",
      "skills/guide/SKILL.md",
      "skills/guide/references/api.md",
    ]);
  });

  it("拒绝缺少 SKILL.md、未声明目录与越界路径", () => {
    const base = { ...plugin, integrity: { "main.js": hash("a"), "backend.js": hash("d") } };
    expect(() => validatePluginManifest({ ...base, skills: ["guide"] })).toThrow("缺少 SKILL.md");
    expect(() =>
      validatePluginManifest({
        ...base,
        skills: ["guide"],
        integrity: {
          ...base.integrity,
          "skills/guide/SKILL.md": hash("b"),
          "skills/other/SKILL.md": hash("c"),
        },
      })
    ).toThrow("不属于已声明");
    expect(() => validatePluginManifest({ ...base, skills: ["../x"] })).toThrow();
  });
});

describe("独立 Skill 包", () => {
  const skillPackage = {
    formatVersion: 1,
    apiVersion: 1,
    platform: "desktop",
    id: "example.writing",
    name: "写作规范",
    version: "1.0.0",
    categories: ["skill"],
    skills: ["writing"],
    integrity: {
      "skills/writing/SKILL.md": hash("a"),
      "skills/writing/scripts/check.py": hash("b"),
    },
  };

  it("没有代码入口、只含 Skill 目录时识别为 Skill 包", () => {
    const manifest = validateDistributionManifest(skillPackage);
    expect(isSkillPackageManifest(manifest)).toBe(true);
    expect(manifest).toMatchObject({ skills: ["writing"], categories: ["skill"] });
    expect(hasSkillScripts(manifest)).toBe(true);
  });

  it("拒绝代码字段、Skill 目录之外的文件和空声明", () => {
    expect(validateDistributionManifest({ ...skillPackage, documentation: "extra" })).toMatchObject(
      { skills: ["writing"] }
    );
    expect(() =>
      validateDistributionManifest({
        ...skillPackage,
        integrity: { ...skillPackage.integrity, "extra.js": hash("c") },
      })
    ).toThrow("只能包含已声明 Skill 目录内的文件");
    expect(() => validateDistributionManifest({ ...skillPackage, skills: [] })).toThrow(
      "至少声明一个 Skill"
    );
  });

  it("缺少 main 且未声明 skills 时仍按代码插件报错", () => {
    const rest = Object.fromEntries(
      Object.entries(skillPackage).filter(([key]) => key !== "skills")
    );
    expect(() => validateDistributionManifest(rest)).toThrow();
    expect(() => validateDistributionManifest(rest)).not.toThrow("Skill");
  });

  it("只有说明文档的 Skill 不算带脚本", () => {
    expect(hasSkillScripts({ skills: ["a"], integrity: { "skills/a/SKILL.md": hash("a") } })).toBe(
      false
    );
    expect(
      hasSkillScripts({ skills: ["a"], integrity: { "skills/a/tools/run.sh": hash("a") } })
    ).toBe(true);
  });
});
