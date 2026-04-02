import { describe, expect, it } from "vitest";
import {
  resolveNewChatTooltipOpen,
  shouldCloseNewChatTooltip,
} from "@tau/shared";

describe("ChatInputArea 新建对话 Tooltip 状态", () => {
  it("应只在可编辑且未进入创建/发送态时允许打开 Tooltip", () => {
    expect(
      resolveNewChatTooltipOpen({
        requestedOpen: true,
        createMessageLoading: false,
        sendLoading: false,
        contentEditable: true,
        reopenLocked: false,
      }),
    ).toBe(true);

    expect(
      resolveNewChatTooltipOpen({
        requestedOpen: true,
        createMessageLoading: true,
        sendLoading: false,
        contentEditable: true,
        reopenLocked: false,
      }),
    ).toBe(false);

    expect(
      resolveNewChatTooltipOpen({
        requestedOpen: true,
        createMessageLoading: false,
        sendLoading: true,
        contentEditable: true,
        reopenLocked: false,
      }),
    ).toBe(false);

    expect(
      resolveNewChatTooltipOpen({
        requestedOpen: true,
        createMessageLoading: false,
        sendLoading: false,
        contentEditable: false,
        reopenLocked: false,
      }),
    ).toBe(false);

    expect(
      resolveNewChatTooltipOpen({
        requestedOpen: true,
        createMessageLoading: false,
        sendLoading: false,
        contentEditable: true,
        reopenLocked: true,
      }),
    ).toBe(false);
  });

  it("应在创建态、发送态或不可编辑时强制关闭 Tooltip", () => {
    expect(
      shouldCloseNewChatTooltip({
        createMessageLoading: false,
        sendLoading: false,
        contentEditable: true,
      }),
    ).toBe(false);

    expect(
      shouldCloseNewChatTooltip({
        createMessageLoading: true,
        sendLoading: false,
        contentEditable: true,
      }),
    ).toBe(true);

    expect(
      shouldCloseNewChatTooltip({
        createMessageLoading: false,
        sendLoading: true,
        contentEditable: true,
      }),
    ).toBe(true);

    expect(
      shouldCloseNewChatTooltip({
        createMessageLoading: false,
        sendLoading: false,
        contentEditable: false,
      }),
    ).toBe(true);
  });
});
