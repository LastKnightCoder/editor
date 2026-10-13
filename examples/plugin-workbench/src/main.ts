import assert from "node:assert/strict";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { notesPlugin } from "./plugin";

const host = new PluginHost({ workspaceId: "demo", storage: createMemoryStorage() });
try {
  host.registerTrusted(notesPlugin);
  await host.enable(notesPlugin.id);
  console.log("已启用", host.listCommands());
  await host.executeCommand("example.notes:remember", { text: "插件 API 已接通" });
  await host.disable(notesPlugin.id);
  assert.equal(host.listCommands().length, 0);
  await host.enable(notesPlugin.id);
  const remembered = await host.executeCommand("example.notes:recall");
  assert.deepEqual(remembered, { text: "插件 API 已接通" });
  console.log("停用后重新启用，数据仍在", remembered);
} finally {
  await host.dispose();
}
