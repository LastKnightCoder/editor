import { useRef, useState } from "react";
import { MdOutlineClear } from "react-icons/md";

import { If } from "@tau/shared";
import { ITabsContent } from "../../../types";

import { useReadOnly } from "slate-react";

interface TabTitleProps {
  tab: ITabsContent;
  activeKey: string;
  onClickTab: (key: string) => void;
  onDeleteTab: (key: string) => void;
  onTitleChange: (key: string, title: string) => void;
  readOnly?: boolean;
}

const moveCursorToEnd = (contentEle: HTMLDivElement) => {
  const range = document.createRange();
  const selection = window.getSelection();
  if (!selection) return;
  range.setStart(contentEle, contentEle.childNodes.length);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
};

const TabTitle = (props: TabTitleProps) => {
  const { tab, activeKey, onClickTab, onDeleteTab, onTitleChange } = props;

  const titleRef = useRef<HTMLDivElement>(null);
  const [editable, setEditable] = useState(false);
  const readOnly = useReadOnly();

  const isActive = tab.key === activeKey;

  return (
    <div
      key={tab.key}
      data-tab-key={tab.key}
      className={`
        group flex shrink-0 items-center gap-[0.375em] p-[0.75em]
        cursor-pointer select-none whitespace-nowrap text-[0.875em] transition-colors
        ${
          isActive
            ? "text-zinc-800 font-medium dark:text-zinc-200"
            : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
        }
      `}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (editable) return;
        onClickTab(tab.key);
      }}
      onDoubleClick={(e) => {
        if (editable || !titleRef.current) return;
        e.stopPropagation();
        setEditable(true);
        titleRef.current.setAttribute("contenteditable", "plaintext-only");
        moveCursorToEnd(titleRef.current);
      }}
    >
      <div
        ref={titleRef}
        data-slate-editor
        // @ts-ignore
        contentEditable={readOnly || !editable ? false : "plaintext-only"}
        suppressContentEditableWarning
        onBlur={(e) => {
          e.stopPropagation();
          setEditable(false);
          onTitleChange(tab.key, e.currentTarget.innerText);
        }}
        className="outline-none"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            setEditable(false);
            onTitleChange(tab.key, e.currentTarget.innerText);
          }
        }}
      >
        {tab.title}
      </div>
      <If condition={!readOnly}>
        <button
          onClick={(e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            onDeleteTab(tab.key);
          }}
          className="flex h-[1em] w-[1em] shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
        >
          <MdOutlineClear className="text-[0.875em]" />
        </button>
      </If>
    </div>
  );
};

export default TabTitle;
