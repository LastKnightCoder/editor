import { useWhiteboardHost } from "../../host";
import HostElement, { type HostElementProps } from "../HostElement";
export default function WebviewElement({ element, ...props }: HostElementProps) {
  const Component = useWhiteboardHost().slots.elements?.webview;
  if (Component) return <Component element={element} {...props} />;
  return (
    <HostElement element={element} {...props}>
      网页内容需要宿主支持
    </HostElement>
  );
}
