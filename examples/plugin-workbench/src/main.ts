import assert from "node:assert/strict";
import { PluginHost } from "@tau/plugins/host";
import { createFileStorage } from "@tau/plugins/node";
import { notesPlugin } from "./plugin";

const [mode, directory] = process.argv.slice(2);
if ((mode !== "write" && mode !== "read") || !directory) {
  throw new Error("请通过 demo.mjs 运行独立进程持久化示例");
}
const host = new PluginHost({ workspaceId: "demo", storage: createFileStorage({ directory }) });
try {
  host.registerTrusted(notesPlugin);
  await host.enable(notesPlugin.id);
  console.log("已启用", host.listCommands());
  if (mode === "write") {
    await host.executeCommand("example.notes:remember", { text: "插件 API 已接通" });
  }
  await host.disable(notesPlugin.id);
  assert.equal(host.listCommands().length, 0);
  await host.enable(notesPlugin.id);
  const remembered = await host.executeCommand("example.notes:recall");
  assert.deepEqual(remembered, { text: "插件 API 已接通" });
  console.log(mode === "write" ? "停用后重新启用，数据仍在" : "新进程从磁盘恢复成功", remembered);
} finally {
  await host.dispose();
}
