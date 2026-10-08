import { useWhiteboardHost } from "../host";
import type { ComponentProps } from "react";
export default function HostImage({
  url,
  ...props
}: Omit<ComponentProps<"img">, "src"> & { url: string }) {
  const Image = useWhiteboardHost().slots.Image;
  return Image ? <Image url={url} {...props} /> : <img src={url} {...props} />;
}
