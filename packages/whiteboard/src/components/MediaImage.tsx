import { useMediaExtension } from "../extensions/media";
import type { ComponentProps } from "react";
export default function MediaImage({
  url,
  ...props
}: Omit<ComponentProps<"img">, "src"> & { url: string }) {
  const Image = useMediaExtension().Image;
  return Image ? <Image url={url} {...props} /> : <img src={url} {...props} />;
}
