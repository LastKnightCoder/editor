import type { RenderElementProps } from "slate-react";
import type { IExtension } from "@tau/editor/src";
import { Base } from "@tau/editor/src";
import {
  createBlockElementPlugin,
  createVoidElementPlugin,
} from "@tau/editor/src";
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
