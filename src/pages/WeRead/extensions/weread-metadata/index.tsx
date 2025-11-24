import type { RenderElementProps } from "slate-react";
import type IExtension from "@/components/Editor/extensions/types";
import Base from "@/components/Editor/extensions/base";
import {
  createBlockElementPlugin,
  createVoidElementPlugin,
} from "@/components/Editor/utils/plugin";
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
