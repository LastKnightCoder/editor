import { EventBus } from "./event-bus";
import { v4 as uuidv4 } from "uuid";
import { IContent } from "@/types";
import { Descendant } from "slate";
export interface ContentEventData {
  content: {
    id: number;
    content: Descendant[];
  };
  sourceUuid: string;
}

export interface ContentEventMap {
  "content:updated": ContentEventData;
  [key: string]: ContentEventData; // Allow custom events
}

export class ContentEditor {
  private uuid: string;
  private contentEventBus: ContentEventBus;

  constructor(contentEventBus: ContentEventBus) {
    this.uuid = uuidv4();
    this.contentEventBus = contentEventBus;
  }

  getUuid(): string {
    return this.uuid;
  }

  publishContentEvent<K extends keyof ContentEventMap>(
    event: K,
    content: IContent,
  ): void {
    this.contentEventBus.publish(event, {
      content,
      sourceUuid: this.uuid,
    });
  }

  subscribeToOtherEditors<K extends keyof ContentEventMap>(
    event: K,
    callback: (data: ContentEventMap[K]) => void,
  ): () => void {
    return this.contentEventBus.subscribe(event, (data) => {
      if (data.sourceUuid !== this.uuid) {
        callback(data);
      }
    });
  }

  subscribeToContentWithId<K extends keyof ContentEventMap>(
    event: K,
    contentId: number,
    callback: (data: ContentEventMap[K]) => void,
  ): () => void {
    return this.contentEventBus.subscribe(event, (data) => {
      if (data.sourceUuid !== this.uuid && data.content.id === contentId) {
        callback(data);
      }
    });
  }
}

export class ContentEventBus extends EventBus<ContentEventMap> {
  createEditor(): ContentEditor {
    return new ContentEditor(this);
  }

  subscribeToContent<K extends keyof ContentEventMap>(
    event: K,
    contentId: number,
    callback: (data: ContentEventMap[K]) => void,
    ignoreUuid?: string,
  ): () => void {
    return this.subscribe(event, (data) => {
      if (
        data.content.id === contentId &&
        (!ignoreUuid || data.sourceUuid !== ignoreUuid)
      ) {
        callback(data);
      }
    });
  }
}

const defaultContentEventBus = new ContentEventBus();

export { defaultContentEventBus };
