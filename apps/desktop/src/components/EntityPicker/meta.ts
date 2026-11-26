import { pickerTranslator } from "./i18n";
import {
  BookOpen,
  CalendarDays,
  CircleCheck,
  Feather,
  File,
  FileText,
  FlaskConical,
  FolderKanban,
  Globe,
  Highlighter,
  Layers,
  MessageCircle,
  Presentation,
  ScrollText,
  Puzzle,
  type LucideIcon,
} from "lucide-react";
import type { EntityKind } from "@/types";

/** 实体类型的展示口径（与问题材料 TARGET_META 同图标） */
export const ENTITY_KIND_META: Record<EntityKind, { label: string; icon: LucideIcon }> = {
  card: {
    get label() {
      return pickerTranslator.t("kind.card");
    },
    icon: Layers,
  },
  article: {
    get label() {
      return pickerTranslator.t("kind.article");
    },
    icon: FileText,
  },
  project_item: {
    get label() {
      return pickerTranslator.t("kind.project_item");
    },
    icon: File,
  },
  project: {
    get label() {
      return pickerTranslator.t("kind.project");
    },
    icon: FolderKanban,
  },
  white_board: {
    get label() {
      return pickerTranslator.t("kind.white_board");
    },
    icon: Presentation,
  },
  notebook: {
    get label() {
      return pickerTranslator.t("kind.notebook");
    },
    icon: FlaskConical,
  },
  "diary-moment": {
    get label() {
      return pickerTranslator.t("kind.diary-moment");
    },
    icon: Feather,
  },
  excerpt: {
    get label() {
      return pickerTranslator.t("kind.excerpt");
    },
    icon: Highlighter,
  },
  pdf: {
    get label() {
      return pickerTranslator.t("kind.pdf");
    },
    icon: BookOpen,
  },
  "pdf-annotation": {
    get label() {
      return pickerTranslator.t("kind.pdf-annotation");
    },
    icon: ScrollText,
  },
  "web-clip": {
    get label() {
      return pickerTranslator.t("kind.web-clip");
    },
    icon: Globe,
  },
  "chat-session": {
    get label() {
      return pickerTranslator.t("kind.chat-session");
    },
    icon: MessageCircle,
  },
  todo: {
    get label() {
      return pickerTranslator.t("kind.todo");
    },
    icon: CircleCheck,
  },
  "calendar-event": {
    get label() {
      return pickerTranslator.t("kind.calendar-event");
    },
    icon: CalendarDays,
  },
  "plugin-entity": {
    get label() {
      return pickerTranslator.t("kind.plugin-entity");
    },
    icon: Puzzle,
  },
};

export const entityKey = (c: { kind: EntityKind; id: number; sessionId?: string }) =>
  `${c.kind}:${c.sessionId ?? c.id}`;

/** 列表右侧时间：今天 / 昨天 / N 天前 / M月D日 / YYYY年M月 */
export function entityTime(ts: number, now = Date.now()): string {
  const day = (t: number) => new Date(new Date(t).toDateString()).getTime();
  const days = Math.round((day(now) - day(ts)) / 86_400_000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  const d = new Date(ts);
  return d.getFullYear() === new Date(now).getFullYear()
    ? `${d.getMonth() + 1}月${d.getDate()}日`
    : `${d.getFullYear()}年${d.getMonth() + 1}月`;
}
