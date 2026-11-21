import { test, expect, type ElectronApplication } from "@playwright/test";
import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import {
  availablePort,
  createSandbox,
  disposeSandbox,
  invoke,
  launch,
} from "./content-production/harness";

test("从右侧对话发起画图，左侧出现新节点，主库保留操作身份", async () => {
  test.setTimeout(135000);
  const dir = await createSandbox("tau-agent-whiteboard-ui-"),
    port = await availablePort();
  let running: ElectronApplication | undefined,
    completed = false;
  let releaseFirstBatch!: () => void;
  const firstBatchVisible = new Promise<void>(resolve => {
    releaseFirstBatch = resolve;
  });
  const offered: string[][] = [];
  const server = createServer(async (req, res) => {
    if (req.method !== "POST") {
      res.writeHead(404).end();
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const names = (body.tools ?? []).map((t: { function: { name: string } }) => t.function.name);
    offered.push(names);
    const history = body.messages as { role: string; content: unknown; tool_call_id?: string }[];
    const result = (id: string) =>
      history.find(m => m.role === "tool" && m.tool_call_id === id)?.content;
    const context = result("board-context"),
      written = result("board-write");
    const geometry = { x: 32, y: 32, width: 180, height: 82, rotation: 0 };
    const target = String(context ?? "").match(/"target"\s*:\s*"([^"]+)"/)?.[1];
    const parsed = written && typeof written === "string" ? JSON.parse(written) : undefined;
    const read = result("board-read"),
      changed = result("board-label");
    let tool: { id: string; name: string; args: Record<string, unknown> } | undefined;
    if (!context) tool = { id: "board-context", name: "get_whiteboard_context", args: {} };
    else if (target && !written)
      tool = {
        id: "board-write",
        name: "apply_whiteboard_operations",
        args: {
          target,
          requestId: "ui-test",
          operations: [
            { kind: "shape", id: "step", text: "接单校验", geometry },
            { kind: "text", id: "result", text: "通过", geometry: { ...geometry, x: 310 } },
            { kind: "connect", id: "line", from: "step", to: "result" },
          ],
        },
      };
    else if (parsed?.ids && !read)
      tool = {
        id: "board-read",
        name: "read_whiteboard_elements",
        args: { target, ids: [parsed.ids.result] },
      };
    else if (parsed?.ids && read && !changed)
      tool = {
        id: "board-label",
        name: "apply_whiteboard_operations",
        args: {
          target,
          requestId: "ui-label",
          operations: [{ kind: "label", id: parsed.ids.result, beforeText: "通过", text: "归档" }],
        },
      };
    if (tool?.id === "board-read") await firstBatchVisible;
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    const send = (delta: object, finish_reason: string | null = null) =>
      res.write(
        "data: " +
          JSON.stringify({
            id: "ui",
            object: "chat.completion.chunk",
            created: 1,
            model: "board-test",
            choices: [{ index: 0, delta, finish_reason }],
          }) +
          "\n\n"
      );
    send({ role: "assistant" });
    if (tool) {
      send({
        tool_calls: [
          {
            index: 0,
            id: tool.id,
            type: "function",
            function: { name: tool.name, arguments: JSON.stringify(tool.args) },
          },
        ],
      });
      send({}, "tool_calls");
    } else {
      completed = Boolean(changed);
      send({ content: completed ? "已完成白板编辑" : "读取失败" });
      send({}, "stop");
    }
    res.end("data: [DONE]\n\n");
  });
  try {
    await new Promise<void>(resolve => server.listen(port, "127.0.0.1", resolve));
    const url = "http://127.0.0.1:" + port;
    await writeFile(
      join(dir, "home/.editor/setting.json"),
      JSON.stringify({
        llmProviders: [
          {
            id: "board-test",
            name: "白板联调",
            baseUrl: url + "/v1",
            apiKey: "local-test",
            api: "openai-completions",
            models: [
              {
                id: "board-test",
                name: "白板联调",
                reasoning: false,
                input: ["text"],
                contextWindow: 131072,
                maxTokens: 4096,
              },
            ],
          },
        ],
        llmUsageSettings: { chat: { providerId: "board-test", modelId: "board-test" } },
        agentPermission: { mode: "acceptEdits" },
      })
    );
    const { app } = await launch(
      dir,
      await availablePort(),
      app => {
        running = app;
      },
      url
    );
    const windows = await Promise.all(
      app
        .windows()
        .map(async page => ({ page, role: await page.evaluate(() => window.electron?.windowRole) }))
    );
    const page = windows.find(w => w.role === "main")?.page;
    if (!page)
      throw new Error(
        "未找到主窗口 " + JSON.stringify(windows.map(w => [w.role, w.page.url().split("/").pop()]))
      );
    await invoke(page, "create-or-connect-database", "data.db");
    const paragraph = await prepareContentContract("tau.paragraph", {
      type: "paragraph",
      dataVersion: 1,
      kind: "block",
    });
    await invoke(page, "create-card", {
      tags: [],
      isTop: false,
      count: 0,
      contracts: { [paragraph.id]: paragraph.contract },
      content: [
        { type: "paragraph", tauContract: paragraph.id, children: [{ text: "测试资料库" }] },
      ],
    });
    await page.getByText("白板", { exact: true }).first().click();
    await page.getByRole("button", { name: "新建白板" }).first().click();
    await page.getByPlaceholder("未命名白板").fill("协作验证");
    await page.getByRole("button", { name: "创建并打开" }).click();
    const canvas = page.locator("svg[data-whiteboard-canvas]:visible");
    await expect(canvas).toBeVisible();
    const dock = page.locator('aside[aria-label="AI 对话"]:visible');
    const toggle = page.getByTitle("AI 对话 (Ctrl+J)", { exact: true });
    if (await toggle.count()) await toggle.click();
    const input = dock.locator('[contenteditable="true"]:visible').last();
    await input
      .fill("画接单校验和通过两个步骤，连起来，再把通过改为归档", { timeout: 6000 })
      .catch(async error => {
        console.info("界面状态", await page.locator("body").innerText());
        throw error;
      });
    await dock.getByRole("button", { name: "发送", exact: true }).click({ timeout: 8000 });
    await expect(
      canvas.locator('[data-layer="main-elements"]').getByText("接单校验", { exact: true }).first()
    ).toBeVisible();
    await expect(canvas.locator("[data-whiteboard-presence]").getByText("助手")).toBeVisible();
    releaseFirstBatch();
    await expect
      .poll(() => completed, { timeout: 15000 })
      .toBe(true)
      .catch(async error => {
        console.info(
          "对话结果",
          offered.map(tools => tools.filter(n => n.includes("whiteboard"))),
          await dock.innerText()
        );
        throw error;
      });
    expect(offered[0]).toEqual(
      expect.arrayContaining([
        "get_whiteboard_context",
        "read_whiteboard_elements",
        "apply_whiteboard_operations",
      ])
    );
    await expect(
      canvas.locator('[data-layer="main-elements"]').getByText("接单校验", { exact: true }).first()
    ).toBeVisible();
    await expect(
      canvas.locator('[data-layer="main-elements"]').getByText("归档", { exact: true }).first()
    ).toBeVisible();
    await expect(canvas.locator("[data-whiteboard-presence]").getByText("助手")).toHaveCount(0);
    const db = new DatabaseSync(join(dir, "home/.editor/data.db"), { readOnly: true });
    try {
      const row = db.prepare("SELECT snapshot FROM whiteboard_documents").get();
      const nodes = JSON.parse(String(row?.snapshot)).pages[0].children;
      expect(nodes).toHaveLength(3);
      expect(nodes[2].data.source.bindId).toBe(nodes[0].id);
      expect(nodes[2].data.target.bindId).toBe(nodes[1].id);
      expect(nodes[1].body[0].children[0].text).toBe("归档");
      expect(nodes[0].id).toMatch(/^agent-/);
      expect(nodes[0].geometry.x).toBe(32);
    } finally {
      db.close();
    }
  } finally {
    releaseFirstBatch();
    await disposeSandbox(dir, running);
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
