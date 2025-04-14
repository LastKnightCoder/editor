import { RenderElementProps } from "slate-react";

import Base from "@/components/Editor/extensions/base.ts";
import IExtension from "@/components/Editor/extensions/types.ts";
import { InlineElement } from "@/components/Editor/types";
import ContentLink from "./components/ContentLink";

import { withSetting, normalize } from "./plugins";
import hoveringBarConfigs from "./hovering-bar-configs";

export interface ContentLinkElement {
  type: "content-link";
  refId: number;
  contentId: number;
  contentType: string;
  contentTitle: string;
  children: InlineElement[];
}

class ContentLinkExtension extends Base implements IExtension {
  type = "content-link";

  override getPlugins() {
    return [withSetting, normalize];
  }

  override getHoveringBarElements() {
    return hoveringBarConfigs;
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;

    return (
      <ContentLink
        attributes={attributes}
        element={element as unknown as ContentLinkElement}
      >
        {children}
      </ContentLink>
    );
  }
}

export default ContentLinkExtension;
