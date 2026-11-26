import { HostSupportHint } from "../HostSupportHint";
import { useElementContent } from "../../extensions/elementContent";
import ElementFrame, { type ElementFrameProps } from "../ElementFrame";
export default function WebviewElement({ element, ...props }: ElementFrameProps) {
  const Component = useElementContent();
  if (Component) return <Component element={element} {...props} />;
  return (
    <ElementFrame element={element} {...props}>
      <HostSupportHint kind="webview" />
    </ElementFrame>
  );
}
