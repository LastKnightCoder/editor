import type { Editor } from "slate";
import { createServiceId } from "@tau/editor/api";
import type { DocTaskGroup } from "@/entity/doc-tasks";

/** 宿主注入的项目能力：扩展不依赖待办域 */
export interface DocTaskGroupsService {
  /** 进行中的项目（同步读缓存，装饰每次渲染都会调用） */
  list(): DocTaskGroup[];
  /** 订阅项目变化，用于重绘胶囊 */
  subscribe(listener: () => void): () => void;
  create(title: string): Promise<DocTaskGroup>;
  /** 项目色点 class（宿主色板），找不到返回空串 */
  dotClass(groupId: number): string;
}

export const IDocTaskGroups = createServiceId<DocTaskGroupsService>("docTaskGroups");

export const docTaskGroupsOf = (editor: Editor): DocTaskGroupsService | undefined =>
  editor.tryGetService?.(IDocTaskGroups);
