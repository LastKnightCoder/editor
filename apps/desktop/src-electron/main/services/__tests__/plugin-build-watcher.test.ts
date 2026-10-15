// @vitest-environment node
import { mkdtemp, mkdir, writeFile, rename, rm, symlink, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PluginBuildWatcher } from "../plugin-build-watcher";

let base: string;
let root: string;
const id = "example.watch";
const watchers: PluginBuildWatcher[] = [];
beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), "tau-watch-"));
  root = path.join(base, "dist");
  await mkdir(root);
});
afterEach(async () => {
  watchers.splice(0).forEach(item => item.close());
  await rm(base, { recursive: true, force: true });
});
const pause = () => new Promise(resolve => setTimeout(resolve, 220));
async function build(name: string) {
  const directory = path.join(root, name);
  await mkdir(directory);
  const code = `throw new Error('${name} 读取时不应执行');`;
  await writeFile(path.join(directory, "main.js"), code);
  await writeFile(
    path.join(directory, "manifest.json"),
    JSON.stringify({
      formatVersion: 1,
      apiVersion: 1,
      id,
      name: "监听样本",
      version: "1.0.0",
      platform: "desktop",
      format: "cjs",
      main: "main.js",
      integrity: { "main.js": createHash("sha256").update(code).digest("hex") },
    })
  );
}
async function publish(name: string) {
  const temporary = path.join(root, "pointer.tmp");
  await writeFile(
    temporary,
    JSON.stringify({ formatVersion: 1, id, buildId: name, directory: name })
  );
  await rename(temporary, path.join(root, `tau-build-${id}.json`));
}
async function start() {
  const notify = vi.fn();
  const watcher = new PluginBuildWatcher(root, id, notify);
  watchers.push(watcher);
  await watcher.start();
  return { watcher, notify };
}

it("不回放已有指针，暂存和无关文件不触发，完整发布只通知一次", async () => {
  await build("old");
  await publish("old");
  const { watcher, notify } = await start();
  await mkdir(path.join(root, ".building-incomplete"));
  await writeFile(path.join(root, ".building-incomplete/main.js"), "partial");
  await writeFile(path.join(root, "tau-build-other.json"), "{}");
  await build("next");
  await pause();
  expect(notify).not.toHaveBeenCalled();
  await publish("next");
  await vi.waitFor(() => expect(notify).toHaveBeenCalledOnce());
  const revision = notify.mock.calls[0][0].buildId;
  expect(watcher.get(revision)?.artifact.code).toContain("next");
  await publish("next");
  await pause();
  expect(notify).toHaveBeenCalledOnce();
  watcher.close();
  await build("later");
  await publish("later");
  await pause();
  expect(notify).toHaveBeenCalledOnce();
  expect(watcher.get(revision)).toBeUndefined();
});

it("不完整发布报错但继续监听，后续好版本可以恢复", async () => {
  const { watcher, notify } = await start();
  await build("broken");
  await writeFile(path.join(root, "broken/main.js"), "changed");
  await publish("broken");
  await vi.waitFor(() => expect(notify.mock.calls[0]?.[0].error).toContain("不完整"));
  await build("fixed");
  await publish("fixed");
  await vi.waitFor(() => expect(notify.mock.calls[1]?.[0].buildId).toBeTypeOf("string"));
  expect(watcher.get(notify.mock.calls[1][0].buildId)?.directory).toBe(
    await realpath(path.join(root, "fixed"))
  );
});

it("拒绝指向监听根目录外的符号链接", async () => {
  const { notify } = await start();
  await symlink(base, path.join(root, "escape"));
  await publish("escape");
  await vi.waitFor(() => expect(notify.mock.calls[0]?.[0].error).toContain("越出监听范围"));
});

it("启动期间取消不留下原生监听", async () => {
  const notify = vi.fn();
  const watcher = new PluginBuildWatcher(root, id, notify);
  watchers.push(watcher);
  const pending = watcher.start();
  watcher.close();
  await pending;
  await build("later");
  await publish("later");
  await pause();
  expect(notify).not.toHaveBeenCalled();
});
