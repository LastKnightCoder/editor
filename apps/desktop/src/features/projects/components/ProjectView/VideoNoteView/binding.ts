import { desktopI18n } from "@/app/i18n/runtime";
import { projectVideoMessages } from "./messages";
export const projectVideoT = desktopI18n.get(projectVideoMessages).t;
export function projectVideoNoteTitle(title: string, index: number): string {
  return (
    title ||
    projectVideoT("note.number", {
      number: (index + 1).toLocaleString(desktopI18n.getSnapshot(), { useGrouping: false }),
    })
  );
}
