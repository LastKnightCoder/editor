/**
 * 行内引用与摘录块共用：悬停开合（节奏同 content-link）、按需查询、打开与复制。
 */

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { toast } from "@tau/ui";
import { useCollaboration } from "@tau/editor-collab";
import { openPage } from "@/services/page-navigation";
import { openChatInDock, useChatTitle } from "@/features/chat/openInDock";
import { isMainWindow } from "@/utils/window-role";
import { copyChatRefLink } from "../link";
import { useChatRefTarget } from "../queries";

import { chatRefTranslator, chatRefFailureText } from "../i18n";

const OPEN_DELAY = 450;
const CLOSE_GRACE = 160;

export function useChatRefHover(ref: {
  sessionId: string;
  entryId?: string;
  title: string;
  label?: string;
  turn?: number;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  // 卡片内容只在打开期间挂载，收起动画结束后卸载
  const [mounted, setMounted] = useState(false);
  // 卡片里正在改名：移出不收起
  const [pinned, setPinned] = useState(false);
  const timerRef = useRef(0);

  const collaboration = useCollaboration();
  // 协作者本机没有这段对话，查询本地库还可能命中同 id 的无关对话
  const unshared = Boolean(
    collaboration && collaboration.mode !== "local" && collaboration.role !== "owner"
  );
  const query = useChatRefTarget(ref.sessionId, ref.entryId, !unshared && mounted);
  const liveTitle = useChatTitle(unshared ? undefined : ref.sessionId);
  const title = unshared ? ref.title : liveTitle || query.data?.session.title || ref.title;
  const label = ref.label?.trim() || "";

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const schedule = (next: boolean, wait: number) => {
    window.clearTimeout(timerRef.current);
    if (!next && pinned) return;
    timerRef.current = window.setTimeout(() => {
      setOpen(next);
      if (next) setMounted(true);
    }, wait);
  };
  const cancel = () => window.clearTimeout(timerRef.current);
  const close = () => {
    cancel();
    setPinned(false);
    setOpen(false);
  };

  const missing =
    !unshared && query.data !== undefined && (query.data === null || query.data.turn === null);

  /** 对话只在主窗口里打开；独立编辑窗口没有停靠栏与页面栈 */
  const canOpen = () => {
    if (unshared) return false;
    if (missing) {
      toast.warning(chatRefTranslator.t("open.deleted"));
      return false;
    }
    if (!isMainWindow()) {
      toast.info(chatRefTranslator.t("open.mainWindow"));
      return false;
    }
    return true;
  };
  const openDock = () => {
    close();
    if (canOpen()) openChatInDock(ref.sessionId, { entry: ref.entryId });
  };
  const openChatPage = () => {
    close();
    if (!canOpen()) return;
    try {
      openPage("chat", { id: ref.sessionId, ...(ref.entryId ? { entry: ref.entryId } : {}) });
    } catch (error) {
      toast.error(chatRefFailureText(error, "open.failed"));
    }
  };
  const copyLink = () => {
    void copyChatRefLink({ ...ref, title })
      .then(() => toast.success(chatRefTranslator.t("copy.success")))
      .catch(cause => toast.error(chatRefFailureText(cause, "copy.failed")));
  };

  return {
    title,
    label,
    setPinned,
    unshared,
    missing,
    query,
    panel: { anchor, open, mounted, setMounted },
    triggerProps: {
      onMouseEnter: (event: MouseEvent<HTMLElement>) => {
        setAnchor(event.currentTarget);
        if (open) cancel();
        else schedule(true, OPEN_DELAY);
      },
      onMouseLeave: () => schedule(false, open ? CLOSE_GRACE : 0),
    },
    panelProps: {
      onMouseEnter: cancel,
      onMouseLeave: () => schedule(false, CLOSE_GRACE),
    },
    close,
    openDock,
    openPage: openChatPage,
    copyLink,
  };
}
