import React, { PropsWithChildren } from "react";
import { RenderElementProps, useSlateStatic, useReadOnly } from "slate-react";
import { getCommandElementPath } from "@tau/editor/api";
// 走窄入口，避免 @tau/shared 根桶（含 MediaPlayer 等渲染组件）进入
// 主进程依赖图（本组件经 checkList 扩展定义被主进程结构性引用）
import CustomCheckbox from "@tau/shared/custom-checkbox";
import type { CheckListItemElement } from "../../../../types";
import { Transforms } from "slate";
import { useMemoizedFn } from "ahooks";
import {
  documentTaskCheck,
  documentTaskIsChecked,
  documentTaskOccurrence,
} from "@tau/shared/task-assistant";

interface CheckListItemProps {
  attributes: RenderElementProps["attributes"];
  element: CheckListItemElement;
}

const CheckListItem: React.FC<PropsWithChildren<CheckListItemProps>> = props => {
  const { attributes, children, element } = props;
  const checked = documentTaskIsChecked(element);
  const unavailable = !!element.taskRecurrence?.segments.length && !documentTaskOccurrence(element);

  const editor = useSlateStatic();
  const readonly = useReadOnly();

  const onClick = useMemoizedFn(() => {
    const path = getCommandElementPath(editor, { element });
    if (!path) return;
    const patch = documentTaskCheck(element, !checked);
    if (patch) Transforms.setNodes(editor, patch, { at: path });
  });

  return (
    <div
      data-check-list-item
      className="relative"
      title={unavailable ? "当前没有可直接勾选的实例，请通过待办助理查询具体日期。" : undefined}
    >
      <li {...attributes} className="relative flex items-start gap-[0.5em] leading-[1.8]">
        <CustomCheckbox
          className="mt-[0.25em]!"
          checked={checked}
          onChange={onClick}
          readonly={readonly || unavailable}
        />
        <div className="flex-1">{children}</div>
      </li>
    </div>
  );
};

export default CheckListItem;
