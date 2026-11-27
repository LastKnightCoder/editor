import { useContext, type MouseEvent } from "react";
import { Element, Editor } from "slate";
import { useSlateSelector } from "slate-react";
import { Bell } from "lucide-react";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import { cn } from "@tau/ui";
import type { CheckListItemReminderProps } from "@tau/editor/extensions/list";
import { documentTaskReminders } from "@tau/shared/task-assistant";
import {
  canScheduleDocumentReminder,
  reminderMessages,
  summarizeDocumentReminders,
} from "@tau/shared/reminders";
import {
  DocTaskReminderAccessContext,
  openDocTaskReminderMenu,
  useDocTaskReminderMenuStore,
} from "./reminderMenu";

/**
 * 桌面正文勾选项尾部提醒入口：
 * - 已有提醒时常驻显示可点胶囊（只读态不可点但可见）；
 * - 无提醒时仅当光标位于该勾选项内（或浮层正为此项打开）才显示「提醒」按钮，路过不闪烁。
 */
export function CheckListReminderTrailing({
  editor,
  element,
  readOnly,
}: CheckListItemReminderProps) {
  const { t, locale } = useI18n(reminderMessages, desktopI18n);
  const access = useContext(DocTaskReminderAccessContext);
  const reminders = documentTaskReminders(element);
  const recurring = Boolean(element.taskRecurrence?.segments?.length);
  const hasReminders = reminders.length > 0;

  const isMenuOpen = useDocTaskReminderMenuStore(
    state => state.editor === editor && state.taskId != null && state.taskId === element.taskId
  );

  const isSelected = useSlateSelector(current => {
    if (readOnly || !current.selection) return false;
    try {
      const entry = Editor.above(current, {
        at: current.selection,
        match: node => Element.isElement(node) && node.type === "check-list-item",
      });
      return entry?.[0] === element;
    } catch {
      return false;
    }
  });

  if (element.taskArchived || !canScheduleDocumentReminder(access?.access, element.taskId))
    return null;
  if (!hasReminders && (readOnly || (!isSelected && !isMenuOpen))) {
    return null;
  }

  const label = hasReminders
    ? summarizeDocumentReminders(reminders, recurring, Date.now(), { locale, t })
    : t("ui.button");

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (readOnly) return;
    event.preventDefault();
    event.stopPropagation();
    openDocTaskReminderMenu(editor, event.currentTarget, element);
  };

  return (
    <span contentEditable={false} className="mt-[0.22em] ml-1.5 inline-flex shrink-0 select-none">
      {readOnly ? (
        <span
          data-doc-task-reminder="readonly"
          className="bg-accent-soft text-accent-text inline-flex max-w-[180px] items-center gap-1 rounded-[5px] px-[6px] py-[1px] text-[12px] leading-[1.45] font-medium tabular-nums"
        >
          <Bell className="size-[11.5px] shrink-0" strokeWidth={1.85} />
          <span className="truncate">{label}</span>
        </span>
      ) : (
        <button
          type="button"
          data-doc-task-reminder={hasReminders ? "set" : "empty"}
          aria-expanded={isMenuOpen}
          aria-label={hasReminders ? `${t("ui.title")}: ${label}` : t("ui.button")}
          onMouseDown={event => event.preventDefault()}
          onClick={handleClick}
          className={cn(
            "ease-tau-out inline-flex max-w-[190px] cursor-pointer items-center gap-1 rounded-[5px] px-[6px] py-[1px] text-[12px] leading-[1.45] tabular-nums outline-none transition-[background-color,border-color,color] duration-150 focus-visible:shadow-[var(--tau-focus-ring)]",
            hasReminders
              ? "bg-accent-soft text-accent-text hover:bg-selected font-medium"
              : "border-line-1 bg-surface text-ink-2 hover:bg-hover hover:text-ink-1 border",
            isMenuOpen && !hasReminders && "border-accent text-ink-1"
          )}
        >
          <Bell className="size-[11.5px] shrink-0" strokeWidth={1.85} />
          <span className="truncate">{label}</span>
        </button>
      )}
    </span>
  );
}
