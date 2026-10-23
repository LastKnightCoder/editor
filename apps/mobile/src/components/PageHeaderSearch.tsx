// 顶栏搜索展开态：放进 PageHeader 的 children，替换标题与操作按钮；任务中心、插件中心共用。

import { Search, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { motion } from "motion/react";

export function PageHeaderSearch({
  value,
  placeholder,
  onChange,
  onCancel,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  /** 收起搜索；调用方负责清空关键词 */
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // 等展开动画起步后再聚焦，避免移动端键盘顶起时页面跳动
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <>
      <motion.div
        initial={{ scaleX: 0.3, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        style={{ originX: 1 }}
        className="bg-surface flex h-[38px] flex-1 items-center gap-2 rounded-full px-3"
      >
        <Search size={16} className="text-ink-3 shrink-0" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          aria-label={placeholder}
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder={placeholder}
          className="text-ink-1 placeholder:text-ink-3 h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            aria-label="清空"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            className="text-ink-3 grid h-6 w-6 shrink-0 place-items-center"
          >
            <X size={15} />
          </button>
        )}
      </motion.div>
      <button
        type="button"
        onClick={onCancel}
        className="text-accent-text ml-1 shrink-0 px-1 text-[14px] font-semibold"
      >
        取消
      </button>
    </>
  );
}
