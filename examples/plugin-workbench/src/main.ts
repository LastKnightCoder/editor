import assert from "node:assert/strict";
import { PluginHost } from "@tau/plugins/host";
import { createFileStorage } from "@tau/plugins/node";
import { notesPlugin } from "./plugin";

const [mode, directory] = process.argv.slice(2);
if (!["write", "read", "delete", "verify-delete"].includes(mode) || !directory) {
  throw new Error("请通过 demo.mjs 运行独立进程持久化示例");
}
const host = new PluginHost({ workspaceId: "demo", storage: createFileStorage({ directory }) });
try {
  host.registerTrusted(notesPlugin);
  await host.enable(notesPlugin.id);
  await host.enable(notesPlugin.id);
  assert.equal(await host.executeCommand("example.notes:session-count"), 1);
  assert.equal(await host.executeCommand("example.notes:session-count"), 2);
  console.log("已启用", host.listCommands());
  if (mode === "write") {
    await host.executeCommand("example.notes:remember", { text: "插件 API 已接通" });
  }
  if (mode === "delete") {
    assert.deepEqual(await host.executeCommand("example.notes:recall"), {
      text: "插件 API 已接通",
    });
    await host.executeCommand("example.notes:forget");
  }
  await host.disable(notesPlugin.id);
  assert.equal(host.listCommands().length, 0);
  await host.enable(notesPlugin.id);
  assert.equal(await host.executeCommand("example.notes:session-count"), 1);
  const remembered = await host.executeCommand("example.notes:recall");
  assert.deepEqual(
    remembered,
    mode === "delete" || mode === "verify-delete" ? null : { text: "插件 API 已接通" }
  );
  console.log(`流程阶段 ${mode} 通过：实例重新创建，私有数据符合预期`, remembered);
} finally {
  await host.dispose();
}
