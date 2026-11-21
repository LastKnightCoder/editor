import { expect, it, vi } from "vitest";
import { PPTWorkspace } from "../workspace";
import { decodePPTFiles } from "../document";

vi.mock("@/commands/module-init", () => ({ ensureModule: async () => undefined }));
vi.mock("@/tools", () => ({
  default: { getRegisteredTools: () => [] },
  ensureToolingReady: () => undefined,
}));
vi.mock("@/electron", () => {
  const disk = new Map<string, string>();
  return {
    invoke: async (channel: string, id: unknown, op: string, path: string, value: string) => {
      if (channel === "ppt-workspace:open") {
        for (const [name, src] of Object.entries(id as Record<string, string>)) disk.set(name, src);
        return { id: "job", cwd: "draft" };
      }
      if (channel === "ppt-workspace:verify") return;
      if (op === "read") return disk.get(path);
      if (op === "write") {
        disk.set(path, value);
        return;
      }
      throw Error("unexpected workspace operation");
    },
  };
});

it("播放检查之后再改页需要重新检查，发布只读取最后一次通过的内容", async () => {
  const manifest = JSON.stringify({
    format: "tau-ppt",
    version: 1,
    template: "cinematic-v1",
    title: "节奏",
    slides: [{ id: "cover", intent: "引入节奏" }],
  });
  const workspace = await PPTWorkspace.open(
    { "deck.json": manifest, "slides/cover.html": '<section class="slide">第一拍</section>' },
    "test"
  );
  const run = (name: string, args: Record<string, string>) => {
    const tool = workspace.tools.find(t => t.name === name);
    if (!tool) throw Error("缺少工具 " + name);
    return tool.executor(args);
  };
  expect(() => workspace.result([])).toThrow();
  await run("ppt_check", {});
  const first = workspace.result([]).nodes;
  await run("ppt_edit", { path: "slides/cover.html", before: "第一拍", after: "第二拍" });
  expect(() => workspace.result(first)).toThrow();
  await run("ppt_check", {});
  expect(decodePPTFiles(workspace.result(first).nodes)?.["slides/cover.html"]).toBe(
    '<section class="slide">第二拍</section>'
  );
});
