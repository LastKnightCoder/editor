// 同步中心、图片与附件等拇指区的大按钮。

import { LoaderCircle } from "lucide-react";

/** 拇指区大按钮：emphasis 为主按钮，否则为卡片样式的次按钮；danger 用于确认面板里的破坏性动作 */
export function ActionButton(props: {
  label: string;
  emphasis: boolean;
  danger?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={`text-tau-body flex h-12 flex-1 items-center justify-center gap-2 rounded-[14px] font-semibold transition-transform active:scale-[0.98] disabled:opacity-50 ${
        props.danger
          ? "bg-danger text-ink-inverse"
          : props.emphasis
            ? "bg-accent text-ink-inverse shadow-lift"
            : "bg-surface text-ink-1 shadow-card"
      }`}
    >
      {props.busy && <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />}
      {props.label}
    </button>
  );
}
