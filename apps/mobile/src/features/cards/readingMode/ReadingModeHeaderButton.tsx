import type { ReactNode } from "react";
import { Pencil } from "lucide-react";
import { useOnCoverHeader } from "../../../components/coverHeaderContext";

type ReadingModeHeaderButtonProps = {
  editing: boolean;
  canEdit: boolean;
  /** 在 click 中同步调用（iOS 手势内聚焦才弹键盘） */
  onEnter: () => void;
  onExit: () => void;
};

/** 阻止按下时编辑器先失焦，退出编辑统一由 click 收尾 */
function keepEditorFocus(event: { preventDefault: () => void }) {
  event.preventDefault();
}

/** 封面顶栏上白 / 墨双层随 --header-p 交叉过渡（与 PageHeaderButton 图标同构） */
function CoverFade(props: { children: ReactNode }) {
  return (
    <span className="cover-icon-fade">
      <span className="cover-icon-fade-white flex items-center gap-1">{props.children}</span>
      <span className="cover-icon-fade-ink flex items-center gap-1" aria-hidden>
        {props.children}
      </span>
    </span>
  );
}

export function ReadingModeHeaderButton(props: ReadingModeHeaderButtonProps) {
  const onCover = useOnCoverHeader();
  if (!props.canEdit) return null;

  if (props.editing) {
    const label = "完成";
    return (
      <button
        type="button"
        onPointerDown={keepEditorFocus}
        onMouseDown={keepEditorFocus}
        onClick={props.onExit}
        className={`h-8 shrink-0 self-center px-2.5 text-[15px] font-semibold transition active:scale-95 ${
          onCover ? "" : "text-accent-text"
        }`}
      >
        {onCover ? <CoverFade>{label}</CoverFade> : label}
      </button>
    );
  }

  const content = (
    <>
      <Pencil size={14} strokeWidth={2.4} aria-hidden />
      编辑
    </>
  );
  return (
    <button
      type="button"
      aria-label="编辑"
      onClick={props.onEnter}
      className={`flex h-8 shrink-0 items-center gap-1 self-center rounded-full px-3 text-[14px] font-semibold transition active:scale-95 ${
        onCover ? "bg-white/20 backdrop-blur" : "bg-accent-soft text-accent-text"
      }`}
    >
      {onCover ? <CoverFade>{content}</CoverFade> : content}
    </button>
  );
}

export default ReadingModeHeaderButton;
