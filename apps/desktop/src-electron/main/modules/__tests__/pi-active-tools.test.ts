/**
 * 活跃工具集收敛（M3-c）：pi 的工具注册表装配后不可追加定义，所以桥接工具按全集注册、
 * 用启用名单取子集。工具定义渲染在请求最前，集合没变必须原地不动（否则白丢提示缓存）。
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fauxProvider, fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import {
  applyActiveTools,
  assembleHostSession,
  createFauxModelRuntime,
} from "../pi-session-host-core";

// jsdom 环境的 AbortSignal 缺 any()（见 pi-session-host-core.test.ts）
if (typeof AbortSignal.any !== "function") {
  Object.assign(AbortSignal, {
    any(signals: AbortSignal[]): AbortSignal {
      const controller = new AbortController();
      for (const signal of signals) {
        if (signal.aborted) {
          controller.abort(signal.reason);
          break;
        }
        signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
      }
      return controller.signal;
    },
  });
}

const bridgedTool = (name: string): ToolDefinition =>
  ({
    name,
    label: name,
    description: name,
    parameters: { type: "object", properties: {} },
    execute: async () => ({ content: [{ type: "text", text: "ok" }] }),
  }) as unknown as ToolDefinition;

const fakeSession = (active: string[]) => {
  const setActiveToolsByName = vi.fn();
  return {
    session: { getActiveToolNames: () => active, setActiveToolsByName },
    setActiveToolsByName,
  };
};

describe("活跃工具集收敛", () => {
  it("只摘桥接工具，内置活跃默认原样保留", () => {
    const { session, setActiveToolsByName } = fakeSession([
      "read",
      "powershell",
      "edit",
      "write",
      "alpha",
      "beta",
    ]);
    applyActiveTools(session, new Set(["alpha", "beta"]), ["alpha"]);
    expect(setActiveToolsByName).toHaveBeenCalledWith([
      "read",
      "powershell",
      "edit",
      "write",
      "alpha",
    ]);
  });

  it("集合未变则不调用，避免白丢提示缓存", () => {
    const { session, setActiveToolsByName } = fakeSession(["read", "alpha"]);
    applyActiveTools(session, new Set(["alpha"]), ["alpha"]);
    expect(setActiveToolsByName).not.toHaveBeenCalled();
  });

  it("重新启用已注册的工具无需重建会话", () => {
    const { session, setActiveToolsByName } = fakeSession(["read", "alpha"]);
    applyActiveTools(session, new Set(["alpha", "beta"]), ["alpha", "beta"]);
    expect(setActiveToolsByName).toHaveBeenCalledWith(["read", "alpha", "beta"]);
  });

  it("真实 pi 会话：customTools 默认全活跃，停用项可摘除且内置默认不受影响", async () => {
    const workDir = mkdtempSync(join(tmpdir(), "pi-active-tools-"));
    let session: Awaited<ReturnType<typeof assembleHostSession>> | undefined;
    try {
      const faux = fauxProvider({});
      faux.setResponses([fauxAssistantMessage([fauxText("好")])]);
      const modelRuntime = await createFauxModelRuntime(join(workDir, "auth.json"), faux);
      session = await assembleHostSession({
        cwd: workDir,
        agentDir: join(workDir, ".pi-agent"),
        modelRuntime,
        modelRef: { providerId: faux.provider.id, modelId: faux.getModel().id },
        customTools: [bridgedTool("alpha"), bridgedTool("beta")],
      });

      // 注册全集含默认不活跃的内置工具；桥接工具默认活跃
      expect(session.getAllTools().map(tool => tool.name)).toEqual(
        expect.arrayContaining(["grep", "find", "ls", "alpha", "beta"])
      );
      const initial = session.getActiveToolNames();
      expect(initial).toContain("alpha");
      expect(initial).toContain("beta");
      expect(initial).not.toContain("grep");

      applyActiveTools(session, new Set(["alpha", "beta"]), ["alpha"]);
      const afterDisable = session.getActiveToolNames();
      expect(afterDisable).toContain("alpha");
      expect(afterDisable).not.toContain("beta");
      // 内置活跃默认不受牵连，仍不包含默认不活跃的 grep
      expect(afterDisable).toEqual(initial.filter(name => name !== "beta"));

      applyActiveTools(session, new Set(["alpha", "beta"]), ["alpha", "beta"]);
      expect(session.getActiveToolNames()).toEqual(expect.arrayContaining(["alpha", "beta"]));
    } finally {
      await session?.abort();
      session?.dispose();
      rmSync(workDir, { recursive: true, force: true });
    }
  });
});
