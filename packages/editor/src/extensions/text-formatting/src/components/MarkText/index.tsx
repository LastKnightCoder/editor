import { useMemo, memo } from "react";
import { useSlate, useSlateSelection } from "slate-react";
import { EditorTooltip as Tooltip } from "@tau/editor/api";
import { Mark } from "../../types.ts";

import { useMemoizedFn } from "ahooks";

import { isMarkActive } from "../../hovering-bar-configs/utils.ts";
import classnames from "classnames";

interface IMarkTextProps {
  mark: Mark;
  tooltip: string;
  icon: React.ReactNode;
}

const MarkText = memo((props: IMarkTextProps) => {
  const { mark, tooltip, icon } = props;
  const editor = useSlate();
  const selection = useSlateSelection();

  const isActive = useMemo(() => {
    return isMarkActive(mark, editor, selection);
  }, [editor, selection, mark]);

  const handleClick = useMemoizedFn((event: React.MouseEvent) => {
    editor.commands?.execute(`tau.mark.${mark}`, { source: "toolbar" });
    event.stopPropagation();
  });

  return (
    <Tooltip content={tooltip}>
      <div
        className={classnames(
          "flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-all duration-200",
          "ed-toolbar-item",
          isActive && "is-active"
        )}
        onClick={handleClick}
      >
        {icon}
      </div>
    </Tooltip>
  );
});

export default MarkText;
