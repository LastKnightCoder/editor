import { PageSchematic } from "@tau/whiteboard";
import type { ComponentProps } from "react";
import { desktopContentPlugins } from "../../../../shared/content-plugins";

/** 列表预览直接使用启动定义目录，不创建画布或激活插件。 */
export function DesktopPageSchematic(
  props: Omit<ComponentProps<typeof PageSchematic>, "definitions">
) {
  return <PageSchematic {...props} definitions={desktopContentPlugins.whiteboardElements} />;
}
