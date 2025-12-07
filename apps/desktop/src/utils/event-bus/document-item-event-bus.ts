import { EventBus } from "./event-bus";
import { IDocumentItem } from "../../types/document";
import { v4 as uuidv4 } from "uuid";

export interface DocumentItemEventData {
  documentItem: IDocumentItem;
  sourceUuid: string;
}

export interface DocumentItemEventMap {
  "document-item:created": DocumentItemEventData;
  "document-item:updated": DocumentItemEventData;
  "document-item:deleted": DocumentItemEventData;
  "document-item:content-changed": DocumentItemEventData;
  "document-item:title-changed": DocumentItemEventData;
  "document-item:children-changed": DocumentItemEventData;
  "document-item:parents-changed": DocumentItemEventData;
  "document-item:tags-changed": DocumentItemEventData;
  [key: string]: DocumentItemEventData;
}

export class DocumentItemEditor {
  private uuid: string;
  private documentItemEventBus: DocumentItemEventBus;

  constructor(documentItemEventBus: DocumentItemEventBus) {
    this.uuid = uuidv4();
    this.documentItemEventBus = documentItemEventBus;
  }

  getUuid(): string {
    return this.uuid;
  }

  publishDocumentItemEvent<K extends keyof DocumentItemEventMap>(
    event: K,
    documentItem: IDocumentItem,
  ): void {
    this.documentItemEventBus.publish(event, {
      documentItem,
      sourceUuid: this.uuid,
    });
  }

  subscribeToOtherEditors<K extends keyof DocumentItemEventMap>(
    event: K,
    callback: (data: DocumentItemEventMap[K]) => void,
  ): () => void {
    return this.documentItemEventBus.subscribe(event, (data) => {
      if (data.sourceUuid !== this.uuid) {
        callback(data);
      }
    });
  }

  subscribeToDocumentItemWithId<K extends keyof DocumentItemEventMap>(
    event: K,
    documentItemId: number,
    callback: (data: DocumentItemEventMap[K]) => void,
  ): () => void {
    return this.documentItemEventBus.subscribe(event, (data) => {
      if (
        data.sourceUuid !== this.uuid &&
        data.documentItem.id === documentItemId
      ) {
        callback(data);
      }
    });
  }
}

export class DocumentItemEventBus extends EventBus<DocumentItemEventMap> {
  createEditor(): DocumentItemEditor {
    return new DocumentItemEditor(this);
  }

  subscribeToDocumentItem<K extends keyof DocumentItemEventMap>(
    event: K,
    documentItemId: number,
    callback: (data: DocumentItemEventMap[K]) => void,
    ignoreUuid?: string,
  ): () => void {
    return this.subscribe(event, (data) => {
      if (
        data.documentItem.id === documentItemId &&
        (!ignoreUuid || data.sourceUuid !== ignoreUuid)
      ) {
        callback(data);
      }
    });
  }
}

const defaultDocumentItemEventBus = new DocumentItemEventBus();

export { defaultDocumentItemEventBus };
