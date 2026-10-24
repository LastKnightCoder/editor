// 存储服务面板（同步服务 / 上传服务共用）的表单原语：分组内的行式字段，失焦即保存，不提供「保存」按钮；
// 以及服务页、同步中心等拇指区的大按钮。

import type { ReactNode } from "react";
import { ChevronRight, LoaderCircle } from "lucide-react";

/** 拇指区大按钮：emphasis 为主按钮，否则为卡片样式的次按钮 */
export function ActionButton(props: {
  label: string;
  emphasis: boolean;
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-[14px] text-[15px] font-semibold transition-transform active:scale-[0.98] disabled:opacity-50 ${
        props.emphasis
          ? "bg-accent text-ink-inverse shadow-lift"
          : "bg-surface text-ink-1 shadow-card"
      }`}
    >
      {props.busy && <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />}
      {props.label}
    </button>
  );
}

/** 服务抽屉里的一项：点选进入服务页（或直接切换到无需配置的选项），current 时描边并带「当前」徽标 */
export function ServiceOption(props: {
  icon: ReactNode;
  name: string;
  summary: string;
  current: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`bg-page active:bg-hover flex w-full items-center gap-3 rounded-2xl border-[1.5px] px-3.5 py-3 text-left transition-colors ${
        props.current ? "border-accent" : "border-transparent"
      }`}
    >
      {props.icon}
      <span className="min-w-0 flex-1">
        <span className="text-ink-1 flex items-center gap-1.5 text-[14.5px] font-semibold">
          {props.name}
          {props.current && (
            <span className="bg-accent-soft text-accent-text rounded-full px-1.5 text-[10.5px] font-semibold">
              当前
            </span>
          )}
        </span>
        <span className="text-ink-3 block truncate text-[11.5px]">{props.summary}</span>
      </span>
      <ChevronRight size={16} className="text-ink-3" aria-hidden="true" />
    </button>
  );
}
