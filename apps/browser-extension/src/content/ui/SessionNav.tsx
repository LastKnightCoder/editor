import { useContentChatI18n, relativeDay } from "../chat.i18n";
import { useState } from "react";
import { Check, History, SquarePen, Trash2 } from "lucide-react";
import type { ChatSessionSummary } from "@tau/shared/browser-companion";
import { cn, IconButton } from "@tau/ui";
import { splitQuote } from "../state/chat";
import { useCompanion } from "../state/store";
import { useController, useEscLayer } from "./context";

/** 会话标题：快答类以引用块开头，去掉引用只留问题 */
export const sessionTitle = (summary: ChatSessionSummary): string => {
  const { quote, body } = splitQuote(summary.title);
  return body || quote || summary.title;
};

/**
 * 页签行右侧的会话控制：历史下拉（切换 / 删除）+ 新对话，恢复历史会话时标题一并显示。
 * 定位父级是 Panel 的页签行（relative），下拉铺满面板宽。
 */
export function SessionNav() {
  const context = useContentChatI18n();
  const { t } = context;
  const controller = useController();
  const chat = useCompanion(state => state.chat);
  const [open, setOpen] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const busy = Boolean(chat.runId);
  useEscLayer(open, () => setOpen(false));

  const current = chat.sessions.find(item => item.id === chat.sessionId);
  const toggleHistory = () => {
    setOpen(value => !value);
    setConfirmingId(null);
    void controller.chat.listSessions();
  };
  const startNew = () => {
    setOpen(false);
    controller.chat.newSession();
  };

  return (
    <div className="ml-auto flex items-center gap-0.5">
      {current && (
        <button
          type="button"
          aria-label={t("history")}
          title={busy ? t("history.wait") : t("history")}
          disabled={busy}
          onClick={toggleHistory}
          className={cn(
            "text-tau-sm text-ink-3 hover:bg-hover hover:text-ink-2 min-w-0 max-w-[128px] rounded-md px-1.5 py-1",
            busy && "opacity-50"
          )}
        >
          <span className="block truncate">{sessionTitle(current)}</span>
        </button>
      )}
      <IconButton
        aria-label={t("history")}
        title={busy ? t("history.wait") : t("history")}
        disabled={busy}
        className={cn("size-7", open && "bg-hover")}
        onClick={toggleHistory}
      >
        <History size={15} strokeWidth={1.8} />
      </IconButton>
      <IconButton
        aria-label={t("history.new")}
        title={busy ? t("history.wait") : t("history.new")}
        disabled={busy}
        className="size-7"
        onClick={startNew}
      >
        <SquarePen size={15} strokeWidth={1.8} />
      </IconButton>
      {open && (
        <div
          role="menu"
          aria-label={t("history.page")}
          className="bg-surface shadow-float rounded-tau-md absolute top-[34px] right-2 left-2 z-20 max-h-[300px] overflow-y-auto p-1"
        >
          <button
            type="button"
            role="menuitemradio"
            aria-checked={!current}
            onClick={startNew}
            className="text-ink-1 hover:bg-hover rounded-tau-sm flex h-[30px] w-full items-center gap-2 px-2 text-left"
          >
            <span className="grid w-4 place-items-center">
              {!current && <Check size={14} strokeWidth={2} />}
            </span>
            <span className="flex-1">{t("history.new")}</span>
          </button>
          {chat.sessions.map(item =>
            confirmingId === item.id ? (
              <div key={item.id} className="flex h-[44px] items-center gap-1 px-2">
                <span className="text-tau-sm text-ink-2 min-w-0 flex-1 truncate">
                  {t("history.deleteConfirm", { title: sessionTitle(item) })}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingId(null);
                    void controller.chat.deleteSession(item.id);
                  }}
                  className="text-tau-sm text-danger hover:bg-hover rounded-tau-sm flex-none px-1.5 py-1"
                >
                  {t("delete")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingId(null)}
                  className="text-tau-sm text-ink-3 hover:bg-hover rounded-tau-sm flex-none px-1.5 py-1"
                >
                  {t("cancel")}
                </button>
              </div>
            ) : (
              <div key={item.id} className="group/session relative">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={item.id === chat.sessionId}
                  onClick={() => {
                    setOpen(false);
                    void controller.chat.switchSession(item.id);
                  }}
                  className="text-ink-1 hover:bg-hover rounded-tau-sm flex h-[44px] w-full items-center gap-2 pr-9 pl-2 text-left"
                >
                  <span className="grid w-4 flex-none place-items-center">
                    {item.id === chat.sessionId && <Check size={14} strokeWidth={2} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{sessionTitle(item)}</span>
                    <span className="text-tau-sm text-ink-3 block">
                      {t("history.detail", {
                        time: relativeDay(item.updateTime, context),
                        count: item.messageCount,
                      })}
                    </span>
                  </span>
                </button>
                <IconButton
                  aria-label={t("history.delete")}
                  title={t("history.delete")}
                  onClick={() => setConfirmingId(item.id)}
                  className="hover:text-danger absolute top-1/2 right-1.5 size-6 -translate-y-1/2 opacity-0 transition-opacity group-hover/session:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 size={13} strokeWidth={1.8} />
                </IconButton>
              </div>
            )
          )}
          {chat.sessions.length === 0 && (
            <p className="text-tau-sm text-ink-3 px-2 py-2">{t("history.empty")}</p>
          )}
        </div>
      )}
    </div>
  );
}
