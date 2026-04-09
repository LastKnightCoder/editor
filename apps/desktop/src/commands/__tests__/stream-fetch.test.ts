import { describe, expect, it, vi, beforeEach } from "vitest";

const { fetchEventSourceMock } = vi.hoisted(() => ({
  fetchEventSourceMock: vi.fn(),
}));

vi.mock("@fortaine/fetch-event-source", () => ({
  EventStreamContentType: "text/event-stream",
  fetchEventSource: fetchEventSourceMock,
}));

import { stream } from "../stream-fetch";

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
});
