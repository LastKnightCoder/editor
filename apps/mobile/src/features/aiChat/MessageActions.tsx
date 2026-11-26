import { useConversationI18n } from "./conversation.i18n";
// 消息操作：回答下方的常显按钮与长按菜单共用一套处理——复制、选择文字、存为卡片、重新生成、删除。
// 重新生成只对最后一条回答开放；删除先确认。

import { useState } from "react";
import type { ThinkingLevel } from "@tau/shared/chat-core";
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

export function useMessageActions(sessionId: string, thinkingLevel?: ThinkingLevel) {
  const { t } = useConversationI18n();
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
        text: t("feedback.saved"),
        action: {
          label: t("action.view"),
          onClick: () => getNavigator().push("contentDetail", { cardId: card.id }),
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("feedback.saveFailed"));
    }
  };

  const run = (action: ChatMessageAction, index: number, text: string) => {
    if (action === "copy")
      void navigator.clipboard
        .writeText(text)
        .then(() => toast.success(t("feedback.copied")))
        .catch(() => toast.error(t("feedback.copyFailed")));
    else if (action === "select") setSelecting(text);
    else if (action === "card") void saveAsCard(text);
    else if (action === "regenerate") void regenerateLast(sessionId, thinkingLevel);
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
      item("copy", t("action.copy"), <Copy size={18} />),
      item("select", t("action.select"), <TextSelect size={18} />),
      item("card", t("action.card"), <BookmarkPlus size={18} />),
      ...(isLastAnswer && !chat?.runId
        ? [item("regenerate", t("action.regenerate"), <RefreshCw size={18} />)]
        : []),
      ...(chat?.runId ? [] : [item("delete", t("action.delete"), <Trash2 size={18} />)]),
    ];
  };

  const sheets = (
    <>
      <ActionSheet
        open={!!menu}
        items={menu ? menuItems(menu) : []}
        onClose={() => setMenu(null)}
      />
      <BottomSheet
        open={selecting !== null}
        title={t("action.select")}
        onClose={() => setSelecting(null)}
      >
        <p
          data-allow-touchmove="true"
          className="text-ink-1 text-tau-body max-h-[60vh] overflow-y-auto px-5 pb-6 leading-relaxed whitespace-pre-wrap select-text"
        >
          {selecting}
        </p>
      </BottomSheet>
      <MobileConfirmDialog
        open={deleting !== null}
        title={t("delete.title")}
        description={t("delete.hint")}
        confirmText={t("action.delete")}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const index = deleting;
          setDeleting(null);
          if (index === null) return;
          deleteMessage(sessionId, index)
            .then(done =>
              done ? toast.success(t("feedback.deleted")) : toast.info(t("feedback.unsaved"))
            )
            .catch(error =>
              toast.error(error instanceof Error ? error.message : t("feedback.deleteFailed"))
            );
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
