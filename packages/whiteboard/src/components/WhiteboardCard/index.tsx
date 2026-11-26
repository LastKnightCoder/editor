import { HostSupportHint } from "../HostSupportHint";
import { useElementContent } from "../../extensions/elementContent";
import type { BoardElement } from "../../types";
export default function WhiteboardCard({
  element,
  ...props
}: {
  element: BoardElement;
  [key: string]: unknown;
}) {
  const Component = useElementContent();
  if (Component) return <Component element={element} {...props} />;
  return (
    <foreignObject x={element.x} y={element.y} width={element.width} height={element.height || 80}>
      <div className="bg-surface border-line-1 text-ink-3 rounded-tau-sm text-tau-meta flex size-full items-center justify-center border">
        <HostSupportHint kind="whiteboard" />
      </div>
    </foreignObject>
  );
}
export const WHITEBOARD_CARD_HEIGHT = 80;
