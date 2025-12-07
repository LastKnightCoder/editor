import type { RenderElementProps } from "slate-react";
import type { IExtension } from "@tau/editor/src";
import { Base } from "@tau/editor/src";
import {
  createBlockElementPlugin,
  createVoidElementPlugin,
} from "@tau/editor/src";
import { MetadataCard } from "./MetadataCard";

class WeReadMetadataExtension extends Base implements IExtension {
  type = "weread-metadata";

  override getPlugins() {
    return [
      createBlockElementPlugin(this.type),
      createVoidElementPlugin(this.type),
    ];
  }

  render(props: RenderElementProps) {
    return <MetadataCard {...props} />;
  }
}

export default WeReadMetadataExtension;
