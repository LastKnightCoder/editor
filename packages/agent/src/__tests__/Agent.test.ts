import { describe, expect, it } from "vitest";

import {
  Agent,
  createAbortError,
  type AgentEvent,
  type AgentMessage,
  type AgentModelAdapter,
  type AgentTool,
  type AgentToolCall,
} from "../index";

const createTextMessage = (text: string): AgentMessage => ({
  role: "user",
  content: [{ type: "text", text }],
});

const createSystemMessage = (text: string): AgentMessage => ({
  role: "system",
  content: [{ type: "text", text }],
});

const collectEvents = async (events: AsyncIterable<AgentEvent>) => {
  const result: AgentEvent[] = [];
  for await (const event of events) {
    result.push(event);
  }
  return result;
};

describe("Agent", () => {
  it("按顺序输出基础事件流", async () => {
    const model: AgentModelAdapter = {
      async *streamTurn() {
        yield { type: "text-delta", delta: "你好" };
        yield { type: "reasoning-delta", delta: "分析中" };
        yield {
          type: "turn-complete",
          result: {
            type: "response",
            content: "你好",
            reasoningContent: "分析中",
            finishReason: "stop",
          },
        };
      },
    };

    const agent = new Agent({ model });
    const events = await collectEvents(
      agent.run({
        messages: [createTextMessage("hello")],
      }),
    );

    expect(events.map((event) => event.type)).toEqual([
      "run-start",
      "turn-start",
      "text-delta",
      "reasoning-delta",
      "turn-finished",
      "run-finished",
    ]);

    const textEvent = events.find(
      (event): event is Extract<AgentEvent, { type: "text-delta" }> =>
        event.type === "text-delta",
    );
    expect(textEvent?.delta).toBe("你好");
    expect(textEvent?.text).toBe("你好");

    const finishEvent = events.find(
      (event): event is Extract<AgentEvent, { type: "run-finished" }> =>
        event.type === "run-finished",
    );
    expect(finishEvent?.content).toBe("你好");
    expect(finishEvent?.reasoningContent).toBe("分析中");
  });

  it("会冻结 tools source snapshot 并在工具调用后继续完成对话", async () => {
    let toolOutput = "initial";
    let turnIndex = 0;

    const model: AgentModelAdapter = {
      async *streamTurn() {
        if (turnIndex === 0) {
          turnIndex += 1;
          yield {
            type: "tool-calls-delta",
            toolCalls: [
              {
                id: "call_1",
                function: {
                  name: "lookup",
                  arguments: '{"query":"demo"}',
                },
              },
            ],
          };
          yield {
            type: "turn-complete",
            result: {
              type: "tool_calls",
              content: "",
              reasoningContent: "",
              finishReason: "tool_calls",
              toolCalls: [
                {
                  id: "call_1",
                  function: {
                    name: "lookup",
                    arguments: '{"query":"demo"}',
                  },
                },
              ],
            },
          };
          return;
        }

        yield {
          type: "turn-complete",
          result: {
            type: "response",
            content: "done",
            reasoningContent: "",
            finishReason: "stop",
          },
        };
      },
    };

    const toolSource = {
      getTools() {
        const outputAtSnapshot = toolOutput;
        const tool: AgentTool = {
          name: "lookup",
          description: "lookup",
          source: "test-tools",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string" },
            },
            required: ["query"],
            additionalProperties: false,
          },
          async execute() {
            return {
              content: outputAtSnapshot,
            };
          },
        };
        return [tool];
      },
    };

    const agent = new Agent({
      model,
      tools: toolSource,
    });

    const iterator = agent.run({
      messages: [createTextMessage("hello")],
      enableTools: true,
    });

    const events: AgentEvent[] = [];
    for await (const event of iterator) {
      events.push(event);
      if (event.type === "tool-call-planned" && event.phase === "preview") {
        toolOutput = "mutated";
      }
    }

    const toolFinished = events.find(
      (event): event is Extract<AgentEvent, { type: "tool-call-finished" }> =>
        event.type === "tool-call-finished",
    );
    expect(toolFinished?.execution.output).toBe("initial");

    const runFinished = events.find(
      (event): event is Extract<AgentEvent, { type: "run-finished" }> =>
        event.type === "run-finished",
    );
    expect(runFinished?.content).toBe("done");
  });

  it("会在瞬时故障时自动重试工具执行", async () => {
    let attempts = 0;
    const toolCalls: AgentToolCall[] = [
      {
        id: "call_retry",
        function: {
          name: "retry_tool",
          arguments: '{"value":1}',
        },
      },
    ];

    const model: AgentModelAdapter = {
      async *streamTurn() {
        if (attempts === 0) {
          yield {
            type: "turn-complete",
            result: {
              type: "tool_calls",
              content: "",
              reasoningContent: "",
              finishReason: "tool_calls",
              toolCalls,
            },
          };
          return;
        }

        yield {
          type: "turn-complete",
          result: {
            type: "response",
            content: "ok",
            reasoningContent: "",
            finishReason: "stop",
          },
        };
      },
    };

    const agent = new Agent({
      model,
      tools: [
        {
          name: "retry_tool",
          description: "retry tool",
          source: "retry-tools",
          parameters: {
            type: "object",
            properties: {
              value: { type: "number" },
            },
            required: ["value"],
            additionalProperties: false,
          },
          async execute() {
            attempts += 1;
            if (attempts < 3) {
              throw new Error("service unavailable");
            }
            return { content: "retried" };
          },
        },
      ],
      policies: {
        maxToolRetries: 2,
        isTransientToolError(error) {
          return error.message.includes("service unavailable");
        },
        retryDelayMs() {
          return 0;
        },
      },
    });

    const events = await collectEvents(
      agent.run({
        messages: [createTextMessage("hello")],
        enableTools: true,
      }),
    );

    const retryEvents = events.filter(
      (event): event is Extract<AgentEvent, { type: "tool-call-updated" }> =>
        event.type === "tool-call-updated" &&
        event.execution.status === "retrying",
    );
    expect(retryEvents).toHaveLength(2);

    const toolFinished = events.find(
      (event): event is Extract<AgentEvent, { type: "tool-call-finished" }> =>
        event.type === "tool-call-finished",
    );
    expect(toolFinished?.execution.status).toBe("success");
    expect(toolFinished?.execution.output).toBe("retried");
  });

  it("工具返回取消结果时应输出 cancelled 执行状态", async () => {
    let turnIndex = 0;
    const toolCalls: AgentToolCall[] = [
      {
        id: "call_cancelled",
        function: {
          name: "slow_tool",
          arguments: "{}",
        },
      },
    ];

    const model: AgentModelAdapter = {
      async *streamTurn() {
        if (turnIndex === 0) {
          turnIndex += 1;
          yield {
            type: "turn-complete",
            result: {
              type: "tool_calls",
              content: "",
              reasoningContent: "",
              finishReason: "tool_calls",
              toolCalls,
            },
          };
          return;
        }

        yield {
          type: "turn-complete",
          result: {
            type: "response",
            content: "cancelled",
            reasoningContent: "",
            finishReason: "stop",
          },
        };
      },
    };

    const agent = new Agent({
      model,
      tools: [
        {
          name: "slow_tool",
          description: "可取消工具",
          source: "test-tools",
          parameters: {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false,
          },
          async execute() {
            return {
              content: "工具执行已取消",
              isCancelled: true,
              metadata: {
                reason: "user_abort",
              },
            };
          },
        },
      ],
    });

    const events = await collectEvents(
      agent.run({
        messages: [createTextMessage("hello")],
        enableTools: true,
      }),
    );

    const toolFinished = events.find(
      (event): event is Extract<AgentEvent, { type: "tool-call-finished" }> =>
        event.type === "tool-call-finished",
    );
    expect(toolFinished?.execution.status).toBe("cancelled");
    expect(toolFinished?.execution.error).toBe("工具执行已取消");
    expect(toolFinished?.execution.metadata).toEqual({
      reason: "user_abort",
    });
  });

  it("工具执行收到 AbortError 时应终止整轮运行", async () => {
    let turnCount = 0;
    const toolCalls: AgentToolCall[] = [
      {
        id: "call_abort",
        function: {
          name: "abort_tool",
          arguments: "{}",
        },
      },
    ];

    const model: AgentModelAdapter = {
      async *streamTurn() {
        turnCount += 1;
        yield {
          type: "turn-complete",
          result: {
            type: "tool_calls",
            content: "",
            reasoningContent: "",
            finishReason: "tool_calls",
            toolCalls,
          },
        };
      },
    };

    const agent = new Agent({
      model,
      tools: [
        {
          name: "abort_tool",
          description: "可中止工具",
          source: "test-tools",
          parameters: {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false,
          },
          async execute() {
            throw createAbortError("用户已停止");
          },
        },
      ],
    });

    const events = await collectEvents(
      agent.run({
        messages: [createTextMessage("hello")],
        enableTools: true,
      }),
    );

    const runError = events.find(
      (event): event is Extract<AgentEvent, { type: "run-error" }> =>
        event.type === "run-error",
    );
    expect(runError?.error).toMatchObject({
      name: "AbortError",
      message: "用户已停止",
    });
    expect(events.some((event) => event.type === "tool-call-finished")).toBe(
      false,
    );
    expect(turnCount).toBe(1);
  });

  it("等待用户确认的工具不应套用默认超时", async () => {
    let turnIndex = 0;
    const toolCalls: AgentToolCall[] = [
      {
        id: "call_confirm",
        function: {
          name: "confirm_tool",
          arguments: "{}",
        },
      },
    ];

    const model: AgentModelAdapter = {
      async *streamTurn() {
        if (turnIndex === 0) {
          turnIndex += 1;
          yield {
            type: "turn-complete",
            result: {
              type: "tool_calls",
              content: "",
              reasoningContent: "",
              finishReason: "tool_calls",
              toolCalls,
            },
          };
          return;
        }

        yield {
          type: "turn-complete",
          result: {
            type: "response",
            content: "confirmed",
            reasoningContent: "",
            finishReason: "stop",
          },
        };
      },
    };

    const agent = new Agent({
      model,
      tools: [
        {
          name: "confirm_tool",
          description: "等待确认的工具",
          source: "test-tools",
          parameters: {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false,
          },
          execution: {
            timeoutMs: null,
          },
          async execute() {
            await new Promise((resolve) => setTimeout(resolve, 20));
            return {
              content: "等待确认完成",
            };
          },
        },
      ],
      policies: {
        defaultToolTimeoutMs: 1,
        maxToolRetries: 0,
      },
    });

    const events = await collectEvents(
      agent.run({
        messages: [createTextMessage("hello")],
        enableTools: true,
      }),
    );

    const toolFinished = events.find(
      (event): event is Extract<AgentEvent, { type: "tool-call-finished" }> =>
        event.type === "tool-call-finished",
    );
    const runFinished = events.find(
      (event): event is Extract<AgentEvent, { type: "run-finished" }> =>
        event.type === "run-finished",
    );

    expect(toolFinished?.execution.status).toBe("success");
    expect(toolFinished?.execution.output).toBe("等待确认完成");
    expect(runFinished?.content).toBe("confirmed");
  });

  it("支持通过 tools 构造参数直接注册内联工具", async () => {
    const seenToolNames: string[][] = [];
    let turnIndex = 0;

    const model: AgentModelAdapter = {
      async *streamTurn(request) {
        seenToolNames.push(
          (request.tools ?? []).map((tool) => tool.function.name),
        );

        if (turnIndex === 0) {
          turnIndex += 1;
          yield {
            type: "turn-complete",
            result: {
              type: "tool_calls",
              content: "",
              reasoningContent: "",
              finishReason: "tool_calls",
              toolCalls: [
                {
                  id: "call_inline_tool",
                  function: {
                    name: "lookup",
                    arguments: '{"query":"agent"}',
                  },
                },
              ],
            },
          };
          return;
        }

        yield {
          type: "turn-complete",
          result: {
            type: "response",
            content: "done",
            reasoningContent: "",
            finishReason: "stop",
          },
        };
      },
    };

    const agent = new Agent({
      model,
      tools: [
        {
          name: "lookup",
          description: "lookup",
          source: "inline-tools",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string" },
            },
            required: ["query"],
            additionalProperties: false,
          },
          async execute(args) {
            return {
              content: `inline:${String(args.query)}`,
            };
          },
        },
      ],
    });

    const events = await collectEvents(
      agent.run({
        messages: [createTextMessage("hello")],
        enableTools: true,
      }),
    );

    expect(seenToolNames[0]).toEqual(["lookup"]);

    const toolFinished = events.find(
      (event): event is Extract<AgentEvent, { type: "tool-call-finished" }> =>
        event.type === "tool-call-finished",
    );
    expect(toolFinished?.execution.output).toBe("inline:agent");
  });

  it("工具续轮保留模型供应商元数据", async () => {
    const providerMetadata = {
      claude: {
        content: [
          {
            type: "thinking",
            thinking: "先分析",
            signature: "signed-thinking",
          },
        ],
      },
    };
    let turnIndex = 0;
    let secondTurnMessages: AgentMessage[] = [];
    const model: AgentModelAdapter = {
      async *streamTurn(request) {
        if (turnIndex === 0) {
          turnIndex += 1;
          yield {
            type: "turn-complete",
            result: {
              type: "tool_calls",
              content: "",
              reasoningContent: "先分析",
              providerMetadata,
              finishReason: "tool_calls",
              toolCalls: [
                {
                  id: "call_provider_metadata",
                  function: { name: "lookup", arguments: "{}" },
                },
              ],
            },
          };
          return;
        }

        secondTurnMessages = request.messages;
        yield {
          type: "turn-complete",
          result: {
            type: "response",
            content: "done",
            reasoningContent: "",
            finishReason: "stop",
          },
        };
      },
    };
    const agent = new Agent({
      model,
      tools: [
        {
          name: "lookup",
          description: "lookup",
          source: "test",
          parameters: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          async execute() {
            return "ok";
          },
        },
      ],
    });

    await collectEvents(
      agent.run({
        messages: [createTextMessage("hello")],
        enableTools: true,
      }),
    );

    expect(
      secondTurnMessages.find((message) => message.role === "assistant")
        ?.provider_metadata,
    ).toEqual(providerMetadata);
  });

  it("仅在传入 skills 时注入内置 skill 工具", async () => {
    const seenToolNames: string[][] = [];
    let turnIndex = 0;

    const model: AgentModelAdapter = {
      async *streamTurn(request) {
        seenToolNames.push(
          (request.tools ?? []).map((tool) => tool.function.name),
        );

        if (turnIndex === 0) {
          turnIndex += 1;
          yield {
            type: "turn-complete",
            result: {
              type: "tool_calls",
              content: "",
              reasoningContent: "",
              finishReason: "tool_calls",
              toolCalls: [
                {
                  id: "call_list_skills",
                  function: {
                    name: "list_skills",
                    arguments: "{}",
                  },
                },
                {
                  id: "call_get_skill_readme",
                  function: {
                    name: "get_skill_readme",
                    arguments: '{"folderName":"code-review"}',
                  },
                },
                {
                  id: "call_get_skill_tree",
                  function: {
                    name: "get_skill_tree",
                    arguments: '{"folderName":"code-review"}',
                  },
                },
                {
                  id: "call_read_skill_file",
                  function: {
                    name: "read_skill_file",
                    arguments:
                      '{"folderName":"code-review","relativePath":"templates/checklist.md"}',
                  },
                },
              ],
            },
          };
          return;
        }

        yield {
          type: "turn-complete",
          result: {
            type: "response",
            content: "skills-done",
            reasoningContent: "",
            finishReason: "stop",
          },
        };
      },
    };

    const agent = new Agent({
      model,
      skills: [
        {
          id: "skill-code-review",
          folderName: "code-review",
          name: "代码评审",
          description: "用于代码评审",
          readme: "# 代码评审\n请按风险优先输出结论。",
          files: [
            {
              path: "templates/checklist.md",
              content: "- 检查异常路径\n- 检查回归风险",
            },
          ],
        },
      ],
    });

    const events = await collectEvents(
      agent.run({
        messages: [createTextMessage("hello")],
        enableTools: true,
      }),
    );

    expect(seenToolNames[0]).toContain("list_skills");
    expect(seenToolNames[0]).toContain("get_skill_readme");
    expect(seenToolNames[0]).toContain("get_skill_tree");
    expect(seenToolNames[0]).toContain("read_skill_file");

    const skillExecutions = events.filter(
      (event): event is Extract<AgentEvent, { type: "tool-call-finished" }> =>
        event.type === "tool-call-finished",
    );
    expect(skillExecutions).toHaveLength(4);

    const listedSkills = JSON.parse(
      skillExecutions[0].execution.output ?? "{}",
    );
    expect(listedSkills.skills).toEqual([
      {
        id: "skill-code-review",
        folderName: "code-review",
        name: "代码评审",
        description: "用于代码评审",
      },
    ]);

    const readmePayload = JSON.parse(
      skillExecutions[1].execution.output ?? "{}",
    );
    expect(readmePayload.content).toContain("风险优先");

    expect(skillExecutions[2].execution.output).toContain("templates");

    const filePayload = JSON.parse(skillExecutions[3].execution.output ?? "{}");
    expect(filePayload.content).toContain("回归风险");
  });

  it("未传入 skills 时不会注入 skill 内置工具", async () => {
    const seenToolNames: string[][] = [];

    const model: AgentModelAdapter = {
      async *streamTurn(request) {
        seenToolNames.push(
          (request.tools ?? []).map((tool) => tool.function.name),
        );
        yield {
          type: "turn-complete",
          result: {
            type: "response",
            content: "done",
            reasoningContent: "",
            finishReason: "stop",
          },
        };
      },
    };

    const agent = new Agent({
      model,
      tools: [
        {
          name: "search_docs",
          description: "search docs",
          source: "inline-tools",
          parameters: {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false,
          },
          async execute() {
            return { content: "ok" };
          },
        },
      ],
    });

    await collectEvents(
      agent.run({
        messages: [createTextMessage("hello")],
        enableTools: true,
      }),
    );

    expect(seenToolNames[0]).toEqual(["search_docs"]);
    expect(seenToolNames[0]).not.toContain("list_skills");
    expect(seenToolNames[0]).not.toContain("get_skill_readme");
    expect(seenToolNames[0]).not.toContain("get_skill_tree");
    expect(seenToolNames[0]).not.toContain("read_skill_file");
  });

  it("会将 skills prompt 作为独立 system message 注入到首个 system message 之后", async () => {
    const seenMessages: AgentMessage[][] = [];

    const model: AgentModelAdapter = {
      async *streamTurn(request) {
        seenMessages.push(request.messages);
        yield {
          type: "turn-complete",
          result: {
            type: "response",
            content: "done",
            reasoningContent: "",
            finishReason: "stop",
          },
        };
      },
    };

    const agent = new Agent({
      model,
      skills: [
        {
          folderName: "code-review",
          name: "代码评审",
          description: "用于风险导向代码评审",
          path: "internal://code-review",
          readmeContent: "# 代码评审",
        },
      ],
    });

    await collectEvents(
      agent.run({
        messages: [
          createSystemMessage("base-system"),
          createSystemMessage("extra-policy"),
          createTextMessage("hello"),
        ],
      }),
    );

    expect(seenMessages).toHaveLength(1);
    expect(seenMessages[0]?.map((message) => message.role)).toEqual([
      "system",
      "system",
      "system",
      "user",
    ]);

    const injectedMessage = seenMessages[0]?.[1];
    expect(injectedMessage?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("## 可用 Skills"),
        }),
      ]),
    );
    expect(
      (injectedMessage?.content as Array<{ type: "text"; text: string }>)[0]
        ?.text,
    ).toContain("code-review");
    expect(
      (
        seenMessages[0]?.[2]?.content as Array<{ type: "text"; text: string }>
      )[0]?.text,
    ).toBe("extra-policy");
  });

  it("支持 skill contributor 与全局 contributor 按顺序改写消息", async () => {
    const seenMessages: AgentMessage[][] = [];

    const model: AgentModelAdapter = {
      async *streamTurn(request) {
        seenMessages.push(request.messages);
        yield {
          type: "turn-complete",
          result: {
            type: "response",
            content: "done",
            reasoningContent: "",
            finishReason: "stop",
          },
        };
      },
    };

    const agent = new Agent({
      model,
      skills: [
        {
          folderName: "memory",
          name: "记忆",
          description: "提供记忆注入",
          readmeContent: "# memory",
          contributors: [
            {
              id: "skill-memory-contributor",
              order: 50,
              stage: "run-init",
              contribute(context) {
                context.state.messages = [
                  createSystemMessage("skill-memory"),
                  ...context.state.messages,
                ];
              },
            },
          ],
        },
      ],
      contributors: [
        {
          id: "global-policy-contributor",
          order: 150,
          stage: "run-init",
          contribute(context) {
            const lastSystemIndex = context.state.messages.reduce(
              (index, message, currentIndex) =>
                message.role === "system" ? currentIndex : index,
              -1,
            );
            context.state.messages = [
              ...context.state.messages.slice(0, lastSystemIndex + 1),
              createSystemMessage("global-policy"),
              ...context.state.messages.slice(lastSystemIndex + 1),
            ];
          },
        },
      ],
    });

    await collectEvents(
      agent.run({
        messages: [createTextMessage("hello")],
      }),
    );

    expect(
      seenMessages[0]?.map((message) =>
        Array.isArray(message.content) && message.content[0]?.type === "text"
          ? message.content[0].text
          : "",
      ),
    ).toEqual([
      "skill-memory",
      expect.stringContaining("## 可用 Skills"),
      "global-policy",
      "hello",
    ]);
  });

  it("支持 skill runtime hook 在工具执行前修改参数", async () => {
    let turnIndex = 0;

    const model: AgentModelAdapter = {
      async *streamTurn() {
        if (turnIndex === 0) {
          turnIndex += 1;
          yield {
            type: "turn-complete",
            result: {
              type: "tool_calls",
              content: "",
              reasoningContent: "",
              finishReason: "tool_calls",
              toolCalls: [
                {
                  id: "call_rewrite_args",
                  function: {
                    name: "echo_value",
                    arguments: '{"value":1}',
                  },
                },
              ],
            },
          };
          return;
        }

        yield {
          type: "turn-complete",
          result: {
            type: "response",
            content: "done",
            reasoningContent: "",
            finishReason: "stop",
          },
        };
      },
    };

    const agent = new Agent({
      model,
      skills: [
        {
          folderName: "rewrite-args",
          name: "重写参数",
          description: "在执行前改写工具参数",
          readmeContent: "# rewrite-args",
          hooks: [
            {
              id: "skill-rewrite-hook",
              onBeforeToolCall(context) {
                context.call.function.arguments = '{"value":2}';
              },
            },
          ],
        },
      ],
      tools: [
        {
          name: "echo_value",
          description: "返回 value",
          source: "inline-tools",
          parameters: {
            type: "object",
            properties: {
              value: { type: "number" },
            },
            required: ["value"],
            additionalProperties: false,
          },
          async execute(args) {
            return {
              content: String(args.value),
            };
          },
        },
      ],
    });

    const events = await collectEvents(
      agent.run({
        messages: [createTextMessage("hello")],
        enableTools: true,
      }),
    );

    const toolFinished = events.find(
      (event): event is Extract<AgentEvent, { type: "tool-call-finished" }> =>
        event.type === "tool-call-finished",
    );
    expect(toolFinished?.execution.output).toBe("2");
  });

  it("runtime API 可在 contributor 中读取正式注册的 extension", async () => {
    const seenMessages: AgentMessage[][] = [];

    const model: AgentModelAdapter = {
      async *streamTurn(request) {
        seenMessages.push(request.messages);
        yield {
          type: "turn-complete",
          result: {
            type: "response",
            content: "done",
            reasoningContent: "",
            finishReason: "stop",
          },
        };
      },
    };

    const agent = new Agent({
      model,
      runtime: {
        extensions: {
          memory: {
            systemPrompt: "runtime-memory",
          },
        },
      },
      contributors: [
        {
          id: "runtime-memory-contributor",
          stage: "run-init",
          contribute(context) {
            const memory = context.runtime.extensions.get<{
              systemPrompt: string;
            }>("memory");
            if (!memory) {
              return;
            }
            context.state.messages = [
              createSystemMessage(memory.systemPrompt),
              ...context.state.messages,
            ];
          },
        },
      ],
    });

    await collectEvents(
      agent.run({
        messages: [createTextMessage("hello")],
      }),
    );

    expect(
      seenMessages[0]?.map((message) =>
        Array.isArray(message.content) && message.content[0]?.type === "text"
          ? message.content[0].text
          : "",
      ),
    ).toEqual(["runtime-memory", "hello"]);
  });

  it("runtime API 会正式暴露 telemetry 与 tracing 并自动记录生命周期", async () => {
    let turnIndex = 0;
    const telemetryRecords: Array<{
      name: string;
      attributes?: Record<string, unknown>;
    }> = [];
    const tracingStarts: Array<{
      name: string;
      attributes?: Record<string, unknown>;
    }> = [];
    const tracingEnds: Array<{
      name: string;
      attributes?: Record<string, unknown>;
    }> = [];

    const model: AgentModelAdapter = {
      async *streamTurn() {
        if (turnIndex === 0) {
          turnIndex += 1;
          yield {
            type: "turn-complete",
            result: {
              type: "tool_calls",
              content: "",
              reasoningContent: "",
              finishReason: "tool_calls",
              toolCalls: [
                {
                  id: "call_runtime",
                  function: {
                    name: "echo_value",
                    arguments: '{"value":1}',
                  },
                },
              ],
            },
          };
          return;
        }

        yield {
          type: "turn-complete",
          result: {
            type: "response",
            content: "done",
            reasoningContent: "",
            finishReason: "stop",
          },
        };
      },
    };

    const agent = new Agent({
      model,
      runtime: {
        telemetry: {
          record(record) {
            telemetryRecords.push(record);
          },
        },
        tracing: {
          async startSpan(span) {
            tracingStarts.push(span);
            return {
              end(attributes) {
                tracingEnds.push({
                  name: span.name,
                  attributes,
                });
              },
            };
          },
        },
        extensions: {
          memory: {
            namespace: "session-memory",
          },
        },
      },
      hooks: [
        {
          id: "runtime-api-hook",
          async onRunInit(context) {
            expect(context.runtime.extensions.has("memory")).toBe(true);
            expect(context.runtime.extensions.list()).toEqual(["memory"]);
            expect(
              context.runtime.extensions.require<{ namespace: string }>(
                "memory",
              ).namespace,
            ).toBe("session-memory");
            await context.runtime.telemetry.record({
              name: "hook.runtime.ready",
              attributes: {
                phase: "run-init",
              },
            });
            const span = await context.runtime.tracing.startSpan({
              name: "hook.runtime.span",
              attributes: {
                phase: "run-init",
              },
            });
            await span.end({
              status: "ok",
            });
          },
        },
      ],
      tools: [
        {
          name: "echo_value",
          description: "返回 value",
          source: "inline-tools",
          parameters: {
            type: "object",
            properties: {
              value: { type: "number" },
            },
            required: ["value"],
            additionalProperties: false,
          },
          async execute(args) {
            return {
              content: String(args.value),
            };
          },
        },
      ],
    });

    await collectEvents(
      agent.run({
        messages: [createTextMessage("hello")],
        enableTools: true,
      }),
    );

    expect(telemetryRecords.map((record) => record.name)).toEqual(
      expect.arrayContaining([
        "agent.run.start",
        "agent.turn.start",
        "agent.tool_call.start",
        "agent.tool_call.finish",
        "agent.turn.finish",
        "agent.run.finish",
        "hook.runtime.ready",
      ]),
    );
    expect(tracingStarts.map((span) => span.name)).toEqual(
      expect.arrayContaining([
        "agent.run",
        "agent.turn",
        "agent.tool_call",
        "hook.runtime.span",
      ]),
    );
    expect(tracingEnds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "agent.run",
        }),
        expect.objectContaining({
          name: "agent.turn",
        }),
        expect.objectContaining({
          name: "agent.tool_call",
        }),
        expect.objectContaining({
          name: "hook.runtime.span",
          attributes: {
            status: "ok",
          },
        }),
      ]),
    );
  });
});
