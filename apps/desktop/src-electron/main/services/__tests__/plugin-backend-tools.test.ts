// @vitest-environment node
import { expect, it, vi } from "vitest";
import { build } from "esbuild";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

it.each(["batch", "stdio"])(
  "宿主突然退出后，%s 工具与孙进程均被监督器回收",
  async mode => {
    const directory = await mkdtemp(path.join(tmpdir(), "tau-tool-tree-"));
    let processes: number[] = [];
    let parent: ReturnType<typeof spawn> | undefined;
    try {
      const bundle = path.join(directory, "tools.cjs");
      await build({
        entryPoints: [
          path.resolve(
            import.meta.dirname,
            mode === "batch" ? "../plugin-backend/tools.ts" : "../plugin-backend/mcp-tool.ts"
          ),
        ],
        outfile: bundle,
        bundle: true,
        platform: "node",
        format: "cjs",
      });
      const marker = path.join(directory, "processes.json");
      const script =
        "const child=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});require('node:fs').writeFileSync(process.argv[1],JSON.stringify([process.pid,child.pid]));setInterval(()=>{},1000);";
      const descriptor = {
        cwd: directory,
        manifest: {
          backend: {
            systemAccess: ["process"],
            tools: [{ id: "tree", command: process.execPath, args: ["-e", script, marker] }],
          },
        },
      };
      parent = spawn(
        process.execPath,
        [
          "-e",
          mode === "batch"
            ? "require(process.argv[1]).runBackendTool(JSON.parse(process.argv[2]),'tree',[],new AbortController().signal).catch(()=>process.exit(1));"
            : "const d=JSON.parse(process.argv[2]);const p=require(process.argv[1]).pluginMcpParameters(d,d.manifest.backend.tools[0]);require('node:child_process').spawn(p.command,p.args,{env:p.env,cwd:p.cwd,stdio:'ignore'}).once('error',()=>process.exit(1));",
          bundle,
          JSON.stringify(descriptor),
        ],
        { stdio: "ignore" }
      );
      await vi.waitFor(
        async () => {
          processes = JSON.parse(await readFile(marker, "utf8"));
          expect(processes).toHaveLength(2);
        },
        { timeout: 15_000, interval: 50 }
      );
      const exited = new Promise<void>(resolve => parent!.once("exit", () => resolve()));
      parent.kill("SIGKILL");
      await exited;
      await vi.waitFor(
        () => {
          for (const pid of processes) expect(() => process.kill(pid, 0)).toThrow();
        },
        { timeout: 5000, interval: 50 }
      );
    } finally {
      parent?.kill("SIGKILL");
      for (const pid of processes) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          /* 已回收。 */
        }
      }
      await rm(directory, { recursive: true, force: true });
    }
  },
  25_000
);
