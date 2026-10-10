import { useEffect, useState, type ComponentType } from "react";
import {
  useBoard,
  type ContextMenuModalPayload,
  type WhiteboardLayerContribution,
} from "@tau/whiteboard";

/** 选择器随所属扩展装配，工具栏和右键菜单共用同一入口。 */
export function selectorLayer(
  type: ContextMenuModalPayload["type"],
  Selector: ComponentType<any>
): WhiteboardLayerContribution {
  function SelectorLayer() {
    const board = useBoard();
    const [request, setRequest] = useState<ContextMenuModalPayload | null>(null);
    useEffect(() => {
      const open = (payload: ContextMenuModalPayload) => {
        if (payload.type === type) setRequest(payload);
      };
      board.on("context-menu:open-modal", open);
      return () => board.off("context-menu:open-modal", open);
    }, [board]);
    return (
      <Selector
        open={!!request}
        board={board}
        action={request?.action}
        onClose={() => setRequest(null)}
      />
    );
  }
  return { id: `tau.${type}.selector`, position: "outside", component: SelectorLayer };
}
