import { RenderElementProps } from "slate-react";

import { Base } from "@tau/editor/src";
import { IExtension } from "@tau/editor/src";
import type { ContentLinkElement } from "./types";
import ContentLink from "./components/ContentLink";

import { withSetting, normalize } from "./plugins";
import { withMentionCommands } from "./plugins/withMentionCommands";
import hoveringBarConfigs from "./hovering-bar-configs";
import { mentionCommandConfig } from "./hotkeys/mentionCommand";
export type { ContentLinkElement } from "./types";

class ContentLinkExtension extends Base implements IExtension {
  type = "content-link";

  override getPlugins() {
    return [withSetting, normalize, withMentionCommands];
  }

  override getHotkeyConfigs() {
    return mentionCommandConfig;
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
