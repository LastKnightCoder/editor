// 移动端统一搜索框：40px 胶囊 + 18 号图标 + 16px 输入字号 + 一键清空；样式见 styles.css `.search-field`。

import { useRef, type InputHTMLAttributes, type Ref } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@tau/ui";

type SearchFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "className"
> & {
  value: string;
  onValueChange: (value: string) => void;
  /** 底色：放在页面底（bg-page）上用 surface，放在卡片/面板（bg-surface）里用 page */
  tone?: "page" | "surface";
  inputRef?: Ref<HTMLInputElement>;
  /** 作用于外层胶囊（外边距、宽度等） */
  className?: string;
};

export function SearchField(props: SearchFieldProps) {
  const { value, onValueChange, tone = "page", inputRef, className, ...inputProps } = props;
  const localRef = useRef<HTMLInputElement | null>(null);

  const setRefs = (node: HTMLInputElement | null) => {
    localRef.current = node;
    if (typeof inputRef === "function") inputRef(node);
    else if (inputRef) inputRef.current = node;
  };

  return (
    <label className={cn("search-field", tone === "page" ? "bg-page" : "bg-surface", className)}>
      <Search size={18} className="shrink-0" aria-hidden="true" />
      <input
        ref={setRefs}
        type="search"
        enterKeyHint="search"
        aria-label={inputProps["aria-label"] ?? inputProps.placeholder}
        {...inputProps}
        value={value}
        onChange={event => onValueChange(event.target.value)}
        className="search-field-input"
      />
      {value ? (
        <button
          type="button"
          aria-label="清空"
          // 清空不抢走输入框焦点，键盘保持
          onPointerDown={event => event.preventDefault()}
          onClick={() => {
            onValueChange("");
            localRef.current?.focus();
          }}
          className="text-ink-3 grid h-7 w-7 shrink-0 place-items-center"
        >
          <X size={16} />
        </button>
      ) : null}
    </label>
  );
}

export default SearchField;
