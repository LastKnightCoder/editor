import type { CardMetadataPatch, ICard } from "@/types/card";

type ReleaseMode = "immediate" | "deferred";
type InsertedCard = { id: number | bigint; createdAt: number };

interface CardContentStore {
  transaction<T>(apply: () => T): T;
  findOwnerForContent(contentId: number): ICard | null;
  readProjectItem(projectItemId: number): { contentId: number } | null;
  insertOwner(contentId: number, fields: CardMetadataPatch): InsertedCard;
  recordCreation(card: InsertedCard): ICard;
  readOwner(cardId: number): ICard | null;
  removeOwner(cardId: number): number;
  addReference(contentId: number): void;
  releaseReference(contentId: number, mode: ReleaseMode): void;
}

export class CardContentOwnership {
  constructor(private readonly store: CardContentStore) {}

  buildFromExisting(contentId: number, fields: CardMetadataPatch): ICard {
    return this.store.transaction(() => {
      const existing = this.store.findOwnerForContent(contentId);
      if (existing) return existing;
      const card = this.store.insertOwner(contentId, fields);
      this.store.addReference(contentId);
      return this.store.recordCreation(card);
    });
  }

  createFromProjectItem(projectItemId: number): ICard | null {
    return this.store.transaction(() => {
      const item = this.store.readProjectItem(projectItemId);
      if (!item) return null;
      this.store.addReference(item.contentId);
      const card = this.store.insertOwner(item.contentId, {});
      return this.store.recordCreation(card);
    });
  }

  deleteOwner(cardId: number, mode: ReleaseMode): number {
    return this.store.transaction(() => {
      const card = this.store.readOwner(cardId);
      const removed = this.store.removeOwner(cardId);
      if (removed && card?.contentId) this.store.releaseReference(card.contentId, mode);
      return removed;
    });
  }
}
