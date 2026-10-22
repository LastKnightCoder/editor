/**
 * AI 对话页：页面承载会话正文，会话导航在
 * 全局侧栏「AI 对话」之下（ChatNavSessions），全量管理在「全部会话」弹窗。
 *
 * 纸内挂 ChatArea（标题 / 分支切换 / ChatContainer）。
 * 当前会话 = 页面参数 id（侧栏子项、弹窗选中、新建会话都经栈机原位更新参数）。
 * 标题行「收为侧栏」把当前会话交给右侧停靠栏并离开本页（形变过渡见 assistMorph）。
 * 块预览（D-057 方案 B）：点块卡片 → 对话形变收进停靠栏、预览页占正文；后退回来时
 * 收回因预览而打开的停靠栏。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Minimize2 } from "lucide-react";
import { IconButton } from "@tau/ui";
import { usePage, usePageParams } from "@/page/PageProvider";
import type { BlockData } from "@/types/block-preview";
import {
  openBlockPreviewFromChatPage,
  releaseDockOpenedForPreview,
} from "@/features/previews/openBlock";
import ChatArea, { type ChatAreaHandle } from "../components/ChatArea";
import { parseChatId } from "../model";
import { ChatLibraryDialog } from "../components/ChatLibraryDialog";
import { useChatLibraryStore } from "../libraryStore";
import useChatSessionStore, { MAIN_CHAT_BUCKET } from "@/stores/useChatSessionStore";
import { useShellStore } from "@/app/shellStore";
import { ASSIST_MORPH_CLASS, morphAssist } from "@/app/assistMorph";

export function ChatView() {
  return (
    <>
      <ChatPaper />
      <ChatLibraryDialog />
    </>
  );
}

function ChatPaper() {
  const { navigator } = usePage();
  const { id, entry } = usePageParams<{
    id?: string;
    entry?: string;
  }>();
  // 会话删除后参数失效由 useScopedChat 处理（列表加载完查不到就退回新对话草稿）
  const chatId = parseChatId(id);
  const chatAreaRef = useRef<ChatAreaHandle>(null);
  const openLibrary = useChatLibraryStore(s => s.setOpen);
  const [sendLoading, setSendLoading] = useState(false);

  const select = useCallback(
    (next: string | null) => {
      navigator.push("chat", next === null ? undefined : { id: next });
      chatAreaRef.current?.scrollToTop();
    },
    [navigator]
  );

  // 回到上一页（对话页常由停靠栏放大而来）；无上一页时落到今日
  const collapseToDock = () =>
    morphAssist(() => {
      useChatSessionStore.getState().setCurrent(MAIN_CHAT_BUCKET, chatId);
      useShellStore.getState().setAssistOpen(true);
      if (navigator.canBack()) navigator.back();
      else navigator.push("home");
    });

  const openBlock = useCallback(
    (block: BlockData) => openBlockPreviewFromChatPage(navigator, block),
    [navigator]
  );
  // 保活页重新可见时 effect 重跑（Activity）：从预览后退回来，收回因预览而打开的停靠栏
  useEffect(() => releaseDockOpenedForPreview(), []);

  return (
    <div className="flex h-full min-h-0 flex-col px-4 pb-4">
      <section
        className={`bg-surface rounded-tau-lg shadow-card flex min-h-0 flex-1 flex-col overflow-hidden ${ASSIST_MORPH_CLASS}`}
      >
        <ChatArea
          ref={chatAreaRef}
          selectedChatId={chatId}
          entry={entry}
          onEntryLocated={() => navigator.push("chat", { id })}
          onSelectChat={select}
          sendLoading={sendLoading}
          setSendLoading={setSendLoading}
          onOpenBlock={openBlock}
          onOpenLibrary={() => openLibrary(true)}
          headerActions={
            <IconButton
              title="收为侧栏"
              aria-label="收为侧栏"
              className="size-7"
              onClick={collapseToDock}
            >
              <Minimize2 size={15} strokeWidth={1.75} />
            </IconButton>
          }
        />
      </section>
    </div>
  );
}
