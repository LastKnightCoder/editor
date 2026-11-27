import { createContext, useContext } from "react";
import { Bell } from "lucide-react";
import type { EditorKit } from "@tau/editor";
import { ICheckListItemReminder, type CheckListItemElement } from "@tau/editor/extensions/list";
import { useI18n } from "@tau/i18n/react";
import {
  canScheduleDocumentReminder,
  type DocumentReminderAccess,
  reminderMessages,
  summarizeDocumentReminders,
} from "@tau/shared/reminders";
import { mobileI18n } from "../../services/i18n";
import { isRecurringCheckListElement, readCheckListReminders } from "./docTaskReminders";

export type MobileDocTaskReminderHost = {
  access?: DocumentReminderAccess;
  disabled: boolean;
  onOpen: (element: CheckListItemElement) => void;
};

export const MobileDocTaskReminderContext = createContext<MobileDocTaskReminderHost | null>(null);

function MobileCheckListReminderPill({ element }: { element: CheckListItemElement }) {
  const host = useContext(MobileDocTaskReminderContext);
  const { locale, t } = useI18n(reminderMessages, mobileI18n);
  if (!host || element.taskArchived || !canScheduleDocumentReminder(host.access, element.taskId))
    return null;

  const recurring = isRecurringCheckListElement(element);
  const reminders = readCheckListReminders(element);
  if (reminders.length === 0) return null;

  const summary = summarizeDocumentReminders(reminders, recurring, Date.now(), { locale });
  const pillClass =
    "bg-accent-soft text-accent-text ml-2 inline-flex shrink-0 items-center gap-1 self-center rounded-full px-2 py-[2px] text-[11px] leading-4 font-semibold tabular-nums select-none";

  if (host.disabled) {
    return (
      <span contentEditable={false} className={`${pillClass} opacity-75`}>
        <Bell size={11} strokeWidth={2.2} aria-hidden />
        <span>{summary}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      contentEditable={false}
      aria-label={`${t("ui.title")}: ${summary}`}
      onPointerDown={event => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onMouseDown={event => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={event => {
        event.preventDefault();
        event.stopPropagation();
        host.onOpen(element);
      }}
      className={`${pillClass} transition-opacity active:opacity-70`}
    >
      <Bell size={11} strokeWidth={2.2} aria-hidden />
      <span>{summary}</span>
    </button>
  );
}

const kitCache = new WeakMap<EditorKit, EditorKit>();

export function withMobileDocTaskReminderService(baseKit: EditorKit): EditorKit {
  if (typeof baseKit?.extend !== "function") return baseKit;
  const cached = kitCache.get(baseKit);
  if (cached) return cached;
  const extended = baseKit.extend({
    services: [
      register =>
        register(ICheckListItemReminder, {
          renderTrailing: ({ element }) => <MobileCheckListReminderPill element={element} />,
        }),
    ],
  });
  kitCache.set(baseKit, extended);
  return extended;
}
