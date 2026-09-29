/**
 * AI 对话停靠栏内容（D-047 一期）：外壳新写，主体原样复用 legacy 右侧栏的
 * RightChatPanel（会话下拉 + ChatContainer），会话与对话页同源 useChatMessageStore。
 * 可预览块推入块预览页（D-057：预览占正文，停靠栏里的对话继续可问）。
 */

import { lazy, Suspense } from "react";
import { Maximize2, PanelRightClose } from "lucide-react";
import { IconButton, Loading } from "@tau/ui";
import { usePage } from "@/page/PageProvider";
import { morphAssist } from "@/app/assistMorph";
import useChatSessionStore, { MAIN_CHAT_BUCKET, bucketKeyOf } from "@/stores/useChatSessionStore";
import type { BlockData } from "@/types/block-preview";
import { openBlockPreview } from "@/features/previews/openBlock";
import { useChatLibraryStore } from "../libraryStore";

const RightChatPanel = lazy(() =>
  import("@/components/RightChatSidebar").then(m => ({
    default: m.RightChatPanel,
  }))
);

export function ChatDock({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { navigator } = usePage();
  const currentChatId = useChatSessionStore(
    s => s.currentIds[bucketKeyOf(MAIN_CHAT_BUCKET)] ?? null
  );

  const openBlock = (block: BlockData) => openBlockPreview(navigator, block);

  const headerActions = (
    <>
      <IconButton
        title="在对话页打开"
        aria-label="在对话页打开"
        className="size-7"
        onClick={() =>
          morphAssist(() =>
            navigator.push("chat", currentChatId ? { id: String(currentChatId) } : undefined)
          )
        }
      >
        <Maximize2 size={15} strokeWidth={1.75} />
      </IconButton>
      <IconButton
        title="关闭 (Ctrl+J)"
        aria-label="关闭 AI 对话栏"
        className="size-7"
        onClick={onClose}
      >
        <PanelRightClose size={16} strokeWidth={1.75} />
      </IconButton>
    </>
  );

  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <Loading minHeight={0} />
        </div>
      }
    >
      <div className="min-h-0 flex-1">
        <RightChatPanel
          open={open}
          onOpenBlock={openBlock}
          headerActions={headerActions}
          onOpenLibrary={() => {
            // 全量管理在对话页的「全部会话」弹窗：先进对话页再打开
            navigator.push("chat", currentChatId ? { id: String(currentChatId) } : undefined);
            useChatLibraryStore.getState().setOpen(true);
          }}
        />
      </div>
    </Suspense>
  );
}
