// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  root: "",
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
}));
vi.mock("electron", () => ({
  ipcMain: {
    handle: (name: string, handler: (...args: unknown[]) => unknown) =>
      mock.handlers.set(name, handler),
  },
  net: { fetch: vi.fn() },
  shell: { showItemInFolder: vi.fn() },
}));
vi.mock("electron-log", () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("../../utils/PathUtil", () => ({
  default: { getAppDir: () => path.join(mock.root, ".editor") },
}));

const hash = (char: string) => char.repeat(64);
const call = (name: string, ...args: unknown[]) => mock.handlers.get(name)!({}, ...args);

async function writePackage(id: string, manifest: Record<string, unknown>, skills: string[]) {
  const directory = path.join(mock.root, ".editor/plugins", id);
  for (const skill of skills) {
    await mkdir(path.join(directory, "skills", skill, "scripts"), { recursive: true });
    await writeFile(
      path.join(directory, "skills", skill, "SKILL.md"),
      `---\nname: ${skill} 指南\ndescription: 处理 ${skill} 时使用\n---\n\n# ${skill}\n`
    );
    await writeFile(
      path.join(directory, "skills", skill, "scripts/hello.js"),
      "console.log('来自插件 Skill');\n"
    );
  }
  await writeFile(
    path.join(directory, "manifest.json"),
    JSON.stringify({
      formatVersion: 1,
      apiVersion: 1,
      platform: "desktop",
      id,
      name: `包 ${id}`,
      version: "1.0.0",
      skills,
      ...manifest,
      integrity: Object.fromEntries([
        ...(manifest.main ? [["main.js", hash("c")]] : []),
        ...skills.flatMap(skill => [
          [`skills/${skill}/SKILL.md`, hash("a")],
          [`skills/${skill}/scripts/hello.js`, hash("b")],
        ]),
      ]),
    })
  );
  return directory;
}

beforeEach(async () => {
  mock.root = await mkdtemp(path.join(tmpdir(), "tau-skill-packages-"));
  mock.handlers.clear();
  vi.resetModules();
  const { default: skillModule } = await import("../skill");
  await skillModule.init();
});

afterEach(async () => {
  await rm(mock.root, { recursive: true, force: true });
});

it("列出插件与 Skill 包中声明的 Skill，名称与描述取自 SKILL.md", async () => {
  await writePackage("test.plugin", { format: "cjs", main: "main.js" }, ["guide"]);
  await writePackage("test.pack", {}, ["style"]);
  const skills = (await call("skill:list")) as Array<Record<string, unknown>>;
  expect(skills).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        folderName: "test.plugin:guide",
        name: "guide 指南",
        description: "处理 guide 时使用",
        source: "plugin",
        pluginId: "test.plugin",
        hasScripts: true,
      }),
      expect.objectContaining({
        folderName: "test.pack:style",
        source: "package",
        pluginName: "包 test.pack",
      }),
    ])
  );
});

it("包内 Skill 可读取文件与执行脚本，未声明的目录与越界路径被拒绝", async () => {
  const directory = await writePackage("test.pack", {}, ["style"]);
  await mkdir(path.join(directory, "skills/hidden"), { recursive: true });
  await writeFile(path.join(directory, "skills/hidden/SKILL.md"), "# 未声明");
  await writeFile(path.join(directory, "secret.txt"), "不可读");
  const skillPath = path.join(directory, "skills/style");
  expect(await call("skill:readme", skillPath)).toContain("# style");
  const detail = (await call("skill:detail", skillPath)) as Record<string, unknown>;
  expect(detail).toMatchObject({ folderName: "test.pack:style", source: "package" });
  const result = (await call("skill:run-script", {
    skillPath,
    script: "scripts/hello.js",
  })) as { exitCode: number; stdout: string };
  expect(result).toMatchObject({ exitCode: 0 });
  expect(result.stdout).toContain("来自插件 Skill");
  await expect(call("skill:readme", path.join(directory, "skills/hidden"))).rejects.toThrow();
  await expect(call("skill:read-file", path.join(directory, "secret.txt"))).rejects.toThrow();
  await expect(
    call("skill:run-script", { skillPath: path.join(directory, "skills/hidden"), script: "x.js" })
  ).rejects.toThrow("不是有效的 Skill 目录");
});

it("目录名与 manifest.id 不一致或清单无效的包不提供 Skill", async () => {
  await writePackage("test.pack", { id: "test.other" }, ["style"]);
  await mkdir(path.join(mock.root, ".editor/plugins/test.broken"), { recursive: true });
  await writeFile(path.join(mock.root, ".editor/plugins/test.broken/manifest.json"), "{");
  const skills = (await call("skill:list")) as Array<{ source: string }>;
  expect(skills.filter(skill => skill.source === "package")).toEqual([]);
});
