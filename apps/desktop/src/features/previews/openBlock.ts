/**
 * 打开块预览（D-057 方案 B）：预览永远占正文，对话永远在右边。
 *
 *  - 会话块（有 sourceChatId + blockKey）：推入 block-preview 页，参数只带「会话 + key」，
 *    预览页从对话仓库实时取内容；
 *  - 其它来源（行内 AI、MCP 等不在对话仓库里的对话）：整块 JSON 快照。
 *  - 从对话页打开：对话经形变过渡收进右侧停靠栏（同会话），预览占正文；后退回到对话页时
 *    停靠栏若是因此打开的，由对话页收回（见 ChatView）。
 */

import type { Navigator } from "@/page/PageProvider";
import type { BlockData } from "@/types/block-preview";
import { morphAssist } from "@/app/assistMorph";
import { useShellStore } from "@/app/shellStore";
import useRightChatSidebarStore from "@/stores/useRightChatSidebarStore";
import { chatBlockId } from "./useChatBlocks";

export const BLOCK_PREVIEW_PAGE = "block-preview";

export function blockPreviewParams(block: BlockData): Record<string, unknown> {
  const { sourceChatId, blockKey } = block.metadata;
  if (sourceChatId && blockKey)
    return { id: chatBlockId(sourceChatId, blockKey), chat: sourceChatId, key: blockKey };
  return { id: block.id, block: JSON.stringify(block) };
}

export function openBlockPreview(navigator: Navigator, block: BlockData) {
  navigator.push(BLOCK_PREVIEW_PAGE, blockPreviewParams(block));
}

/** 停靠栏是否因「从对话页打开预览」而打开（回到对话页时据此收回） */
let dockOpenedForPreview = false;

export function openBlockPreviewFromChatPage(navigator: Navigator, block: BlockData) {
  const chatId = block.metadata.sourceChatId;
  morphAssist(() => {
    const shell = useShellStore.getState();
    if (chatId) useRightChatSidebarStore.getState().setCurrentChatId(chatId);
    if (!shell.assistOpen) {
      dockOpenedForPreview = true;
      shell.setAssistOpen(true);
    }
    openBlockPreview(navigator, block);
  });
}

/** 对话页重新可见时调用：收回因预览而打开的停靠栏 */
export function releaseDockOpenedForPreview() {
  if (!dockOpenedForPreview) return;
  dockOpenedForPreview = false;
  useShellStore.getState().setAssistOpen(false);
}
