// @vitest-environment node
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("运行时样式的真实 worker 输出", () => {
  it("HTML 从旧 tsx 扫描切为 html 时保持 CSS，TSX 与语言缓存隔离", async () => {
    const worker = fork(
      fileURLToPath(
        new URL("../../../src-electron/main/workers/tailwind-runtime-worker.js", import.meta.url)
      ),
      { stdio: ["ignore", "ignore", "pipe", "ipc"] }
    );
    let id = 0;
    const compile = (content: string, extension: "html" | "tsx") =>
      new Promise<string>((resolve, reject) => {
        const requestId = ++id;
        const onMessage = (response: { id: number; ok: boolean; css: string; error?: string }) => {
          if (response.id !== requestId) return;
          worker.off("message", onMessage);
          if (response.ok) resolve(response.css);
          else reject(new Error(response.error));
        };
        worker.on("message", onMessage);
        worker.send({ id: requestId, content, extension });
      });
    try {
      for (const source of [
        '<div class="p-4 text-red-500 hover:bg-blue-100 dark:text-white">HTML</div>',
        '<span class="grid grid-cols-2 gap-2 [&>b]:font-bold w-[23px]"><b>内容</b></span>',
        "<div class=\"before:content-['中文'] bg-[#123456] sm:flex\"></div>",
      ]) {
        const previous = await compile(source, "tsx");
        const current = await compile(source, "html");
        expect(current).toBe(previous);
        expect(current).toContain(
          source.includes("p-4") ? ".p-4" : source.includes("grid") ? ".grid" : ".sm\\:flex"
        );
      }
      const tsx = await compile('const Component = () => <div className="p-7">模板</div>;', "tsx");
      expect(tsx).toContain(".p-7");
      const other = await compile('<span class="m-9">另一个输入</span>', "html");
      expect(other).toContain(".m-9");
      expect(other).not.toContain(".p-7");
    } finally {
      worker.kill();
    }
  }, 20000);
});
