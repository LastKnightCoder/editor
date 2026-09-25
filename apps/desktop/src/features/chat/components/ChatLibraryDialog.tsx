/**
 * 「全部会话」弹窗（D-047 页面方案 1）：会话的全量管理——分组 / 子分组、置顶、拖拽排序、
 * 归档、移动、分支——一期原样放 legacy ChatManagementSidebar，选中即切换并关闭。
 */

import { MessagesSquare } from "lucide-react";
import { Dialog } from "@tau/ui";
import { usePage, usePageParams } from "@/page/PageProvider";
import ChatManagementSidebar from "./ChatManagementSidebar";
import { parseChatId } from "../model";
import { useChatLibraryStore } from "../libraryStore";

export function ChatLibraryDialog() {
  const { navigator } = usePage();
  const { id } = usePageParams<{ id?: string }>();
  const open = useChatLibraryStore(s => s.open);
  const setOpen = useChatLibraryStore(s => s.setOpen);

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="全部会话"
      icon={<MessagesSquare size={16} strokeWidth={1.75} />}
      width={560}
      fill
    >
      <div className="min-h-0 flex-1 overflow-hidden px-3 pb-3">
        <ChatManagementSidebar
          selectedChatId={parseChatId(id)}
          onChatSelect={chatId => {
            navigator.push("chat", { id: String(chatId) });
            setOpen(false);
          }}
        />
      </div>
    </Dialog>
  );
}
