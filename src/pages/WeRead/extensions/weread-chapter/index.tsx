import type { RenderElementProps } from "slate-react";
import type IExtension from "@/components/Editor/extensions/types";
import Base from "@/components/Editor/extensions/base";
import { createBlockElementPlugin } from "@/components/Editor/utils/plugin";
import { Chapter } from "./Chapter";
import { withNormalize } from "./plugins/normalize";

class WeReadChapterExtension extends Base implements IExtension {
  type = "weread-chapter";

  override getPlugins() {
    return [createBlockElementPlugin(this.type), withNormalize];
  }

  render(props: RenderElementProps) {
    return <Chapter {...props} />;
  }
}

export default WeReadChapterExtension;
