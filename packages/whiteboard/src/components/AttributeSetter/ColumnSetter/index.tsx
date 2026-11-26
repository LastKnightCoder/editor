import { attributeColor } from "../../../attribute-labels";
import { useAttributeI18n } from "../../../attributes-i18n";
import { memo } from "react";
import { useMemoizedFn } from "ahooks";
import { ChevronsDownUp, ChevronsUpDown, Ungroup } from "lucide-react";
import { produce } from "immer";

import { ColumnElement } from "../../../types";
import { ColumnColor, COLUMN_COLOR_OPTIONS } from "../../../types/column";
import { useBoard } from "../../../hooks";
import { ColumnUtil } from "../../../utils";
import { AttrAction, AttrPopover, SwatchRow } from "../../../chrome";
import SketchPopover from "../SketchPopover";

interface ColumnSetterProps {
  element: ColumnElement;
  onChange: (element: ColumnElement) => void;
}

const NO_COLOR = "none";

const ColumnSetter = memo(({ element, onChange }: ColumnSetterProps) => {
  const { t } = useAttributeI18n();
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
        label={t("attributes.column.color")}
        swatch={current ? { fill: current.token } : { fill: "transparent", kind: "none" }}
        width={220}
      >
        <SwatchRow
          options={[
            { key: NO_COLOR, label: t("attributes.none"), fill: "transparent", kind: "none" },
            ...COLUMN_COLOR_OPTIONS.map(o => ({
              key: o.value,
              label: attributeColor(o.value, o.label, t),
              fill: o.token,
            })),
          ]}
          value={element.color ?? NO_COLOR}
          onChange={handleColorChange}
        />
      </AttrPopover>
      <AttrAction
        label={element.collapsed ? t("attributes.expand") : t("attributes.collapse")}
        icon={
          element.collapsed ? (
            <ChevronsUpDown strokeWidth={1.75} />
          ) : (
            <ChevronsDownUp strokeWidth={1.75} />
          )
        }
        onClick={() => ColumnUtil.toggleCollapsed(board, element)}
      />
      <AttrAction
        label={t("attributes.column.dissolve")}
        icon={<Ungroup strokeWidth={1.75} />}
        onClick={handleDissolve}
      />
      <SketchPopover target={element} onChange={onChange} />
    </>
  );
});

export default ColumnSetter;
