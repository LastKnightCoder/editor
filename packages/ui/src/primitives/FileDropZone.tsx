import { useRef, useState, type ReactNode } from "react";
import { cn } from "../cn";

export interface FileDropZoneProps {
  /** 同 <input accept> */
  accept?: string;
  /** 单选：只取第一个文件 */
  onFile?: (file: File) => void;
  /** 多选：拖入或选择的全部文件（同时开启文件框多选） */
  onFiles?: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

/** 点击选择或拖入文件的区域；拖入时高亮 */
export function FileDropZone({
  accept,
  onFile,
  onFiles,
  disabled,
  className,
  children,
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const take = (files: FileList | null | undefined) => {
    if (!files?.length) return;
    if (onFiles) onFiles([...files]);
    else onFile?.(files[0]);
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={event => {
        if (disabled || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        inputRef.current?.click();
      }}
      onDragOver={event => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => {
        event.preventDefault();
        event.stopPropagation();
        setDragging(false);
        if (!disabled) take(event.dataTransfer?.files);
      }}
      className={cn(
        "rounded-tau-md flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed px-4 py-6 text-center outline-none",
        "ease-tau-out transition-[border-color,background-color] duration-[160ms]",
        "focus-visible:shadow-[var(--tau-focus-ring)]",
        dragging ? "border-accent bg-accent-soft" : "border-line-1 bg-hover hover:border-accent",
        disabled && "pointer-events-none opacity-55",
        className
      )}
    >
      {children}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={Boolean(onFiles)}
        className="hidden"
        onChange={event => {
          take(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
