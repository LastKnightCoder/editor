import { useElementContent } from "../../extensions/elementContent";
import ElementFrame, { type ElementFrameProps } from "../ElementFrame";
export default function VideoElement({ element, ...props }: ElementFrameProps) {
  const Component = useElementContent();
  if (Component) return <Component element={element} {...props} />;
  return (
    <ElementFrame element={element} {...props}>
      {element.metaInfo &&
      element.metaInfo.type !== "local" &&
      element.metaInfo.type !== "remote" ? (
        "该视频请在桌面端查看"
      ) : (
        <video src={element.src} controls className="size-full" />
      )}
    </ElementFrame>
  );
}
