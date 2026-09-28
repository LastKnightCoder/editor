import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import { existsSync } from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseAllowedTools, parseSkillFrontMatter } from "../skill-frontmatter";
import { extractZip, findSkillDirs, parseGithubUrl, sanitizeFolderName } from "../skill-import";
import { resolveScriptPath, runSkillScript } from "../skill-script-runner";

let dir = "";
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "skill-test-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("front-matter", () => {
  it("识别 name / 仅手动 / allowed-tools", () => {
    const meta = parseSkillFrontMatter(
      "---\nname: deploy\ndescription: 部署\ndisable-model-invocation: true\nallowed-tools: Bash(npm run build *) Read, Grep\n---\n# x"
    );
    expect(meta).toEqual({
      name: "deploy",
      description: "部署",
      disableModelInvocation: true,
      allowedTools: ["Bash(npm run build *)", "Read", "Grep"],
    });
  });
  it("没有 front-matter 时取标题后第一段作描述", () => {
    expect(parseSkillFrontMatter("# 标题\n\n第一段\n").description).toBe("第一段");
    expect(parseAllowedTools(["A", " B "])).toEqual(["A", "B"]);
  });
});

describe("导入", () => {
  it("解析 GitHub 链接的三种形态", () => {
    expect(parseGithubUrl("https://github.com/anthropics/skills")).toEqual({
      owner: "anthropics",
      repo: "skills",
      ref: "HEAD",
      subPath: "",
    });
    expect(parseGithubUrl("https://github.com/a/b/tree/main/skills/docx")).toMatchObject({
      ref: "main",
      subPath: "skills/docx",
    });
    expect(parseGithubUrl("https://github.com/a/b/blob/main/skills/docx/SKILL.md")).toMatchObject({
      subPath: "skills/docx",
    });
    expect(() => parseGithubUrl("https://gitlab.com/a/b")).toThrow();
  });

  it("找到含 SKILL.md 的目录后不再向下", async () => {
    await mkdir(path.join(dir, "pack/one/sub"), { recursive: true });
    await writeFile(path.join(dir, "pack/one/SKILL.md"), "# one");
    await writeFile(path.join(dir, "pack/one/sub/SKILL.md"), "# nested");
    await mkdir(path.join(dir, "pack/two"), { recursive: true });
    await writeFile(path.join(dir, "pack/two/SKILL.md"), "# two");
    const found = (await findSkillDirs(dir)).map(p => path.relative(dir, p)).sort();
    // path.relative 在 Windows 返回反斜杠，预期值用 path.join 构造保持平台无关
    expect(found).toEqual([path.join("pack", "one"), path.join("pack", "two")]);
  });

  it("拒绝 zip-slip", async () => {
    const zip = new AdmZip();
    zip.addFile("ok/SKILL.md", Buffer.from("# ok"));
    await extractZip(zip.toBuffer(), dir);
    const evil = new AdmZip();
    evil.addFile("placeholder", Buffer.from("x"));
    evil.getEntries()[0].entryName = "../evil.txt";
    // adm-zip 读包时会规范掉 ../，extractZip 再兜一层校验：无论哪层拦下，都不能写到目录外
    await extractZip(evil.toBuffer(), dir).catch(() => undefined);
    expect(existsSync(path.join(dir, "..", "evil.txt"))).toBe(false);
  });

  it("文件夹名保留中文、去掉符号", () => {
    expect(sanitizeFolderName(" Meeting Notes! ")).toBe("meeting-notes");
    expect(sanitizeFolderName("会议纪要")).toBe("会议纪要");
  });
});

describe("脚本执行", () => {
  it("脚本必须位于 Skill 目录内（含软链接逃逸）", async () => {
    const skill = path.join(dir, "skill");
    await mkdir(path.join(skill, "scripts"), { recursive: true });
    await writeFile(path.join(dir, "outside.sh"), "echo hi");
    await symlink(path.join(dir, "outside.sh"), path.join(skill, "scripts/link.sh"));
    await expect(resolveScriptPath(skill, "../outside.sh")).rejects.toThrow("Skill 目录内");
    await expect(resolveScriptPath(skill, "scripts/link.sh")).rejects.toThrow("Skill 目录内");
    await expect(resolveScriptPath(skill, "/etc/passwd")).rejects.toThrow();
  });

  it("以 Skill 目录为工作目录执行 Node 脚本并收集输出", async () => {
    const skill = path.join(dir, "skill");
    await mkdir(path.join(skill, "scripts"), { recursive: true });
    await writeFile(
      path.join(skill, "scripts/echo.js"),
      "process.stdout.write(JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) }))"
    );
    const result = await runSkillScript({
      skillDir: skill,
      script: "scripts/echo.js",
      args: ["a b", "c"],
    });
    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(await import("node:fs/promises").then(fs => fs.realpath(out.cwd))).toBe(
      await import("node:fs/promises").then(fs => fs.realpath(skill))
    );
    expect(out.args).toEqual(["a b", "c"]);
  });

  it("超时会被终止", async () => {
    const skill = path.join(dir, "skill");
    await mkdir(skill, { recursive: true });
    await writeFile(path.join(skill, "loop.js"), "setInterval(() => {}, 1000)");
    const result = await runSkillScript({ skillDir: skill, script: "loop.js", timeoutMs: 300 });
    expect(result.timedOut).toBe(true);
  });
});
