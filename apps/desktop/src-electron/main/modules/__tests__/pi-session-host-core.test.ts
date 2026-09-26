/**
 * PiSessionHost 端到端（faux 驱动，无需真实网关）：
 * 装配链 createHostModelRuntime + assembleHostSession → prompt → 工具真实执行 → 事件流断言。
 * 与 M0 冒烟（scripts/pi-smoke.mjs）同模式，但走 host core 的产品装配路径（零资源发现 + inMemory 会话）。
 */
import { mkdtempSync, rmSync, existsSync, readFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import http from "node:http";
import { AddressInfo } from "node:net";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fauxProvider, fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import {
  assembleHostSession,
  createFauxModelRuntime,
  createHostModelRuntime,
  detectBashShellPath,
} from "../pi-session-host-core";
import type { LLMProviderSetting } from "@/types/pi-llm";

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

  // 端到端钉死图片链路责任边界：read 工具读图（photon resize）→ openai-completions 线协议把
  // toolResult 里的图片合成 user 消息（image_url data URL）随下一轮请求发出——网关收不到图
  // 即网关/模型侧不支持视觉，与本桥无关
  it("read 图片后下一轮请求体携带合成 user 消息与 image_url", async () => {
    const workDir = mkdtempSync(join(tmpdir(), "pi-host-img-"));
    const agentDir = join(workDir, ".pi-agent");
    const imageFile = join(workDir, "照片.png");
    copyFileSync(join(process.cwd(), "src", "assets", "logo.png"), imageFile);

    // 两轮响应：先调 read 读图，后给最终文本
    const requests: Record<string, any>[] = [];
    const sse = (delta: Record<string, unknown>, finish: string | null) =>
      `data: ${JSON.stringify({ id: "1", object: "chat.completion.chunk", created: 0, model: "m", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    const server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", c => (raw += c));
      req.on("end", () => {
        const body = JSON.parse(raw || "{}");
        requests.push(body);
        res.writeHead(200, { "content-type": "text/event-stream" });
        if (requests.length === 1) {
          res.write(
            sse(
              {
                role: "assistant",
                tool_calls: [
                  {
                    index: 0,
                    id: "c1",
                    type: "function",
                    function: { name: "read", arguments: JSON.stringify({ path: imageFile }) },
                  },
                ],
              },
              null
            )
          );
          res.write(sse({}, "tool_calls"));
        } else {
          res.write(sse({ role: "assistant" }, null));
          res.write(sse({ content: "看到了。" }, null));
          res.write(sse({}, "stop"));
        }
        res.write("data: [DONE]\n\n");
        res.end();
      });
    });
    await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;

    try {
      const setting: LLMProviderSetting = {
        id: "img-gw",
        name: "img",
        baseUrl: `http://127.0.0.1:${port}/v1`,
        apiKey: "test",
        api: "openai-completions",
        models: [
          {
            id: "m",
            reasoning: false,
            input: ["text", "image"],
            contextWindow: 65536,
            maxTokens: 4096,
          },
        ],
      };
      const modelRuntime = await createHostModelRuntime(join(agentDir, "auth.json"), [setting]);
      const session = await assembleHostSession({
        cwd: workDir,
        agentDir,
        modelRuntime,
        modelRef: { providerId: "img-gw", modelId: "m" },
      });
      try {
        await session.prompt("看这张图");
      } finally {
        session.dispose();
      }

      expect(requests.length).toBeGreaterThanOrEqual(2);
      const second = requests[1];
      expect(second.model).toBe("m");
      // 工具结果消息（文本占位）+ 合成 user 消息携带 image_url data URL
      const toolMsg = second.messages.find((m: { role: string }) => m.role === "tool");
      expect(typeof toolMsg?.content).toBe("string");
      const imageUserMsg = second.messages.find(
        (m: { role: string; content?: unknown }) =>
          m.role === "user" &&
          Array.isArray(m.content) &&
          m.content.some((b: { type?: string }) => b.type === "image_url")
      );
      expect(imageUserMsg).toBeTruthy();
      const imageBlock = imageUserMsg.content.find(
        (b: { type?: string }) => b.type === "image_url"
      );
      expect(String(imageBlock.image_url.url)).toMatch(/^data:image\//);
    } finally {
      await new Promise<void>(r => server.close(() => r()));
      rmSync(workDir, { recursive: true, force: true });
    }
  });
});
