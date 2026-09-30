import { useEffect, useRef, useState } from "react";

interface TitleFieldProps {
  /** 所属行：卸载时补存要写回这一行，而不是切换后的新行 */
  rowId: string;
  value: string;
  placeholder: string;
  readonly: boolean;
  onCommit: (rowId: string, value: string) => void;
}

/** 主列标题：本地草稿，失焦 / 回车 / 卸载（关闭或切换行）时提交，避免逐字写库 */
const TitleField = ({ rowId, value, placeholder, readonly, onCommit }: TitleFieldProps) => {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const latest = useRef({ draft, value, onCommit });
  latest.current = { draft, value, onCommit };

  // 外部值变了（撤销、表格里改了同一格）且没在编辑时才跟随，不冲掉未提交的草稿
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (!focused) setDraft(value);
  }

  const commit = () => {
    const { draft: next, value: saved, onCommit: save } = latest.current;
    if (next !== saved) save(rowId, next);
  };

  useEffect(() => () => commit(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <textarea
      rows={1}
      value={draft}
      disabled={readonly}
      aria-label={placeholder}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onChange={e => setDraft(e.target.value.replace(/\n/g, ""))}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={e => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      className="text-ink-1 text-tau-hero placeholder:text-ink-3 field-sizing-content block w-full resize-none bg-transparent font-semibold leading-[1.3] tracking-[-0.01em] outline-none disabled:cursor-default"
    />
  );
};

export default TitleField;
