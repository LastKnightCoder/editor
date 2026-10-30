// 消息操作：回答下方的常显按钮与长按菜单共用一套处理——复制、选择文字、存为卡片、重新生成、删除。
// 重新生成只对最后一条回答开放；删除先确认。

import { useState } from "react";
import { BookmarkPlus, Copy, RefreshCw, TextSelect, Trash2 } from "lucide-react";
import { ActionSheet, type ActionSheetItem } from "../../components/ActionSheet";
import { BottomSheet } from "../../components/BottomSheet";
import { MobileConfirmDialog } from "../../components/MobileConfirmDialog";
import { toast } from "../../components/toast";
import { useAppContext } from "../../app/AppContext";
import { getNavigator } from "../../router";
import * as tauri from "../../services/tauri";
import { deleteMessage, regenerateLast, useChatStore } from "../../services/aiChat/chatController";
import { getContentLength } from "../cards/editorContentUtils";
import { parseIncomingMarkdown } from "../markdownImport/parseIncomingMarkdown";
import type { ChatMessageAction } from "./ChatMessages";

type Target = { index: number; text: string };

export function useMessageActions(sessionId: string) {
  const app = useAppContext();
  const [menu, setMenu] = useState<Target | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const saveAsCard = async (text: string) => {
    try {
      const parsed = await parseIncomingMarkdown(text);
      const card = await tauri.createQuickCard({
        ...parsed,
        count: getContentLength(parsed.content),
      });
      void app.refreshCardsSafe({ page: 1 });
      toast({
        type: "success",
        text: "已存为卡片",
        action: {
          label: "查看",
          onClick: () => getNavigator().push("contentDetail", { cardId: card.id }),
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "存为卡片失败");
    }
  };

  const run = (action: ChatMessageAction, index: number, text: string) => {
    if (action === "copy")
      void navigator.clipboard
        .writeText(text)
        .then(() => toast.success("已复制"))
        .catch(() => toast.error("复制失败"));
    else if (action === "select") setSelecting(text);
    else if (action === "card") void saveAsCard(text);
    else if (action === "regenerate") void regenerateLast(sessionId);
    else setDeleting(index);
  };

  const menuItems = (target: Target): ActionSheetItem[] => {
    const chat = useChatStore.getState().chats[sessionId];
    const messages = chat?.messages ?? [];
    const isLastAnswer =
      target.index === messages.length - 1 && messages[target.index]?.role !== "user";
    const item = (action: ChatMessageAction, label: string, icon: React.ReactNode) => ({
      key: action,
      label,
      icon,
      danger: action === "delete",
      onClick: () => run(action, target.index, target.text),
    });
    return [
      item("copy", "复制", <Copy size={18} />),
      item("select", "选择文字", <TextSelect size={18} />),
      item("card", "存为卡片", <BookmarkPlus size={18} />),
      ...(isLastAnswer && !chat?.runId
        ? [item("regenerate", "重新生成", <RefreshCw size={18} />)]
        : []),
      ...(chat?.runId ? [] : [item("delete", "删除", <Trash2 size={18} />)]),
    ];
  };

  const sheets = (
    <>
      <ActionSheet
        open={!!menu}
        items={menu ? menuItems(menu) : []}
        onClose={() => setMenu(null)}
      />
      <BottomSheet open={selecting !== null} title="选择文字" onClose={() => setSelecting(null)}>
        <p
          data-allow-touchmove="true"
          className="text-ink-1 text-tau-body max-h-[60vh] overflow-y-auto px-5 pb-6 leading-relaxed whitespace-pre-wrap select-text"
        >
          {selecting}
        </p>
      </BottomSheet>
      <MobileConfirmDialog
        open={deleting !== null}
        title="删除这条消息？"
        description="删除后模型也不会再看到这条内容。"
        confirmText="删除"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const index = deleting;
          setDeleting(null);
          if (index === null) return;
          deleteMessage(sessionId, index)
            .then(done =>
              done ? toast.success("已删除") : toast.info("这条消息还没保存，暂时不能删除")
            )
            .catch(error => toast.error(error instanceof Error ? error.message : "删除失败"));
        }}
      />
    </>
  );

  return {
    onAction: run,
    onMenu: (index: number, text: string) => setMenu({ index, text }),
    sheets,
  };
}
