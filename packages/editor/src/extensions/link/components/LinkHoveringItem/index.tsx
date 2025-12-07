import { useMemo, memo } from "react";
import { Editor, Transforms } from "slate";
import { ReactEditor, useSlateStatic, useSlateSelection } from "slate-react";
import { useMemoizedFn } from "ahooks";
import { Tooltip } from "antd";
import { Link } from "lucide-react";

import classnames from "classnames";
import { unwrapLink, wrapLink } from "../../../../utils";
import useThemeColors from "../../../../hooks/useThemeColors";

const LinkHoveringItem = memo(() => {
  const editor = useSlateStatic();
  const selection = useSlateSelection();
  const themeColors = useThemeColors();

  const isActive = useMemo(() => {
    if (!selection) {
      return false;
    }
    const [link] = Editor.nodes(editor, {
      match: (n) => !Editor.isEditor(n) && n.type === "link",
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
    <Tooltip title={"链接"} trigger={"hover"}>
      <div
        className={classnames(
          "flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer transition-all duration-200",
          isActive
            ? themeColors.activeClass
            : classnames(
                themeColors.textClass,
                themeColors.hoverClass,
                themeColors.hoverTextClass,
              ),
        )}
        onClick={handleClick}
      >
        <Link size={16} strokeWidth={2.5} />
      </div>
    </Tooltip>
  );
});

export default LinkHoveringItem;
