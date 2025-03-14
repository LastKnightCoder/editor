import { useRef, useState } from "react";
import { MdOutlineClear } from "react-icons/md";
import classnames from "classnames";

import If from "@/components/If";
import { ITabsContent } from "@/components/Editor/types";

import styles from "./index.module.less";
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

  return (
    <div
      key={tab.key}
      className={classnames(styles.tabHeaderItem, {
        [styles.active]: tab.key === activeKey,
      })}
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
        // titleRef.current.focus();
        moveCursorToEnd(titleRef.current);
      }}
    >
      <div className={styles.content}>
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
          style={{
            cursor: readOnly || !editable ? "pointer" : "text",
          }}
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
          <div
            className={styles.deleteIcon}
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              onDeleteTab(tab.key);
            }}
          >
            <MdOutlineClear />
          </div>
        </If>
      </div>
      <If condition={tab.key === activeKey}>
        <div className={styles.bottomLine} />
      </If>
    </div>
  );
};

export default TabTitle;
