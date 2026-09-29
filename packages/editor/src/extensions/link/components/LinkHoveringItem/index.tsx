import { useMemo, memo } from "react";
import { Editor, Transforms } from "slate";
import { ReactEditor, useSlateStatic, useSlateSelection } from "slate-react";
import { useMemoizedFn } from "ahooks";
import { Tooltip } from "../../../../ui/Tooltip";
import { Link } from "lucide-react";

import classnames from "classnames";
import { unwrapLink, wrapLink } from "../../../../utils";

const LinkHoveringItem = memo(() => {
  const editor = useSlateStatic();
  const selection = useSlateSelection();

  const isActive = useMemo(() => {
    if (!selection) {
      return false;
    }
    const [link] = Editor.nodes(editor, {
      match: n => !Editor.isEditor(n) && n.type === "link",
    });
    return !!link;
  }, [editor, selection]);

  const handleClick = useMemoizedFn((event: React.MouseEvent) => {
    try {
      if (isActive) {
        unwrapLink(editor);
        return;
      }
      wrapLink(editor, "", true);
    } finally {
      event.preventDefault();
      ReactEditor.focus(editor);
      Transforms.collapse(editor, { edge: "end" });
    }
  });

  return (
    <Tooltip content={"链接"}>
      <div
        className={classnames(
          "flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-all duration-200",
          "ed-toolbar-item",
          isActive && "is-active"
        )}
        onClick={handleClick}
      >
        <Link size={16} strokeWidth={2.5} />
      </div>
    </Tooltip>
  );
});

export default LinkHoveringItem;
