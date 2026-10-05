import { useMemo, memo } from "react";
import { useSlateStatic, useSlateSelection } from "slate-react";
import { EditorTooltip as Tooltip } from "@tau/editor/api";
import { Link } from "lucide-react";

import classnames from "classnames";
import { findLinkEntry } from "../../operations.ts";
import { linkPanelOf } from "../../panel/controller.ts";

const MOD = /Mac|iP/.test(navigator.platform) ? "⌘" : "Ctrl+";

/** 选区不在链接里时新建，在链接里时编辑（取消链接放在编辑浮层里，避免误删） */
const LinkHoveringItem = memo(() => {
  const editor = useSlateStatic();
  const selection = useSlateSelection();

  const isActive = useMemo(
    () => Boolean(selection && findLinkEntry(editor, selection)),
    [editor, selection]
  );

  return (
    <Tooltip
      content={
        <span className="flex items-center gap-2">
          {isActive ? "编辑链接" : "链接"}
          <span className="font-mono text-[11px] opacity-60">{MOD}L</span>
        </span>
      }
    >
      <div
        className={classnames(
          "flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-all duration-200",
          "ed-toolbar-item",
          isActive && "is-active"
        )}
        onMouseDown={event => event.preventDefault()}
        onClick={() => linkPanelOf(editor).startFromSelection("above")}
      >
        <Link size={16} strokeWidth={2.5} />
      </div>
    </Tooltip>
  );
});

export default LinkHoveringItem;
