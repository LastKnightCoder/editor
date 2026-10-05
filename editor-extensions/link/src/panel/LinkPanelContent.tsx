import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Check, Copy, Link2, Link2Off, Pencil } from "lucide-react";
import { cn } from "@tau/ui";
import { EditorTooltip } from "@tau/editor/api";
import { isInvalidLinkUrl, splitLinkUrl } from "../url";

const MOD = typeof navigator !== "undefined" && /Mac|iP/.test(navigator.platform) ? "⌘" : "Ctrl+";
const INVALID_HINT = "看起来不是有效地址";
const COPIED_DURATION = 1200;

const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="rounded-[4px] border border-[var(--ed-border)] bg-[var(--ed-bg-page)] px-[5px] font-mono text-[11px] leading-[17px] text-[var(--ed-text-tertiary)]">
    {children}
  </kbd>
);

const TipLabel = ({ label, keys }: { label: string; keys?: string }) => (
  <span className="flex items-center gap-2">
    {label}
    {keys && <span className="font-mono text-[11px] opacity-60">{keys}</span>}
  </span>
);

const PanelButton = ({
  icon: Icon,
  label,
  keys,
  danger,
  onClick,
}: {
  icon: typeof Copy;
  label: string;
  keys?: string;
  danger?: boolean;
  onClick: () => void;
}) => (
  <EditorTooltip content={<TipLabel label={label} keys={keys} />}>
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-[7px] text-[var(--ed-text-secondary)]",
        "transition-colors duration-150 hover:bg-[var(--ed-bg-hover)] hover:text-[var(--ed-text)]",
        danger && "hover:bg-[var(--ed-danger-soft)] hover:text-[var(--ed-danger)]"
      )}
    >
      <Icon size={15} strokeWidth={1.75} />
    </button>
  </EditorTooltip>
);

interface LinkViewProps {
  url: string;
  onOpen: () => void;
  onCopy: () => Promise<boolean>;
  onEdit: () => void;
  onUnlink: () => void;
}

/** 查看态：域名加粗、路径弱化，复制反馈在地址原位显示。 */
export const LinkView = ({ url, onOpen, onCopy, onEdit, onUnlink }: LinkViewProps) => {
  const { host, rest } = splitLinkUrl(url);
  const isWeb = /^https?:/i.test(url);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_DURATION);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <div className="flex items-center gap-0.5 whitespace-nowrap p-1">
      <span className="ml-1 mr-2 grid size-5 shrink-0 place-items-center rounded-[6px] bg-[var(--ed-accent-soft)] text-[11px] font-semibold text-[var(--ed-accent-text)]">
        {isWeb && host ? host[0].toUpperCase() : <Link2 size={12} strokeWidth={2} />}
      </span>
      <span className="mr-2 grid min-w-0 max-w-[260px]" title={url}>
        <span
          className={cn(
            "col-start-1 row-start-1 truncate transition-[opacity,transform] duration-150",
            copied && "-translate-y-1 opacity-0"
          )}
        >
          <span className="font-medium text-[var(--ed-text)]">{host || "未填写地址"}</span>
          <span className="text-[var(--ed-text-tertiary)]">{rest}</span>
        </span>
        <span
          aria-live="polite"
          className={cn(
            "col-start-1 row-start-1 flex items-center gap-1.5 font-medium text-[var(--ed-accent-text)]",
            "transition-[opacity,transform] duration-150",
            copied ? "opacity-100" : "translate-y-1 opacity-0"
          )}
        >
          {copied && (
            <>
              <Check size={13} strokeWidth={2} />
              已复制
            </>
          )}
        </span>
      </span>
      <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-[var(--ed-border)]" />
      <PanelButton icon={ArrowUpRight} label="打开" keys={`${MOD}点击`} onClick={onOpen} />
      <PanelButton
        icon={Copy}
        label="复制链接"
        onClick={() => {
          onCopy().then(ok => ok && setCopied(true));
        }}
      />
      <PanelButton icon={Pencil} label="编辑" keys={`${MOD}L`} onClick={onEdit} />
      <PanelButton icon={Link2Off} label="取消链接" danger onClick={onUnlink} />
    </div>
  );
};

const Field = ({ label, children }: { label: ReactNode; children: ReactNode }) => (
  <label
    className={cn(
      "flex h-[34px] items-center gap-2 rounded-[9px] border border-[var(--ed-border)] bg-[var(--ed-bg-page)] px-2.5",
      "transition-[border-color,box-shadow,background-color] duration-150",
      "focus-within:border-[var(--ed-border-focus)] focus-within:bg-[var(--ed-bg-surface)] focus-within:shadow-[var(--ed-focus-ring)]"
    )}
  >
    <span className="w-7 shrink-0 text-[12px] text-[var(--ed-text-tertiary)]">{label}</span>
    {children}
  </label>
);

const inputClass =
  "min-w-0 flex-1 bg-transparent text-[13px] text-[var(--ed-text)] outline-none placeholder:text-[var(--ed-text-tertiary)]";

