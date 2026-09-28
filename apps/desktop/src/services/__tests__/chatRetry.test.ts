import { describe, expect, it } from "vitest";
import { canRetryChatMessage } from "../chatRetry";
import type { RequestMessage, ResponseMessage } from "@/types";
import { Role } from "@/constants";

const question: RequestMessage = { role: Role.User, content: "问题" };
const answer = (patch: Partial<ResponseMessage> = {}): ResponseMessage => ({
  role: Role.Assistant,
  content: "",
  ...patch,
});

describe("重试与重新生成的边界", () => {
  it("尚无回答、空失败或只有思考时可以原位重试", () => {
    expect(canRetryChatMessage([question], 0)).toBe(true);
    expect(canRetryChatMessage([question, answer()], 0)).toBe(true);
    expect(canRetryChatMessage([question, answer({ reasoning_content: "思考中断" })], 0)).toBe(
      true
    );
  });

  it("部分正文和工具调用必须保留为旧版本", () => {
    expect(canRetryChatMessage([question, answer({ content: "部分回答" })], 0)).toBe(false);
    expect(
      canRetryChatMessage(
        [
          question,
          answer({
            assistant_blocks: [
              { id: "text", turnId: "turn", type: "text", state: "final", content: "正文" },
            ],
          }),
        ],
        0
      )
    ).toBe(false);
    expect(
      canRetryChatMessage(
        [
          question,
          answer({
            tool_calls: [
              { id: "tool", type: "function", function: { name: "write", arguments: "{}" } },
            ],
          }),
        ],
        0
      )
    ).toBe(false);
  });

  it("有后续追问、索引失效或选中回答时不能原位重试", () => {
    expect(canRetryChatMessage([question, answer(), question], 0)).toBe(false);
    expect(canRetryChatMessage([question, answer()], 1)).toBe(false);
    expect(canRetryChatMessage([question], -1)).toBe(false);
  });
});
