/**
 * PiSessionHost 端到端（faux 驱动，无需真实网关）：
 * 装配链 createHostModelRuntime + assembleHostSession → prompt → 工具真实执行 → 事件流断言。
 * 与 M0 冒烟（scripts/pi-smoke.mjs）同模式，但走 host core 的产品装配路径（零资源发现 + inMemory 会话）。
 */
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fauxProvider, fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import {
  assembleHostSession,
  createFauxModelRuntime,
  detectBashShellPath,
} from "../pi-session-host-core";

// 本机 Git 装在非标准路径（D:\软件\Git）且注册表未写，探测候选不含它——测试环境显式兜底
{
  const localBash = ["D:\\软件\\Git\\bin\\bash.exe"].find(p => existsSync(p));
  if (localBash && !process.env.PI_SMOKE_SHELL) process.env.PI_SMOKE_SHELL = localBash;
}

// jsdom 环境的 AbortSignal 缺 any()（Node 24 / Electron 主进程原生可用）；pi 的 ModelRuntime.create 依赖它
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

describe("pi-session-host-core", () => {
  it("faux 端到端：装配 → prompt → bash/write/read 真实执行 → agent_settled", async () => {
    const workDir = mkdtempSync(join(tmpdir(), "pi-host-测试-"));
    const agentDir = join(workDir, ".pi-agent");
    try {
      const faux = fauxProvider({});
      faux.setResponses([
        fauxAssistantMessage([fauxToolCall("bash", { command: "echo 主进程工具" })], {
          stopReason: "toolUse",
        }),
        fauxAssistantMessage(
          [fauxToolCall("write", { path: "主机落盘.md", content: "harness 落盘内容\n" })],
          { stopReason: "toolUse" }
        ),
        fauxAssistantMessage([fauxText("骨架验证完成。")]),
      ]);
      const modelRuntime = await createFauxModelRuntime(join(agentDir, "auth.json"), faux);

      const session = await assembleHostSession({
        cwd: workDir,
        agentDir,
        modelRuntime,
        modelRef: { providerId: faux.provider.id, modelId: faux.getModel().id },
        sessionDir: undefined,
        systemPrompt: "你是宿主装配的测试会话",
        shellPath: detectBashShellPath(),
      });

      const events: AgentSessionEvent[] = [];
      const toolRuns: { name: string; ok: boolean | null }[] = [];
      let finalText = "";
      const unsubscribe = session.subscribe(event => {
        events.push(event);
        if (event.type === "tool_execution_start")
          toolRuns.push({ name: event.toolName, ok: null });
        if (event.type === "tool_execution_end") {
          const run = toolRuns[toolRuns.length - 1];
          if (run) run.ok = !event.isError;
        }
        if (event.type === "message_end" && event.message?.role === "assistant") {
          const text = (event.message.content ?? [])
            .filter(b => b.type === "text")
            .map(b => (b as { text: string }).text)
            .join("");
          if (text) finalText = text;
        }
      });
      try {
        await session.prompt("跑主机装配验证");
      } finally {
        unsubscribe();
        session.dispose();
      }

      expect(events.some(e => e.type === "agent_settled")).toBe(true);
      const bashRun = toolRuns.find(r => r.name === "bash");
      expect(bashRun?.ok).toBe(true);
      expect(toolRuns.find(r => r.name === "write")?.ok).toBe(true);
      const written = join(workDir, "主机落盘.md");
      expect(existsSync(written)).toBe(true);
      expect(readFileSync(written, "utf8")).toContain("harness 落盘内容");
      expect(finalText).toContain("骨架验证完成");
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  it("模型未注册时装配报可诊断错误", async () => {
    const workDir = mkdtempSync(join(tmpdir(), "pi-host-err-"));
    try {
      const faux = fauxProvider({});
      const modelRuntime = await createFauxModelRuntime(join(workDir, "auth.json"), faux);
      await expect(
        assembleHostSession({
          cwd: workDir,
          agentDir: join(workDir, ".pi-agent"),
          modelRuntime,
          modelRef: { providerId: "不存在的", modelId: "任意" },
        })
      ).rejects.toThrow("模型未注册");
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  it("全部 AgentSessionEvent 可通过 IPC 结构化克隆（pi-session-event 通道契约）", async () => {
    const workDir = mkdtempSync(join(tmpdir(), "pi-host-clone-"));
    const agentDir = join(workDir, ".pi-agent");
    try {
      const faux = fauxProvider({});
      faux.setResponses([
        fauxAssistantMessage([fauxToolCall("bash", { command: "echo 克隆验证" })], {
          stopReason: "toolUse",
        }),
        fauxAssistantMessage([fauxText("克隆完成。")]),
      ]);
      const modelRuntime = await createFauxModelRuntime(join(agentDir, "auth.json"), faux);
      const session = await assembleHostSession({
        cwd: workDir,
        agentDir,
        modelRuntime,
        modelRef: { providerId: faux.provider.id, modelId: faux.getModel().id },
        shellPath: detectBashShellPath(),
      });
      const events: AgentSessionEvent[] = [];
      const unsubscribe = session.subscribe(event => events.push(event));
      try {
        await session.prompt("克隆验证");
      } finally {
        unsubscribe();
        session.dispose();
      }
      expect(events.length).toBeGreaterThan(0);
      for (const event of events) {
        expect(() => structuredClone(event), `事件不可克隆：${event.type}`).not.toThrow();
      }
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  it("无 shellPath 时默认工具切 powershell（bash 不启用，避免落到 WSL 入口）", async () => {
    const workDir = mkdtempSync(join(tmpdir(), "pi-host-ps-"));
    const agentDir = join(workDir, ".pi-agent");
    try {
      const faux = fauxProvider({});
      faux.setResponses([
        fauxAssistantMessage([fauxToolCall("bash", { command: "echo x" })], {
          stopReason: "toolUse",
        }),
        fauxAssistantMessage([fauxToolCall("powershell", { command: "Write-Output ps-兜底-ok" })], {
          stopReason: "toolUse",
        }),
        fauxAssistantMessage([fauxText("完成。")]),
      ]);
      const modelRuntime = await createFauxModelRuntime(join(agentDir, "auth.json"), faux);
      const session = await assembleHostSession({
        cwd: workDir,
        agentDir,
        modelRuntime,
        modelRef: { providerId: faux.provider.id, modelId: faux.getModel().id },
      });

      const executions: { name: string; isError: boolean }[] = [];
      const unsubscribe = session.subscribe(event => {
        if (event.type === "tool_execution_end") {
          executions.push({ name: event.toolName, isError: event.isError === true });
        }
      });
      try {
        await session.prompt("无 shellPath 兜底验证");
      } finally {
        unsubscribe();
        session.dispose();
      }

      const bashRun = executions.find(e => e.name === "bash");
      expect(bashRun).toBeTruthy();
      expect(bashRun?.isError).toBe(true);
      const psRun = executions.find(e => e.name === "powershell");
      expect(psRun).toBeTruthy();
      expect(psRun?.isError).toBe(false);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });
});
