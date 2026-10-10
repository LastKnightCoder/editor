import { useElementContent } from "../../extensions/elementContent";
import ElementFrame, { type ElementFrameProps } from "../ElementFrame";
export default function VideoElement({ element, ...props }: ElementFrameProps) {
  const Component = useElementContent();
  if (Component) return <Component element={element} {...props} />;
  return (
    <ElementFrame element={element} {...props}>
      {element.metaInfo?.type === "bilibili" || element.metaInfo?.type === "youtube" ? (
        "视频平台内容需要宿主支持"
      ) : (
        <video src={element.src} controls className="size-full" />
      )}
    </ElementFrame>
  );
}
