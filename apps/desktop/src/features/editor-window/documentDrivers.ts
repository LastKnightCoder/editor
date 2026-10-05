/**
 * 编辑窗口的内容驱动：把卡片 / 文章 / 项目文档三种实体映射成统一的「文档」视图，
 * 并提供读、写、进程内广播与订阅。窗口外壳只依赖 DocumentDriver，不感知具体实体。
 *
 * 保存分工同详情页：正文走 ContentEditor 文档会话，这里只负责元数据
 * （标题 / 标签）；跨窗口同步由主进程 broadcastOthers → useItemUpdateListener 转进程内总线。
 */

import type { Descendant } from "slate";
import { CreditCard, FileText, FolderOpen, type LucideIcon } from "lucide-react";
import type { EditorWindowKind } from "@tau/platform";
import type { AnyExtension } from "@tau/editor";
import { getCardById, updateCard } from "@/commands/card";
import { findOneArticle, updateArticle } from "@/commands/article";
import { getProjectItemById, updateProjectItem } from "@/commands/project";
import { createProjectCardListExtension } from "@/editor-extensions";
import {
  defaultArticleEventBus,
  defaultCardEventBus,
  defaultProjectItemEventBus,
} from "@/utils/event-bus";
import type { IArticle, ICard } from "@/types";
import type { ProjectItem } from "@/types/project";

/** 外壳消费的统一视图；title / tags 为 undefined 表示该类型没有这个字段 */
export interface EditorDocument {
  id: number;
  contentId: number;
  content: Descendant[];
  title?: string;
  /** 卡片的 AI 标题（没有标题字段的类型用它作窗口标题） */
  aiTitle?: string;
  tags?: string[];
  createTime: number;
  updateTime: number;
}

export interface DocumentFields {
  title?: string;
  tags?: string[];
  content?: Descendant[];
}

export interface DocumentDriver<Entity = unknown> {
  kind: EditorWindowKind;
  /** 类型名与图标（标题栏徽标、空态文案） */
  label: string;
  icon: LucideIcon;
  hasTitle: boolean;
  hasTags: boolean;
  load(id: number): Promise<Entity | null>;
  /** 持久化元数据；返回落库后的实体 */
  save(entity: Entity): Promise<Entity | null>;
  toDocument(entity: Entity): EditorDocument;
  withFields(entity: Entity, fields: DocumentFields): Entity;
  /** 进程内总线：每个窗口实例一个 editor（按 sourceUuid 过滤掉自己发的事件） */
  createBus(): {
    publish(entity: Entity): void;
    subscribe(id: number, onRemote: (entity: Entity) => void): () => void;
  };
  /** 该类型额外的编辑器扩展 */
  extensions?(id: number): AnyExtension[];
}

/** 元数据变更比对：正文与字数不参与（正文另有链路，字数由主进程按正文计算） */
export const metadataSignature = (entity: unknown) =>
  JSON.stringify({ ...(entity as object), content: undefined, count: undefined });

const cardDriver: DocumentDriver<ICard> = {
  kind: "card",
  label: "卡片",
  icon: CreditCard,
  hasTitle: false,
  hasTags: true,
  load: id => getCardById(id).then(card => card ?? null),
  save: card => updateCard(card),
  toDocument: card => ({
    id: card.id,
    contentId: card.contentId,
    content: card.content,
    aiTitle: card.aiTitle,
    tags: card.tags,
    createTime: card.create_time,
    updateTime: card.update_time,
  }),
  withFields: (card, { tags, content }) => ({
    ...card,
    ...(tags && { tags }),
    ...(content && { content }),
  }),
  createBus() {
    const bus = defaultCardEventBus.createEditor();
    return {
      publish: card => bus.publishCardEvent("card:updated", card),
      subscribe: (id, onRemote) =>
        bus.subscribeToCardWithId("card:updated", id, d => onRemote(d.card)),
    };
  },
};

const articleDriver: DocumentDriver<IArticle> = {
  kind: "article",
  label: "文章",
  icon: FileText,
  hasTitle: true,
  hasTags: true,
  load: id => findOneArticle(id).then(article => article ?? null),
  save: article => updateArticle(article),
  toDocument: article => ({
    id: article.id,
    contentId: article.contentId,
    content: article.content,
    title: article.title,
    tags: article.tags,
    createTime: article.create_time,
    updateTime: article.update_time,
  }),
  withFields: (article, { title, tags, content }) => ({
    ...article,
    ...(title !== undefined && { title }),
    ...(tags && { tags }),
    ...(content && { content }),
  }),
  createBus() {
    const bus = defaultArticleEventBus.createEditor();
    return {
      publish: article => bus.publishArticleEvent("article:updated", article),
      subscribe: (id, onRemote) =>
        bus.subscribeToArticleWithId("article:updated", id, d => onRemote(d.article)),
    };
  },
};

const projectItemDriver: DocumentDriver<ProjectItem> = {
  kind: "project-item",
  label: "项目",
  icon: FolderOpen,
  hasTitle: true,
  hasTags: false,
  load: id => getProjectItemById(id),
  save: item => updateProjectItem(item),
  toDocument: item => ({
    id: item.id,
    contentId: item.contentId,
    content: item.content,
    title: item.title,
    createTime: item.createTime,
    updateTime: item.updateTime,
  }),
  withFields: (item, { title, content }) => ({
    ...item,
    ...(title !== undefined && { title }),
    ...(content && { content }),
  }),
  createBus() {
    const bus = defaultProjectItemEventBus.createEditor();
    return {
      publish: item => bus.publishProjectItemEvent("project-item:updated", item),
      subscribe: (id, onRemote) =>
        bus.subscribeToProjectItemWithId("project-item:updated", id, d => onRemote(d.projectItem)),
    };
  },
  extensions: id => [createProjectCardListExtension(id)],
};

export const DOCUMENT_DRIVERS: Record<EditorWindowKind, DocumentDriver> = {
  card: cardDriver as DocumentDriver,
  article: articleDriver as DocumentDriver,
  "project-item": projectItemDriver as DocumentDriver,
};

export const isEditorWindowKind = (value: string | null): value is EditorWindowKind =>
  value !== null && value in DOCUMENT_DRIVERS;
