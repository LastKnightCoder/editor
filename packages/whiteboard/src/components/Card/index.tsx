import { useWhiteboardHost } from "../../host";
import HostElement, { type HostElementProps } from "../HostElement";
export default function Card({ element, ...props }: HostElementProps) {
  const Component = useWhiteboardHost().slots.elements?.card;
  if (Component) return <Component element={element} {...props} />;
  return (
    <HostElement element={element} {...props}>
      卡片内容需要宿主支持
    </HostElement>
  );
}
