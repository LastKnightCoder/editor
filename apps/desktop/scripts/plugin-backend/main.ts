import { app, utilityProcess } from "electron";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  PluginBackendManager,
  type BackendDescriptor,
} from "../../src-electron/main/services/plugin-backend/manager";
import { terminateBackendChild } from "../../src-electron/main/services/plugin-backend/terminate";
import { runBackendTool } from "../../src-electron/main/services/plugin-backend/tools";
import { readFile } from "node:fs/promises";

app.setPath("userData", process.env.TAU_BACKEND_TEST_DIRECTORY!);
void app.whenReady().then(async () => {
  const host = new PluginBackendManager({
    authorized: async () => true,
    terminate: terminateBackendChild,
    runTool: runBackendTool,
    spawn: descriptor =>
      utilityProcess.fork(path.join(__dirname, "worker.cjs"), [], {
        cwd: descriptor.cwd,
        env: {},
        stdio: "pipe",
      }),
    requestMs: 1500,
    startupMs: 5000,
    cleanupMs: 500,
  });
  const code = `
    const { defineBackend } = require('@tau/plugins/backend');
    module.exports.default = defineBackend({ create() { return { activate(ctx) {
      const schema = { parse: value => value };
      ctx.rpc.register('identity', { input: schema, output: schema }, () => ({ pid: process.pid, pluginId: ctx.pluginId, workspaceId: ctx.workspaceId }));
      ctx.rpc.register('hang', { input: schema, output: schema }, () => { while (true) {} });
      ctx.rpc.register('crash', { input: schema, output: schema }, () => process.exit(7));
      ctx.rpc.register('tool', { input: schema, output: schema }, async () => ctx.process.run('print', ['中文参数']));
      ctx.rpc.register('wait', { input: schema, output: schema }, (_input, { signal }) => new Promise(resolve => signal.addEventListener('abort', () => resolve('cancelled'), { once: true })));
    } }; } });
  `;
  const descriptor: BackendDescriptor = {
    key: "example.backend:application",
    digest: "a".repeat(64),
    code,
    cwd: process.env.TAU_BACKEND_TEST_DIRECTORY!,
    workspaceId: null,
    manifest: {
      id: "example.backend",
      name: "验证",
      version: "1.0.0",
      apiVersion: 1,
      formatVersion: 2,
      platform: "desktop",
      format: "cjs",
      main: "main.js",
      backend: {
        entry: "backend.js",
        runtime: "node",
        apiVersion: 1,
        scope: "application",
        activation: "on-demand",
        lifetime: "idle",
        reason: "验证",
        systemAccess: ["process"],
        tools: [{ id: "print", command: "/usr/bin/printf", args: ["%s"] }],
      },
      integrity: { "backend.js": createHash("sha256").update(code).digest("hex") },
    },
  };
  try {
    await Promise.all([host.start(descriptor), host.start(descriptor)]);
    const identity = (await host.call(descriptor, "identity", null)) as {
      pid: number;
      pluginId: string;
    };
    assert.notEqual(identity.pid, process.pid);
    assert.equal(identity.pluginId, descriptor.manifest.id);
    if (process.platform !== "win32") {
      const output = (await host.call(descriptor, "tool", null)) as {
        exitCode: number;
        stdout: string;
      };
      assert.equal(output.exitCode, 0);
      assert.equal(output.stdout, "中文参数");
    }
    const controller = new AbortController();
    const waiting = host.call(descriptor, "wait", null, controller.signal);
    const cancelled = assert.rejects(waiting, /取消/);
    setTimeout(() => controller.abort(), 50);
    await cancelled;
    await assert.rejects(host.call(descriptor, "crash", null), /退出/);
    await host.call(descriptor, "identity", null);
    await assert.rejects(host.call(descriptor, "hang", null), /超时/);
    await host.call(descriptor, "identity", null);
    await host.stopPlugin(descriptor.manifest.id);
    assert.equal(host.state(descriptor.key).state, "stopped");
    if (process.env.TAU_BACKEND_EXAMPLE_FILE) {
      const example = await readFile(process.env.TAU_BACKEND_EXAMPLE_FILE, "utf8");
      const source = {
        ...descriptor,
        code: example,
        digest: "c".repeat(64),
        manifest: {
          ...descriptor.manifest,
          integrity: { "backend.js": createHash("sha256").update(example).digest("hex") },
        },
      };
      const result = (await host.call(source, "system.info", null)) as {
        platform: string;
        pid: number;
      };
      assert.equal(result.platform, process.platform);
      assert.notEqual(result.pid, process.pid);
      console.log("[plugin-backend] 独立作者公开 SDK 产物真实调用通过");
    }
    console.log("[plugin-backend] 独立 PID、并发启动、取消、崩溃恢复、死循环回收、停止通过");
    await host.dispose();
    app.exit(0);
  } catch (error) {
    console.error(error);
    await host.dispose();
    app.exit(1);
  }
});
