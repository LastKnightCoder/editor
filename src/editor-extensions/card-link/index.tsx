import { RenderElementProps } from "slate-react";

import Base from "@/components/Editor/extensions/base.ts";
import IExtension from "@/components/Editor/extensions/types.ts";
import { InlineElement } from "@/components/Editor/types";
import CardLink from "./components/CardLink";

import { withSetting, normalize } from './plugins';
import hoveringBarConfigs from './hovering-bar-configs';

export interface CardLinkElement {
  type: 'card-link';
  cardId: number;
  children: InlineElement[];
}

class CardLinkExtension extends Base implements IExtension {
  type = 'card-link';

  override getPlugins() {
    return [withSetting, normalize]
  }

  override getHoveringBarElements() {
    return hoveringBarConfigs;
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;

    return (
      <CardLink attributes={attributes} element={element as unknown as CardLinkElement}>
        {children}
      </CardLink>
    )
  }
}

export default CardLinkExtension;