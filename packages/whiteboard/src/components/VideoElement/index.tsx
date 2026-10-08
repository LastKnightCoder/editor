import { useWhiteboardHost } from "../../host";
import HostElement, { type HostElementProps } from "../HostElement";
export default function VideoElement({ element, ...props }: HostElementProps) {
  const Component = useWhiteboardHost().slots.elements?.video;
  if (Component) return <Component element={element} {...props} />;
  return (
    <HostElement element={element} {...props}>
      {element.metaInfo?.type === "bilibili" || element.metaInfo?.type === "youtube" ? (
        "视频平台内容需要宿主支持"
      ) : (
        <video src={element.src} controls className="size-full" />
      )}
    </HostElement>
  );
}