/**
 * 输入框键盘约定：↵ 完成（跳过输入法组合），Esc 还原。
 * 浮层经 portal 渲染但合成事件仍沿组件树冒泡，一律截停，免得触发宿主外层的回车发送等热键。
 */
const formKeyHandler = (onSubmit: () => void, onCancel: () => void) => (e: React.KeyboardEvent) => {
  e.stopPropagation();
  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
    e.preventDefault();
    onSubmit();
  } else if (e.key === "Escape") {
    e.preventDefault();
    onCancel();
  }
};

const ErrorHint = ({ show }: { show: boolean }) =>
  show ? <div className="px-1 text-[12px] text-[var(--ed-danger)]">{INVALID_HINT}</div> : null;

export interface LinkFormHandle {
  /** 点外面完成时取当前输入 */
  read(): { url: string; text?: string };
}

interface LinkEditProps {
  url: string;
  /** 链接是纯文本时可改文字，否则为 undefined */
  text?: string;
  handleRef: React.RefObject<LinkFormHandle | null>;
  onSubmit: (value: { url: string; text?: string }) => void;
  onCancel: () => void;
  onUnlink: () => void;
}

export const LinkEdit = ({ url, text, handleRef, onSubmit, onCancel, onUnlink }: LinkEditProps) => {
  const [draftUrl, setDraftUrl] = useState(url);
  const [draftText, setDraftText] = useState(text ?? "");
  const [invalid, setInvalid] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    urlRef.current?.focus();
    urlRef.current?.select();
  }, []);

  const value = () => ({ url: draftUrl, text: text === undefined ? undefined : draftText });
  handleRef.current = { read: value };

  const submit = () => {
    if (isInvalidLinkUrl(draftUrl)) {
      setInvalid(true);
      return;
    }
    onSubmit(value());
  };
  const onKeyDown = formKeyHandler(submit, onCancel);

  return (
    <div className="flex w-[360px] flex-col gap-1.5 p-2" onKeyDown={onKeyDown}>
      {text !== undefined && (
        <Field label="文字">
          <input
            className={inputClass}
            value={draftText}
            placeholder="链接文字"
            onChange={e => setDraftText(e.target.value)}
          />
        </Field>
      )}
      <Field label="地址">
        <input
          ref={urlRef}
          className={inputClass}
          value={draftUrl}
          placeholder="清空后完成即取消链接"
          spellCheck={false}
          onChange={e => {
            setDraftUrl(e.target.value);
            setInvalid(false);
          }}
        />
      </Field>
      <ErrorHint show={invalid} />
      <div className="flex items-center gap-1.5 pl-0.5 pt-0.5 text-[11.5px] text-[var(--ed-text-tertiary)]">
        <button
          type="button"
          onClick={onUnlink}
          className="flex items-center gap-1.5 rounded-[6px] px-1.5 py-[3px] text-[12px] transition-colors hover:bg-[var(--ed-danger-soft)] hover:text-[var(--ed-danger)]"
        >
          <Link2Off size={13} strokeWidth={1.75} />
          取消链接
        </button>
        <span className="flex-1" />
        <Kbd>↵</Kbd>完成
        <Kbd>Esc</Kbd>还原
      </div>
    </div>
  );
};

interface LinkCreateProps {
  handleRef: React.RefObject<LinkFormHandle | null>;
  onSubmit: (url: string) => void;
  onCancel: () => void;
}

export const LinkCreate = ({ handleRef, onSubmit, onCancel }: LinkCreateProps) => {
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  handleRef.current = { read: () => ({ url: draft }) };

  const submit = () => {
    if (isInvalidLinkUrl(draft)) {
      setInvalid(true);
      return;
    }
    onSubmit(draft);
  };
  const onKeyDown = formKeyHandler(submit, onCancel);

  return (
    <div className="flex w-[330px] flex-col gap-1 p-1" onKeyDown={onKeyDown}>
      <label className="flex h-[34px] items-center gap-2 px-2.5 text-[var(--ed-text-tertiary)]">
        <Link2 size={14} strokeWidth={1.75} className="shrink-0" />
        <input
          autoFocus
          className={inputClass}
          value={draft}
          placeholder="粘贴或输入链接地址"
          spellCheck={false}
          onChange={e => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
        />
        <Kbd>↵</Kbd>
      </label>
      {invalid && (
        <div className="px-2.5 pb-1.5 pl-[34px] text-[12px] text-[var(--ed-danger)]">
          {INVALID_HINT}
        </div>
      )}
    </div>
  );
};

export const LinkNotice = ({ onUndo }: { onUndo: () => void }) => (
  <div className="flex items-center gap-2.5 whitespace-nowrap py-[5px] pl-3 pr-[5px] text-[12.5px] text-[var(--ed-text-secondary)]">
    已取消链接
    <button
      type="button"
      onClick={onUndo}
      className="rounded-[6px] px-2.5 py-[3px] font-medium text-[var(--ed-accent-text)] transition-colors hover:bg-[var(--ed-accent-soft)]"
    >
      撤销
    </button>
  </div>
);
