export type ShortcutResourceType = "card" | "article" | "document" | "project";

export type ShortcutScope = "module" | "item";

export interface ShortcutMeta {
  iconHint?: string;
  description?: string;
}

export interface Shortcut {
  id: number;
  createTime: number;
  updateTime: number;
  sortIndex: number;
  resourceType: ShortcutResourceType;
  scope: ShortcutScope;
  resourceId?: number;
  projectItemId?: number;
  documentItemId?: number;
  title: string;
  meta: ShortcutMeta;
}

export interface CreateShortcutPayload {
  resourceType: ShortcutResourceType;
  scope: ShortcutScope;
  resourceId?: number;
  projectItemId?: number;
  documentItemId?: number;
  title: string;
  meta?: ShortcutMeta;
}

export interface UpdateShortcutPayload {
  id: number;
  title?: string;
  sortIndex?: number;
  meta?: ShortcutMeta;
}

export interface FindShortcutParams {
  resourceType: ShortcutResourceType;
  scope: ShortcutScope;
  resourceId?: number;
  projectItemId?: number;
  documentItemId?: number;
}
