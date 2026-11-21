import { bindDatabaseCommands, currentCommandScope } from "@/services/command-context";
import { invoke } from "@/electron";
import type {
  ContentEntityTarget,
  ContentEntityReference,
} from "@tau/db-schema/content-identities";
import { openEditorWindow } from "@/commands/window";
import { EDragPosition, IDragItem } from "@/hooks/useDragAndDrop";
import {
  Project,
  ProjectItem,
  ProjectOpenState,
  ProjectDocumentMutation,
  ProjectDocumentMutationResult,
  CreateProject,
  UpdateProject,
  CreateProjectItem,
  UpdateProjectItem,
  EProjectItemType,
} from "@/types/project";

export const createProject = async (project: CreateProject): Promise<Project> => {
  return await invoke("create-project", project);
};

export const updateProject = async (project: UpdateProject): Promise<Project> => {
  return await invoke("update-project", project);
};

export const deleteProject = async (id: number): Promise<number> => {
  return await invoke("delete-project", id);
};

export const getProjectById = async (id: number): Promise<Project> => {
  return await invoke("get-project", id);
};

export const getProjectList = async (): Promise<Project[]> => {
  return await invoke("get-all-projects");
};

/** 全部项目的条目计数（含文档树深层节点）：projectId → 条目数 */
export const getProjectItemCounts = async (): Promise<Record<number, number>> => {
  return await invoke("get-project-item-counts");
};

/** 记录打开项目（不改 updateTime）；itemId 缺省时保留上次停留的文档 */
export const recordProjectOpen = async (projectId: number, itemId?: number): Promise<void> => {
  await invoke("project:record-open", projectId, itemId ?? null);
};

/** 打开过的项目：projectId → 打开时间 + 上次停留的文档 */
export const getProjectOpenStates = async (): Promise<Record<number, ProjectOpenState>> => {
  return await invoke("project:open-states");
};

export const updateProjectItem = async (item: UpdateProjectItem): Promise<ProjectItem | null> => {
  return await invoke("update-project-item", item);
};

export const getProjectItemById = async (id: ContentEntityTarget): Promise<ProjectItem | null> => {
  return await invoke("get-project-item", id);
};
export const getProjectItemReference = (id: number): Promise<ContentEntityReference> =>
  invoke("project-item:reference", id);
export const getProjectItemChildren = (
  target: ContentEntityTarget
): Promise<{ item: ProjectItem; reference: ContentEntityReference }[]> =>
  invoke("project-item:children", target);

export const getProjectItemsByIds = async (ids: number[]): Promise<ProjectItem[]> => {
  return await invoke("get-project-items-by-ids", ids);
};

export const getProjectItemByRef = async (
  refType: string,
  refId: number
): Promise<ProjectItem[]> => {
  return await invoke("get-project-item-by-ref", refType, refId);
};

export const getAllProjectItems = async (): Promise<ProjectItem[]> => {
  return await invoke("get-all-project-items");
};

export const getProjectItemsByContentId = async (contentId: number): Promise<ProjectItem[]> => {
  return await invoke("get-project-items-by-content-id", contentId);
};

export const addRootProjectItem = async (
  projectId: number,
  projectItem: CreateProjectItem
): Promise<[Project, ProjectItem | null]> => {
  const command = bindDatabaseCommands({ invoke }, currentCommandScope());
  if (
    projectItem.projectItemType === EProjectItemType.Document &&
    !projectItem.contentId &&
    !(projectItem.refType && projectItem.refId)
  )
    projectItem = {
      ...projectItem,
      ...(await (
        await import("@/services/editorKit")
      ).prepareNewContent(projectItem.content, projectItem.contracts)),
    };
  return await command.invoke("add-root-project-item", projectId, projectItem);
};

export const addChildProjectItem = async (
  parentProjectItemId: number,
  projectItem: CreateProjectItem
): Promise<[ProjectItem | null, ProjectItem | null]> => {
  const command = bindDatabaseCommands({ invoke }, currentCommandScope());
  if (
    projectItem.projectItemType === EProjectItemType.Document &&
    !projectItem.contentId &&
    !(projectItem.refType && projectItem.refId)
  )
    projectItem = {
      ...projectItem,
      ...(await (
        await import("@/services/editorKit")
      ).prepareNewContent(projectItem.content, projectItem.contracts)),
    };
  return await command.invoke("add-child-project-item", parentProjectItemId, projectItem);
};

export const createSharedProjectItemFromContent = async (params: {
  sourceContentId: number;
  projectId: number;
  parentProjectItemId?: number | null;
  title: string;
}): Promise<ProjectItem | null> => {
  const payload: CreateProjectItem = {
    title: params.title,
    content: [],
    count: 0,
    children: [],
    refType: "content",
    refId: params.sourceContentId,
    whiteboardContentId: 0,
    projectItemType: EProjectItemType.Document,
  };

  if (params.parentProjectItemId) {
    const [, item] = await addChildProjectItem(params.parentProjectItemId, payload);
    return item;
  }

  const [, item] = await addRootProjectItem(params.projectId, payload);
  return item;
};

export const removeRootProjectItem = async (
  projectId: number,
  projectItemId: number,
  notDelete?: boolean
): Promise<[Project, ProjectItem | null]> => {
  return await invoke("remove-root-project-item", projectId, projectItemId, notDelete);
};

export const removeChildProjectItem = async (
  projectId: number,
  parentProjectItemId: number,
  projectItemId: number,
  notDelete?: boolean
): Promise<[ProjectItem | null, ProjectItem | null]> => {
  return await invoke(
    "remove-child-project-item",
    projectId,
    parentProjectItemId,
    projectItemId,
    notDelete
  );
};

export const moveProjectTreeItem = async (
  projectId: number,
  params: {
    dragItem: IDragItem;
    dropTargetId: number;
    dropTargetParentId: number;
    dropTargetIsRoot: boolean;
    dragPosition: EDragPosition;
    childInsertIndex?: number;
    insertParentId?: number;
    insertParentIsRoot?: boolean;
    insertIndex?: number;
  }
): Promise<{ movedItemId: number; refreshItemIds: number[] } | null> => {
  return await invoke("move-project-tree-item", projectId, params);
};

export const openProjectItemInNewWindow = (databaseName: string, projectItemId: number) => {
  return openEditorWindow({ kind: "project-item", databaseName, id: projectItemId });
};

export async function mutateProjectDocument(
  request: ProjectDocumentMutation
): Promise<ProjectDocumentMutationResult> {
  const command = bindDatabaseCommands({ invoke }, currentCommandScope());
  if (request.action === "create") {
    const { prepareNewContent } = await import("@/services/editorKit");
    const document = await prepareNewContent(request.item.content, request.item.contracts);
    request = { ...request, item: { ...request.item, ...document } };
  }
  return command.invoke("project:mutate-document", request);
}
