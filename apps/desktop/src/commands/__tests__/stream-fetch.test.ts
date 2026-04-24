import { describe, expect, it, vi, beforeEach } from "vitest";

const { fetchEventSourceMock } = vi.hoisted(() => ({
  fetchEventSourceMock: vi.fn(),
}));

vi.mock("@fortaine/fetch-event-source", () => ({
  EventStreamContentType: "text/event-stream",
  fetchEventSource: fetchEventSourceMock,
}));

import { createResponsesStreamParser, stream } from "../stream-fetch";

describe("stream", () => {
  beforeEach(() => {
    fetchEventSourceMock.mockReset();
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
});
