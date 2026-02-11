import { Base } from "@tau/editor/src";
import { IExtension } from "@tau/editor/src";
import type { DocumentCardListElement } from "./types";

import DocumentListSlate from "./components/DocumentListSlate";
import { overwrite } from "./plugins";
import blockPanelItems from "./block-panel-items";
import { RenderElementProps } from "slate-react";
export type { DocumentCardListElement } from "./types";

class DocumentCardListExtension extends Base implements IExtension {
  type = "document-card-list";
  private documentId?: number;

  constructor(documentId?: number) {
    super();
    this.documentId = documentId;
  }

  override getPlugins() {
    return [overwrite];
  }

  override getBlockPanelItems() {
    return blockPanelItems(this.documentId);
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;

    return (
      <DocumentListSlate
        element={element as any as DocumentCardListElement}
        attributes={attributes}
      >
        {children}
      </DocumentListSlate>
    );
  }
}

export default DocumentCardListExtension;
