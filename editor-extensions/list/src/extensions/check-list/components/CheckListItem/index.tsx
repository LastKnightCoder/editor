import React, { PropsWithChildren } from "react";
import { RenderElementProps, useSlateStatic, useReadOnly } from "slate-react";
import { getCommandElementPath } from "@tau/editor/api";
import { CustomCheckbox } from "@tau/shared";
import type { CheckListItemElement } from "../../../../types";
import { Transforms } from "slate";
import { useMemoizedFn } from "ahooks";

interface CheckListItemProps {
  attributes: RenderElementProps["attributes"];
  element: CheckListItemElement;
}

const CheckListItem: React.FC<PropsWithChildren<CheckListItemProps>> = props => {
  const { attributes, children, element } = props;
  const { checked } = element;

  const editor = useSlateStatic();
  const readonly = useReadOnly();

  const onClick = useMemoizedFn(() => {
    const path = getCommandElementPath(editor, { element });
    if (!path) return;
    Transforms.setNodes(editor, { checked: !checked }, { at: path });
  });

  return (
    <div data-check-list-item className="relative">
      <li {...attributes} className="relative flex items-start gap-[0.5em] leading-[1.8]">
        <CustomCheckbox
          className="mt-[0.25em]!"
          checked={checked}
          onChange={onClick}
          readonly={readonly}
        />
        <div className="flex-1">{children}</div>
      </li>
    </div>
  );
};

export default CheckListItem;
