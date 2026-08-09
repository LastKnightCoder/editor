import { describe, expect, it, vi, beforeEach } from "vitest";

const { fetchEventSourceMock } = vi.hoisted(() => ({
  fetchEventSourceMock: vi.fn(),
}));

vi.mock("@fortaine/fetch-event-source", () => ({
  EventStreamContentType: "text/event-stream",
  fetchEventSource: fetchEventSourceMock,
}));

import {
  createResponsesStreamParser,
  normalizeOpenAIUsage,
  stream,
} from "../stream-fetch";

describe("stream", () => {
  beforeEach(() => {
    fetchEventSourceMock.mockReset();
  });

  it("规范化 OpenAI usage 及缓存读取 token", () => {
    expect(
      normalizeOpenAIUsage({
        prompt_tokens: 1200,
        completion_tokens: 340,
        prompt_tokens_details: { cached_tokens: 800 },
      }),
    ).toEqual({
      inputTokens: 1200,
      outputTokens: 340,
      cacheReadTokens: 800,
      cacheWriteTokens: 0,
    });
  });

  it("Responses 完成事件返回统一 usage", () => {
    const parser = createResponsesStreamParser();
    expect(
      parser.parse(
        JSON.stringify({
          type: "response.completed",
          response: {
            output: [],
            usage: {
              input_tokens: 2000,
              output_tokens: 500,
              input_tokens_details: { cached_tokens: 1200 },
            },
          },
        }),
      ),
    ).toMatchObject({
      finish_reason: "stop",
      usage: {
        inputTokens: 2000,
        outputTokens: 500,
        cacheReadTokens: 1200,
        cacheWriteTokens: 0,
      },
    });
  });

  it("在 tool_calls 结束时返回本轮 content 与 reasoning_content", async () => {
    fetchEventSourceMock.mockImplementation(async (_url, options) => {
      await options.onopen(
        new Response("", {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
          },
        }),
      );
      options.onmessage({
        data: JSON.stringify({
          choices: [
            {
              delta: {
                reasoning_content: "先思考",
              },
            },
          ],
        }),
      });
      options.onmessage({
        data: JSON.stringify({
          choices: [
            {
              delta: {
                content: "准备调用工具",
              },
            },
          ],
        }),
      });
      options.onmessage({
        data: JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call-1",
                    type: "function",
                    function: {
                      name: "search_docs",
                      arguments: '{"q":"kimi"}',
                    },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        }),
      });
      options.onmessage({ data: "[DONE]" });
    });

    const result = await stream(
      "https://example.com/chat/completions",
      { messages: [] },
      {
        Authorization: "Bearer test",
      },
      new AbortController(),
      {
        parse: (text) => {
          const json = JSON.parse(text);
          const choice = json.choices?.[0];
          return {
            delta: choice?.delta,
            finish_reason: choice?.finish_reason,
          };
        },
      },
      {
        disableAnimation: true,
      },
    );

    expect(result).toEqual({
      type: "tool_calls",
      finishReason: "tool_calls",
      toolCalls: [
        {
          id: "call-1",
          type: "function",
          function: {
            name: "search_docs",
            arguments: '{"q":"kimi"}',
          },
        },
      ],
      content: "准备调用工具",
      reasoning_content: "先思考",
    });
  });

  it("controller abort 时应以 AbortError 结束请求", async () => {
    const controller = new AbortController();

    fetchEventSourceMock.mockImplementation(async () => {
      controller.abort();
    });

    await expect(
      stream(
        "https://example.com/chat/completions",
        { messages: [] },
        {
          Authorization: "Bearer test",
        },
        controller,
        {
          parse: (text) => JSON.parse(text),
        },
        {
          disableAnimation: true,
        },
      ),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("HTTP 上下文超限响应应作为错误向上抛出", async () => {
    fetchEventSourceMock.mockImplementation(async (_url, options) => {
      await options.onopen(
        new Response(
          JSON.stringify({
            error: {
              message: "maximum context length is 128k tokens",
            },
          }),
          {
            status: 400,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      );
    });

    await expect(
      stream(
        "https://example.com/chat/completions",
        { messages: [] },
        { Authorization: "Bearer test" },
        new AbortController(),
        { parse: (text) => JSON.parse(text) },
        { disableAnimation: true },
      ),
    ).rejects.toThrow(/maximum context length/i);
  });

  it("Responses SSE 失败事件应作为错误向上抛出", async () => {
    fetchEventSourceMock.mockImplementation(async (_url, options) => {
      await options.onopen(
        new Response("", {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
          },
        }),
      );
      options.onmessage({
        data: JSON.stringify({
          type: "response.failed",
          response: {
            error: { message: "upstream request failed" },
          },
        }),
      });
    });

    await expect(
      stream(
        "https://example.com/v1/responses",
        { input: [] },
        { Authorization: "Bearer test" },
        new AbortController(),
        createResponsesStreamParser(),
        { disableAnimation: true },
      ),
    ).rejects.toThrow("upstream request failed");
  });

  it("解析 Responses SSE 的文本、思考摘要与函数调用", async () => {
    fetchEventSourceMock.mockImplementation(async (_url, options) => {
      await options.onopen(
        new Response("", {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
          },
        }),
      );
      options.onmessage({
        data: JSON.stringify({
          type: "response.output_item.added",
          output_index: 1,
          item: {
            id: "fc_1",
            type: "function_call",
            call_id: "call_1",
            name: "search_docs",
            arguments: "",
          },
        }),
      });
      options.onmessage({
        data: JSON.stringify({
          type: "response.reasoning_summary_text.delta",
          delta: "先思考",
        }),
      });
      options.onmessage({
        data: JSON.stringify({
          type: "response.output_text.delta",
          delta: "准备调用工具",
        }),
      });
      options.onmessage({
        data: JSON.stringify({
          type: "response.function_call_arguments.delta",
          item_id: "fc_1",
          output_index: 1,
          delta: '{"q":"kimi"}',
        }),
      });
      options.onmessage({
        data: JSON.stringify({
          type: "response.function_call_arguments.done",
          item_id: "fc_1",
          output_index: 1,
          arguments: '{"q":"kimi"}',
        }),
      });
      options.onmessage({
        data: JSON.stringify({
          type: "response.completed",
          response: {
            status: "completed",
            output: [
              {
                id: "msg_1",
                type: "message",
                role: "assistant",
                content: [],
              },
              {
                id: "fc_1",
                type: "function_call",
                call_id: "call_1",
                name: "search_docs",
                arguments: '{"q":"kimi"}',
              },
            ],
          },
        }),
      });
      options.onmessage({ data: "[DONE]" });
    });

    const result = await stream(
      "https://example.com/v1/responses",
      { input: [] },
      {
        Authorization: "Bearer test",
      },
      new AbortController(),
      createResponsesStreamParser(),
      {
        disableAnimation: true,
      },
    );

    expect(result).toEqual({
      type: "tool_calls",
      finishReason: "tool_calls",
      toolCalls: [
        {
          id: "call_1",
          type: "function",
          function: {
            name: "search_docs",
            arguments: '{"q":"kimi"}',
          },
        },
      ],
      content: "准备调用工具",
      reasoning_content: "先思考",
    });
  });

  it("Responses 仅在 arguments.done 返回完整参数时仍保留工具输入", async () => {
    fetchEventSourceMock.mockImplementation(async (_url, options) => {
      await options.onopen(
        new Response("", {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
          },
        }),
      );
      options.onmessage({
        data: JSON.stringify({
          type: "response.output_item.added",
          output_index: 0,
          item: {
            id: "fc_1",
            type: "function_call",
            call_id: "call_1",
            name: "get_skill_readme",
            arguments: "",
          },
        }),
      });
      options.onmessage({
        data: JSON.stringify({
          type: "response.function_call_arguments.done",
          item_id: "fc_1",
          output_index: 0,
          arguments: '{"folderName":"browser"}',
        }),
      });
      options.onmessage({
        data: JSON.stringify({
          type: "response.completed",
          response: {
            status: "completed",
            output: [
              {
                id: "fc_1",
                type: "function_call",
                call_id: "call_1",
                name: "get_skill_readme",
                arguments: '{"folderName":"browser"}',
              },
            ],
          },
        }),
      });
      options.onmessage({ data: "[DONE]" });
    });

    const result = await stream(
      "https://example.com/v1/responses",
      { input: [] },
      {
        Authorization: "Bearer test",
      },
      new AbortController(),
      createResponsesStreamParser(),
      {
        disableAnimation: true,
      },
    );

    expect(result).toMatchObject({
      type: "tool_calls",
      toolCalls: [
        {
          id: "call_1",
          function: {
            name: "get_skill_readme",
            arguments: '{"folderName":"browser"}',
          },
        },
      ],
    });
  });

  it("Responses 参数 delta 未完成时不应当作可执行工具调用", async () => {
    fetchEventSourceMock.mockImplementation(async (_url, options) => {
      await options.onopen(
        new Response("", {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
          },
        }),
      );
      options.onmessage({
        data: JSON.stringify({
          type: "response.output_item.added",
          output_index: 0,
          item: {
            id: "fc_1",
            type: "function_call",
            call_id: "call_1",
            name: "ask-question",
            arguments: "",
          },
        }),
      });
      options.onmessage({
        data: JSON.stringify({
          type: "response.function_call_arguments.delta",
          item_id: "fc_1",
          output_index: 0,
          delta: '{"questions":[{"question":"请选择',
        }),
      });
      options.onmessage({ data: "[DONE]" });
    });

    const result = await stream(
      "https://example.com/v1/responses",
      { input: [] },
      {
        Authorization: "Bearer test",
      },
      new AbortController(),
      createResponsesStreamParser(),
      {
        disableAnimation: true,
      },
    );

    expect(result).toEqual({
      type: "response",
      finishReason: null,
    });
  });

  it("Chat Completions 半截参数且未声明 tool_calls 完成时不应执行工具", async () => {
    fetchEventSourceMock.mockImplementation(async (_url, options) => {
      await options.onopen(
        new Response("", {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
          },
        }),
      );
      options.onmessage({
        data: JSON.stringify({
          choices: [
            {
              delta: {
                content: "我需要确认一下",
              },
            },
          ],
        }),
      });
      options.onmessage({
        data: JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call-1",
                    type: "function",
                    function: {
                      name: "ask-question",
                      arguments: '{"questions":[{"question":"请选择',
                    },
                  },
                ],
              },
            },
          ],
        }),
      });
      options.onmessage({ data: "[DONE]" });
    });

    const result = await stream(
      "https://example.com/chat/completions",
      { messages: [] },
      {
        Authorization: "Bearer test",
      },
      new AbortController(),
      {
        parse: (text) => {
          const json = JSON.parse(text);
          const choice = json.choices?.[0];
          return {
            delta: choice?.delta,
            finish_reason: choice?.finish_reason,
          };
        },
      },
      {
        disableAnimation: true,
      },
    );

    expect(result).toEqual({
      type: "response",
      finishReason: null,
    });
  });

  it("Claude 风格 tool_use 完成但参数仍是半截 JSON 时不应执行工具", async () => {
    fetchEventSourceMock.mockImplementation(async (_url, options) => {
      await options.onopen(
        new Response("", {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
          },
        }),
      );
      options.onmessage({
        data: JSON.stringify({
          type: "content_block_start",
          index: 0,
          content_block: {
            type: "tool_use",
            id: "toolu_1",
            name: "ask-question",
            input: {},
          },
        }),
      });
      options.onmessage({
        data: JSON.stringify({
          type: "content_block_delta",
          index: 0,
          delta: {
            type: "input_json_delta",
            partial_json: '{"questions":[{"question":"请选择',
          },
        }),
      });
      options.onmessage({
        data: JSON.stringify({
          type: "message_delta",
          delta: {
            stop_reason: "tool_use",
          },
        }),
      });
      options.onmessage({ data: "[DONE]" });
    });

    const result = await stream(
      "https://example.com/v1/messages",
      { messages: [] },
      {
        "x-api-key": "test",
      },
      new AbortController(),
      {
        parse: (text) => {
          const json = JSON.parse(text);
          if (json.type === "content_block_start") {
            const block = json.content_block;
            if (block?.type === "tool_use") {
              return {
                delta: {
                  tool_calls: [
                    {
                      index: json.index,
                      id: block.id,
                      type: "function",
                      function: { name: block.name, arguments: "" },
                    },
                  ],
                },
              };
            }
          }
          if (json.type === "content_block_delta") {
            const delta = json.delta;
            if (delta?.type === "input_json_delta") {
              return {
                delta: {
                  tool_calls: [
                    {
                      index: json.index,
                      function: { arguments: delta.partial_json },
                    },
                  ],
                },
              };
            }
          }
          if (json.type === "message_delta") {
            return json.delta?.stop_reason === "tool_use"
              ? { finish_reason: "tool_calls" as const }
              : undefined;
          }
          return undefined;
        },
      },
      {
        disableAnimation: true,
      },
    );

    expect(result).toEqual({
      type: "response",
      finishReason: "tool_calls",
    });
  });

  it("应忽略空白 SSE data 帧而不打印 parse error", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    fetchEventSourceMock.mockImplementation(async (_url, options) => {
      await options.onopen(
        new Response("", {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
          },
        }),
      );
      options.onmessage({ data: "" });
      options.onmessage({
        data: JSON.stringify({
          choices: [
            {
              delta: {
                content: "正常内容",
              },
              finish_reason: "stop",
            },
          ],
        }),
      });
      options.onmessage({ data: "[DONE]" });
    });

    const result = await stream(
      "https://example.com/chat/completions",
      { messages: [] },
      {
        Authorization: "Bearer test",
      },
      new AbortController(),
      {
        parse: (text) => {
          const json = JSON.parse(text);
          const choice = json.choices?.[0];
          return {
            delta: choice?.delta,
            finish_reason: choice?.finish_reason,
          };
        },
      },
      {
        disableAnimation: true,
      },
    );

    expect(result).toMatchObject({
      type: "response",
      finishReason: "stop",
    });
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("[Request] parse error"),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );

    consoleSpy.mockRestore();
  });

  it("不应吞掉模型正文中的空格与换行内容", async () => {
    fetchEventSourceMock.mockImplementation(async (_url, options) => {
      await options.onopen(
        new Response("", {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
          },
        }),
      );
      options.onmessage({
        data: JSON.stringify({
          choices: [
            {
              delta: {
                content: "第一行",
              },
            },
          ],
        }),
      });
      options.onmessage({
        data: JSON.stringify({
          choices: [
            {
              delta: {
                content: "\n  第二行",
              },
              finish_reason: "stop",
            },
          ],
        }),
      });
      options.onmessage({ data: "[DONE]" });
    });

    const updates: string[] = [];
    let finalContent = "";
    const result = await stream(
      "https://example.com/chat/completions",
      { messages: [] },
      {
        Authorization: "Bearer test",
      },
      new AbortController(),
      {
        parse: (text) => {
          const json = JSON.parse(text);
          const choice = json.choices?.[0];
          return {
            delta: choice?.delta,
            finish_reason: choice?.finish_reason,
          };
        },
      },
      {
        disableAnimation: true,
        onUpdate: (_full, inc) => {
          updates.push(inc);
        },
        onFinish: (content) => {
          finalContent = content;
        },
      },
    );

    expect(updates.filter(Boolean)).toEqual(["第一行", "\n  第二行"]);
    expect(result).toMatchObject({
      type: "response",
      finishReason: "stop",
    });
    expect(finalContent).toBe("第一行\n  第二行");
  });

  it("不应吞掉原始文本协议中的单独换行与空格消息", async () => {
    fetchEventSourceMock.mockImplementation(async (_url, options) => {
      await options.onopen(
        new Response("", {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
          },
        }),
      );
      options.onmessage({ data: "\n" });
      options.onmessage({ data: " " });
      options.onmessage({ data: "结束" });
      options.onmessage({ data: "[DONE]" });
    });

    const updates: string[] = [];
    let finalContent = "";
    const result = await stream(
      "https://example.com/raw-text",
      { messages: [] },
      {
        Authorization: "Bearer test",
      },
      new AbortController(),
      {
        parse: (text) => ({
          delta: {
            content: text,
          },
          finish_reason: text === "结束" ? "stop" : null,
        }),
      },
      {
        disableAnimation: true,
        onUpdate: (_full, inc) => {
          updates.push(inc);
        },
        onFinish: (content) => {
          finalContent = content;
        },
      },
    );

    expect(updates.filter(Boolean)).toEqual(["\n", " ", "结束"]);
    expect(result).toMatchObject({
      type: "response",
      finishReason: "stop",
    });
    expect(finalContent).toBe("\n 结束");
  });
});
