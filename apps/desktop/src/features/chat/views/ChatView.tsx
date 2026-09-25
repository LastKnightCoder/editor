/**
 * AI 对话页（D-047 页面方案 1「侧栏嵌套」一期）：页面只放一整张纸，会话导航在
 * 全局侧栏「AI 对话」之下（ChatNavSessions），全量管理在「全部会话」弹窗。
 *
 * 一期只换容器：纸内原样挂 legacy ChatArea（标题 / 分支切换 / ChatContainer）与
 * 块预览分栏（BlockPreviewProvider + ResizablePanel），样式替换留到后续。
 * 当前会话 = 页面参数 id（侧栏子项、弹窗选中、新建会话都经栈机原位更新参数）。
 * 标题行「收为侧栏」把当前会话交给右侧停靠栏并离开本页（形变过渡见 assistMorph）。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Minimize2 } from "lucide-react";
import { IconButton } from "@tau/ui";
import { usePage, usePageParams } from "@/page/PageProvider";
import ResizablePanel from "@/components/ResizablePanel";
import BlockPreviewSidebar from "@/components/BlockPreviewSidebar";
import { BlockPreviewProvider, useBlockPreview } from "@/contexts/BlockPreviewContext";
import ChatArea, { type ChatAreaHandle } from "../components/ChatArea";
import useChatMessageStore, { EStatus } from "@/stores/useChatMessageStore";
import { parseChatId } from "../model";
import { ChatLibraryDialog } from "../components/ChatLibraryDialog";
import { useChatLibraryStore } from "../libraryStore";
import useRightChatSidebarStore from "@/stores/useRightChatSidebarStore";
import { useShellStore } from "@/app/shellStore";
import { ASSIST_MORPH_CLASS, morphAssist } from "@/app/assistMorph";

export function ChatView() {
  return (
    <BlockPreviewProvider>
      <ChatPaper />
      <ChatLibraryDialog />
    </BlockPreviewProvider>
  );
}

function ChatPaper() {
  const { navigator } = usePage();
  const { id } = usePageParams<{ id?: string }>();
  const chats = useChatMessageStore(s => s.chats);
  const loaded = useChatMessageStore(s => s.status === EStatus.SUCCESS);
  const chatId = parseChatId(id);
  const chatAreaRef = useRef<ChatAreaHandle>(null);
  const { state: previewState, openPreview } = useBlockPreview();
  const openLibrary = useChatLibraryStore(s => s.setOpen);
  const [sendLoading, setSendLoading] = useState(false);

  const select = useCallback(
    (next: number | null) => {
      navigator.push("chat", next === null ? undefined : { id: String(next) });
      chatAreaRef.current?.scrollToTop();
    },
    [navigator]
  );

  // 回到上一页（对话页常由停靠栏放大而来）；无上一页时落到今日
  const collapseToDock = () =>
    morphAssist(() => {
      useRightChatSidebarStore.getState().setCurrentChatId(chatId);
      useShellStore.getState().setAssistOpen(true);
      if (navigator.canBack()) navigator.back();
      else navigator.push("home");
    });

  // 会话被删除（侧栏 / 弹窗 / 停靠栏任一处）后参数失效：回到新对话空态
  useEffect(() => {
    if (loaded && chatId !== null && !chats.some(chat => chat.id === chatId)) {
      navigator.push("chat");
    }
  }, [loaded, chats, chatId, navigator]);

  return (
    <div className="flex h-full min-h-0 flex-col px-[26px] pb-[18px]">
      <section
        className={`bg-surface rounded-tau-lg shadow-card flex min-h-0 flex-1 overflow-hidden ${ASSIST_MORPH_CLASS}`}
      >
        <ResizablePanel
          id="chat-preview-panel"
          className="flex h-full min-w-0 flex-1"
          left={
            <div className="flex h-full flex-col overflow-hidden">
              <ChatArea
                ref={chatAreaRef}
                selectedChatId={chatId}
                onSelectChat={select}
                sendLoading={sendLoading}
                setSendLoading={setSendLoading}
                onOpenBlock={openPreview}
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
            </div>
          }
          right={previewState.isOpen ? <BlockPreviewSidebar /> : null}
          initialLeftRatio={0.5}
          minLeft={400}
          minRight={400}
        />
      </section>
    </div>
  );
}
