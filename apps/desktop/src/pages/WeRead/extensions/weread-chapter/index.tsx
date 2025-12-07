import type { RenderElementProps } from "slate-react";
import type { IExtension } from "@tau/editor/src";
import { Base } from "@tau/editor/src";
import { createBlockElementPlugin } from "@tau/editor/src";
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
