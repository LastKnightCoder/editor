import { useBoard, useSelection } from "@/components/WhiteBoard/hooks";
import setterConfig from "./setter-config.ts";
import { useMemoizedFn } from "ahooks";
import { BoardElement, Operation } from "@/components/WhiteBoard";
import { PathUtil } from "@/components/WhiteBoard/utils";
import { usePresentationState } from "@/components/WhiteBoard/hooks";
const AttributeSetter = () => {
  const selection = useSelection();
  const board = useBoard();

  const { isPresentationMode } = usePresentationState();

  const onElementChange = useMemoizedFn((newElement: BoardElement) => {
    if (!selection) return;
    const path = PathUtil.getPathByElement(board, newElement);
    if (!path) return;
    const ops: Operation[] = [
      {
        type: "set_node",
        path,
        properties: element,
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

  if (isPresentationMode) return null;

  if (!selection || selection.selectedElements.length !== 1) return null;

  const element = selection.selectedElements[0];

  // @ts-ignore
  const config = setterConfig[element.type];

  if (config && config.component) {
    const Component = config.component;
    return <Component onChange={onElementChange} element={element} />;
  }

  return null;
};

export default AttributeSetter;
