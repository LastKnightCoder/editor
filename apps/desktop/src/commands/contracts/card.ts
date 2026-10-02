import { command } from "@tau/rpc";
import type {
  ICard,
  ICreateCard,
  IUpdateCard,
  CardMetadataPatch,
  CardDatabaseScope,
} from "@/types/card";

/** 卡片内容按 id 批量取回的条目（供 AI 等消费方的受控摘要） */
export interface CardContentResult {
  id: number;
  markdown: string;
  truncated: boolean;
  originalLength: number;
  metadata: Record<string, any>;
}

export interface RandomCardsQuery {
  seed: number;
  count?: number;
}

/**
 * 卡片域命令契约。主进程注册在 database.ts 通用包装层（tables 模式），
 * 本契约当前约束渲染侧调用的 channel 与类型；主进程注册点契约化随 tables 批次推进。
 */
export const cardCommands = {
  getScoped: command<[CardDatabaseScope], ICard[]>("cards:get-scoped"),
  getScopedDetail: command<[CardDatabaseScope & { id: number }], ICard>("cards:get-scoped-card"),
  createScoped: command<[CardDatabaseScope & { card: ICreateCard }], ICard>("cards:create-scoped"),
  patchScoped: command<[CardDatabaseScope & { id: number; patch: CardMetadataPatch }], ICard>(
    "cards:patch-scoped"
  ),
  removeScoped: command<[CardDatabaseScope & { id: number }], number>("cards:remove-scoped"),
  create: command<[ICreateCard], ICard>("create-card"),
  createFromProjectItem: command<[number], ICard>("create-card-from-project-item"),
  getAll: command<[], ICard[]>("get-all-cards"),
  remove: command<[number], number>("delete-card"),
  update: command<[IUpdateCard], ICard>("update-card"),
  getById: command<[number], ICard>("get-card-by-id"),
  getTagsById: command<[number], string[]>("get-tags-by-id"),
  getGroupedByTag: command<[], Record<string, ICard[]>>("get-cards-group-by-tag"),
  getAllGlobalTags: command<[], string[]>("get-all-global-tags"),
  getRandomPermanent: command<[RandomCardsQuery], ICard[]>("get-random-permanent-cards"),
  getRecentTempLit: command<[number?], ICard[]>("get-recent-temp-lit-cards"),
  isContentIsCard: command<[number], boolean>("is-content-is-card"),
  getByContentId: command<[number], ICard | null>("get-card-by-content-id"),
  buildFromContent: command<[number], ICard>("build-card-from-content"),
  getByDates: command<[string[]], Record<string, ICard[]>>("get-cards-by-dates"),
  getByDateRange: command<[string, string], Record<string, ICard[]>>("get-cards-by-date-range"),
  getContentByIds: command<[number[], (number | undefined)?], CardContentResult[]>(
    "get-cards-content-by-ids"
  ),
};
