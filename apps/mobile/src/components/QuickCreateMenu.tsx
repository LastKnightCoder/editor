// 全局新建菜单：底部 Dock 与左侧导航条共用，浮出位置由调用方决定。

import type { CSSProperties } from "react";
import { Article, BookOpen, CalendarPlus, Microphone, Stack } from "@phosphor-icons/react";
import type { QuickCreateAction, QuickCreateKey } from "./useQuickCreate";

/** 创建类入口，自上而下；最常用的放最后，紧挨分隔线与 ＋ 按钮 */
const CREATE_ACTIONS: readonly QuickCreateAction[] = [
  { key: "diary", label: "写日记", icon: BookOpen },
  { key: "calendar", label: "新日程", icon: CalendarPlus },
  { key: "article", label: "新文章", icon: Article },
  { key: "card", label: "新卡片", icon: Stack },
];

const VOICE_ACTION: QuickCreateAction = { key: "voice", label: "说一段", icon: Microphone };

type QuickCreateMenuProps = {
  onSelect: (key: QuickCreateKey) => void;
  className?: string;
  style?: CSSProperties;
};

export function QuickCreateMenu({ onSelect, className, style }: QuickCreateMenuProps) {
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
        {item.label}
        {voice ? <span className="text-ink-3 ml-auto text-[11px] font-medium">长按 ＋</span> : null}
      </button>
    );
  };
  return (
    <div
      role="menu"
      aria-label="新建"
      className={`bg-surface shadow-float w-[232px] rounded-[20px] p-1.5 ${className ?? ""}`}
      style={style}
    >
      {CREATE_ACTIONS.map(item => renderItem(item))}
      <div className="bg-line-1 mx-3.5 my-1 h-px" aria-hidden="true" />
      {renderItem(VOICE_ACTION, true)}
    </div>
  );
}
