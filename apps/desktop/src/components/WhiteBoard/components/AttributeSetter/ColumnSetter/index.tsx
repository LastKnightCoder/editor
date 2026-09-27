import { memo } from "react";
import { useMemoizedFn } from "ahooks";
import { ChevronsDownUp, ChevronsUpDown, Ungroup } from "lucide-react";
import { produce } from "immer";

import { ColumnElement } from "../../../types";
import { ColumnColor, COLUMN_COLOR_OPTIONS } from "../../../types/column";
import { useBoard } from "../../../hooks";
import { ColumnUtil } from "../../../utils";
import { AttrAction, AttrPopover, SwatchRow } from "../../../chrome";

interface ColumnSetterProps {
  element: ColumnElement;
  onChange: (element: ColumnElement) => void;
}

const NO_COLOR = "none";

const ColumnSetter = memo(({ element, onChange }: ColumnSetterProps) => {
  const board = useBoard();
  const current = COLUMN_COLOR_OPTIONS.find(o => o.value === element.color);

  const handleColorChange = useMemoizedFn((key: string) => {
    onChange(
      produce(element, draft => {
        if (key === NO_COLOR) delete draft.color;
        else draft.color = key as ColumnColor;
      })
    );
  });

  const handleDissolve = useMemoizedFn(() => {
    ColumnUtil.dissolveColumn(board, element);
    board.apply(
      {
        type: "set_selection",
        properties: board.selection,
        newProperties: { selectedElements: [], selectArea: null },
      },
      false
    );
  });

  return (
    <>
      <AttrPopover
        label="列颜色"
        swatch={current ? { fill: current.token } : { fill: "transparent", kind: "none" }}
        width={220}
      >
        <SwatchRow
          options={[
            { key: NO_COLOR, label: "无", fill: "transparent", kind: "none" },
            ...COLUMN_COLOR_OPTIONS.map(o => ({ key: o.value, label: o.label, fill: o.token })),
          ]}
          value={element.color ?? NO_COLOR}
          onChange={handleColorChange}
        />
      </AttrPopover>
      <AttrAction
        label={element.collapsed ? "展开" : "折叠"}
        icon={
          element.collapsed ? (
            <ChevronsUpDown strokeWidth={1.75} />
          ) : (
            <ChevronsDownUp strokeWidth={1.75} />
          )
        }
        onClick={() => ColumnUtil.toggleCollapsed(board, element)}
      />
      <AttrAction label="解散分栏" icon={<Ungroup strokeWidth={1.75} />} onClick={handleDissolve} />
    </>
  );
});

export default ColumnSetter;
