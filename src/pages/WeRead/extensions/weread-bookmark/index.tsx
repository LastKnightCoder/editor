import type { RenderElementProps } from "slate-react";
import type IExtension from "@/components/Editor/extensions/types";
import Base from "@/components/Editor/extensions/base";
import {
  createBlockElementPlugin,
  createVoidElementPlugin,
} from "@/components/Editor/utils/plugin";
import { Bookmark } from "./Bookmark";

class WeReadBookmarkExtension extends Base implements IExtension {
  type = "weread-bookmark";

  override getPlugins() {
    return [
      createBlockElementPlugin(this.type),
      createVoidElementPlugin(this.type),
    ];
  }

  render(props: RenderElementProps) {
    return <Bookmark {...props} />;
  }
}

export default WeReadBookmarkExtension;
