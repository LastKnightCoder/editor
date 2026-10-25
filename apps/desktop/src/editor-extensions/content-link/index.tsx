import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor";

import type { ContentLinkElement } from "./types";
import ContentLink from "./components/ContentLink";

import { contentLinkBehaviors, contentLinkForParagraph } from "./behaviors";
import { mentionCommands, mentionHotkeys } from "./commands";
import hoveringBarConfigs from "./hovering-bar-configs";
export type { ContentLinkElement } from "./types";

const contentLinkExtension = defineExtension({
  id: "host.content-link",
  elements: [
    defineElement<ContentLinkElement>({
      type: "content-link",
      dataVersion: 1,
      kind: "inline",
      render: ({ attributes, element, children }: ElementRenderProps<ContentLinkElement>) => (
        <ContentLink attributes={attributes} element={element}>
          {children}
        </ContentLink>
      ),
      behaviors: contentLinkBehaviors,
    }),
  ],
  toolbar: hoveringBarConfigs,
  commands: mentionCommands,
  hotkeys: mentionHotkeys,
  behaviorsFor: {
    paragraph: contentLinkForParagraph,
  },
});

export default contentLinkExtension;
