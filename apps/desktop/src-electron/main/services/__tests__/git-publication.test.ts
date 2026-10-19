// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { GitPublicationService } from "../git-publication";
import type { IPublishPlan } from "@/types/publish";
const execute = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "tau-git-service-"));
  roots.push(root);
  const remote = path.join(root, "remote.git");
  await execute("git", ["init", "--bare", remote]);
  const calls: string[][] = [];
  let loseReply = false;
  const run: typeof execute = (async (file: string, args: string[], options: any) => {
    calls.push(args);
    const modified = [...args];
    modified.splice(
      6,
      0,
      "-c",
      "url." + pathToFileURL(remote).href + ".insteadOf=https://publisher.invalid/blog.git",
      "-c",
      "protocol.file.allow=always"
    );
    const result = await execute(file, modified, options);
    if (loseReply && args.includes("push")) {
      loseReply = false;
      throw new Error("响应丢失");
    }
    return result;
  }) as typeof execute;
  const service = new GitPublicationService(path.join(root, "app"), run);
  const config = {
    remote: "https://publisher.invalid/blog.git",
    branch: "gh-pages",
    author: { name: "发布测试", email: "test@example.invalid" },
    authentication: { username: "token-user", password: "private-token-value" },
  };
  const plan = (files: Record<string, string>, deletions: string[] = []): IPublishPlan => ({
    toUpload: Object.entries(files).map(([file, content]) => ({ path: file, content, hash: file })),
    toDelete: deletions,
    unchanged: [],
  });
  const publish = async (data: IPublishPlan) => {
    const entry = service.register(1, data, new AbortController().signal);
    try {
      await service.publish(1, { ...config, publicationId: entry.id });
    } finally {
      entry.dispose();
    }
  };
  return {
    root,
    service,
    config,
    plan,
    publish,
    remote,
    calls,
    loseNextReply: () => {
      loseReply = true;
    },
  };
}
it("真实 Git 快照保留其他文件，支持字面路径、删除与推送响应丢失确认，认证不落盘", async () => {
  const f = await fixture();
  await f.publish(
    f.plan({ CNAME: "example.invalid", ".gitignore": "data/\n", "old.html": "旧文件" })
  );
  f.loseNextReply();
  await f.publish(
    f.plan({ "index.html": "入口", "data/item.json": "{}", "*.txt": "字面文件" }, [
      "old.html",
      "missing.html",
    ])
  );
  const git = (args: string[]) =>
    execute("git", ["--git-dir", f.remote, ...args]).then(result => result.stdout);
  expect(await git(["show", "gh-pages:CNAME"])).toBe("example.invalid");
  expect(await git(["show", "gh-pages:data/item.json"])).toBe("{}");
  expect(await git(["show", "gh-pages:*.txt"])).toBe("字面文件");
  expect(await git(["ls-tree", "--name-only", "gh-pages"])).not.toContain("old.html");
  const cache = path.join(f.root, "app", "git-publications");
  const working = path.join(cache, (await readdir(cache))[0]);
  expect(await readFile(path.join(working, ".git/config"), "utf8")).not.toContain(
    "private-token-value"
  );
  expect(f.calls.flat().join(" ")).not.toContain("private-token-value");
});
it("拒绝越权快照、未授权缓存和危险远端，不运行任意命令", async () => {
  const f = await fixture();
  const data = f.service.register(
    1,
    f.plan({ "index.html": "入口" }),
    new AbortController().signal
  );
  await expect(f.service.publish(2, { ...f.config, publicationId: data.id })).rejects.toThrow(
    "不属于"
  );
  await expect(
    f.service.publish(1, {
      ...f.config,
      publicationId: data.id,
      remote: "https://token@publisher.invalid/repo",
    })
  ).rejects.toThrow("不含凭据");
  await expect(
    f.service.publish(1, { ...f.config, publicationId: data.id, cacheId: "unknown" })
  ).rejects.toThrow("授权已失效");
  expect(f.calls).toHaveLength(0);
  data.dispose();
  await expect(f.service.publish(1, { ...f.config, publicationId: data.id })).rejects.toThrow(
    "失效"
  );
});
it("自定义缓存使用已登记目录，取消后的发布不写文件", async () => {
  const f = await fixture(),
    custom = path.join(f.root, "custom");
  await mkdir(custom);
  await writeFile(path.join(custom, "unrelated.txt"), "保留");
  const cache = await f.service.registerDirectory(custom);
  const controller = new AbortController();
  const data = f.service.register(1, f.plan({ "index.html": "入口" }), controller.signal);
  f.service.cancel(1, data.id);
  await expect(
    f.service.publish(1, { ...f.config, cacheId: cache.id, publicationId: data.id })
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(await readdir(custom)).toEqual(["unrelated.txt"]);
});
