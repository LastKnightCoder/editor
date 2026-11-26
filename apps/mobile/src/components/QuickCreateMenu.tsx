// 全局新建菜单：底部 Dock 与左侧导航条共用，浮出位置由调用方决定。

import type { CSSProperties } from "react";
import { Article, BookOpen, CalendarPlus, Microphone, Stack } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useQuickCreateI18n, type QuickCreateMessageKey } from "./quick-create/i18n";
import type { QuickCreateKey } from "./useQuickCreate";

/** 创建类入口，自上而下；最常用的放最后，紧挨分隔线与 ＋ 按钮 */
type QuickCreateAction = { key: QuickCreateKey; message: QuickCreateMessageKey; icon: Icon };

const CREATE_ACTIONS: readonly QuickCreateAction[] = [
  { key: "diary", message: "menu.diary", icon: BookOpen },
  { key: "calendar", message: "menu.calendar", icon: CalendarPlus },
  { key: "article", message: "menu.article", icon: Article },
  { key: "card", message: "menu.card", icon: Stack },
];

const VOICE_ACTION: QuickCreateAction = { key: "voice", message: "menu.voice", icon: Microphone };

type QuickCreateMenuProps = {
  onSelect: (key: QuickCreateKey) => void;
  className?: string;
  style?: CSSProperties;
};

export function QuickCreateMenu({ onSelect, className, style }: QuickCreateMenuProps) {
  const { t } = useQuickCreateI18n();
  const renderItem = (item: QuickCreateAction, voice = false) => {
    const ItemIcon = item.icon;
    return (
      <button
        key={item.key}
        type="button"
        role="menuitem"
        onClick={() => onSelect(item.key)}
        className="text-ink-1 active:bg-press flex h-[52px] w-full items-center gap-3.5 rounded-[14px] px-3.5 text-[15px] font-semibold"
      >
        <ItemIcon
          size={22}
          weight="regular"
          color={voice ? "var(--tau-accent)" : "var(--tau-ink-2)"}
          aria-hidden="true"
        />
        {t(item.message)}
        {voice ? (
          <span className="text-ink-3 ml-auto text-[11px] font-medium">{t("menu.hold")}</span>
        ) : null}
      </button>
    );
  };
  return (
    <div
      role="menu"
      aria-label={t("menu.title")}
      className={`bg-surface shadow-float w-[232px] rounded-[20px] p-1.5 ${className ?? ""}`}
      style={style}
    >
      {CREATE_ACTIONS.map(item => renderItem(item))}
      <div className="bg-line-1 mx-3.5 my-1 h-px" aria-hidden="true" />
      {renderItem(VOICE_ACTION, true)}
    </div>
  );
}
