import { EventBus } from "./event-bus";
import { ICard } from "../../types/card";
import { v4 as uuidv4 } from "uuid";

export interface CardEventData {
  card: ICard;
  sourceUuid: string;
}

export interface CardEventMap {
  "card:created": CardEventData;
  "card:updated": CardEventData;
  "card:deleted": CardEventData;
  "card:content-changed": CardEventData;
  "card:tags-changed": CardEventData;
  "card:links-changed": CardEventData;
  [key: string]: CardEventData; // Allow custom events
}

export class CardEditor {
  private uuid: string;
  private cardEventBus: CardEventBus;

  constructor(cardEventBus: CardEventBus) {
    this.uuid = uuidv4();
    this.cardEventBus = cardEventBus;
  }

  getUuid(): string {
    return this.uuid;
  }

  publishCardEvent<K extends keyof CardEventMap>(event: K, card: ICard): void {
    this.cardEventBus.publish(event, {
      card,
      sourceUuid: this.uuid,
    });
  }

  subscribeToOtherEditors<K extends keyof CardEventMap>(
    event: K,
    callback: (data: CardEventMap[K]) => void,
  ): () => void {
    return this.cardEventBus.subscribe(event, (data) => {
      if (data.sourceUuid !== this.uuid) {
        callback(data);
      }
    });
  }

  subscribeToCardWithId<K extends keyof CardEventMap>(
    event: K,
    cardId: number,
    callback: (data: CardEventMap[K]) => void,
  ): () => void {
    return this.cardEventBus.subscribe(event, (data) => {
      if (data.sourceUuid !== this.uuid && data.card.id === cardId) {
        callback(data);
      }
    });
  }
}

export class CardEventBus extends EventBus<CardEventMap> {
  createEditor(): CardEditor {
    return new CardEditor(this);
  }

  subscribeToCard<K extends keyof CardEventMap>(
    event: K,
    cardId: number,
    callback: (data: CardEventMap[K]) => void,
    ignoreUuid?: string,
  ): () => void {
    return this.subscribe(event, (data) => {
      if (
        data.card.id === cardId &&
        (!ignoreUuid || data.sourceUuid !== ignoreUuid)
      ) {
        callback(data);
      }
    });
  }
}

const defaultCardEventBus = new CardEventBus();

export { defaultCardEventBus };
