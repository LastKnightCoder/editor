import React, { useEffect, memo } from "react";
import { useBoard, useSelection } from "@/components/WhiteBoard/hooks";
import { BoardElement, IComponentConfig, Operation } from "@/components/WhiteBoard";
import { PathUtil } from "@/components/WhiteBoard/utils";

import componentConfig from './config.ts';
import { useMemoizedFn } from "ahooks";

const ComponentConfig = memo(() => {
  const selection = useSelection();
  const board = useBoard();

  useEffect(() => {
    if (!selection || selection.selectedElements.length !== 1) {
      board.isEditingProperties = false;
      return;
    }
    const element = selection.selectedElements[0];
    if (!element) {
      board.isEditingProperties = false;
      return;
    }
    // @ts-ignore
    const config = componentConfig[element.type];
    if (!config || !config.component) {
      board.isEditingProperties = false;
      return;
    }
  }, [board, selection]);

  const onElementChange = useMemoizedFn((newElement: BoardElement) => {
    if (!selection) return;
    const path = PathUtil.getPathByElement(board, newElement);
    if (!path) return;
    const ops: Operation[] = [{
      type: 'set_node',
      path,
      properties: element,
      newProperties: newElement,
    }, {
      type: 'set_selection',
      properties: selection,
      newProperties: {
        ...selection,
        selectedElements: [newElement],
      }
    }]
    board.apply(ops);
  })

  const handleOnFocus = useMemoizedFn(() => {
    board.isEditingProperties = true;
  })

  const handleOnBlur = useMemoizedFn(() => {
    board.isEditingProperties = false;
  });

  if (!selection || selection.selectedElements.length !== 1) return null;

  const element = selection.selectedElements[0];

  // @ts-ignore
  const config = componentConfig[element.type];

  if (config && config.component) {
    const Component: React.FC<IComponentConfig<BoardElement>> = config.component;
    return (
      <Component
        onChange={onElementChange}
        onFocus={handleOnFocus}
        onBlur={handleOnBlur}
        element={element}
      />
    )
  }

  return null;
});

export default ComponentConfig;
