import { ICard } from "@/types";

export interface CardLinksPluginConfig {
  allCards: ICard[];
  currentCardId: number;
  onClickLink?: (cardId: number) => void;
}
