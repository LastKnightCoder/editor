import { useMemoizedFn } from "ahooks";
import {
  useBoard,
  useSelection,
  usePresentationState,
} from "@/components/WhiteBoard/hooks";
import {
  BoardElement,
  MindNodeElement,
  Operation,
  FrameElement,
} from "@/components/WhiteBoard/types";
import { FrameUtil, MindUtil, PathUtil } from "@/components/WhiteBoard/utils";
import setterConfig from "./setter-config.ts";

const AttributeSetter = () => {
  const selection = useSelection();
  const board = useBoard();

  const { isPresentationMode } = usePresentationState();

  const onElementChange = useMemoizedFn((newElement: BoardElement) => {
    if (!selection) return;
    const path = PathUtil.getPathByElement(board, newElement);
    if (!path) return;

    // 找到原始元素
    const originalElement = selection.selectedElements.find(
      (el) => el.id === newElement.id,
    );
    if (!originalElement) return;

    const ops: Operation[] = [
      {
        type: "set_node",
        path,
        properties: originalElement,
        newProperties: newElement,
      },
      {
        type: "set_selection",
        properties: selection,
        newProperties: {
          ...selection,
          selectedElements: [newElement],
        },
      },
    ];
    board.apply(ops);
  });

  const onMultiElementsChange = useMemoizedFn((newElements: BoardElement[]) => {
    if (!selection) return;

    const ops: Operation[] = [];
    const selectedElements = selection.selectedElements;
    const notChangedElements = selectedElements.filter(
      (el) => !newElements.map((el) => el.id).includes(el.id),
    );

    newElements.forEach((newElement) => {
      const originalElement = selectedElements.find(
        (el) => el.id === newElement.id,
      );
      if (!originalElement) return;

      const path = PathUtil.getPathByElement(board, newElement);
      if (!path) return;

      ops.push({
        type: "set_node",
        path,
        properties: originalElement,
        newProperties: newElement,
      });
    });

    ops.push({
      type: "set_selection",
      properties: selection,
      newProperties: {
        ...selection,
        selectedElements: [...notChangedElements, ...newElements],
      },
    });
    if (ops.length > 0) {
      board.apply(ops);
    }
  });

  if (isPresentationMode) return null;

  if (!selection) return null;

  const frames = selection.selectedElements.filter((el) => el.type === "frame");

  const validElements = selection.selectedElements.filter(
    (el) =>
      el.type !== "arrow" &&
      (el.type !== "mind-node" || MindUtil.isRoot(el as MindNodeElement)) &&
      !frames.some((frame) =>
        FrameUtil.isChildInFrame(frame as FrameElement, el),
      ),
  );

  if (selection.selectedElements.length > 1 && validElements.length <= 1) {
    return null;
  }

  // 多选元素的情况
  if (validElements.length > 1) {
    const MultiSelectComponent = setterConfig.multiselect.component;
    return (
      <MultiSelectComponent
        elements={validElements}
        onChange={onMultiElementsChange}
      />
    );
  }

  // 单选元素的情况
  if (selection.selectedElements.length === 1) {
    const element = selection.selectedElements[0];

    // @ts-ignore
    const config = setterConfig[element.type];

    if (config && config.component) {
      const Component = config.component;
      return <Component onChange={onElementChange} element={element} />;
    }
  }

  return null;
};

export default AttributeSetter;
