import {
  EProjectItemType,
  type CreateProjectItem,
  type Project,
  type ProjectItem,
} from "@/types/project";

type ProjectItemContentReference = "content" | "card" | "article";
type ReleaseMode = "immediate" | "deferred";
type ItemPlacement = { parents: number[]; projects: number[] };
type ReadItem = (id: number) => ProjectItem | null;

interface ProjectItemStore {
  transaction<T>(apply: () => T): T;
  readProject(id: number): Project;
  readItem: ReadItem;
  writeProject(project: Project): void;
  writeDirectoryItem(item: ProjectItem): ProjectItem | null;
  insertItem(item: CreateProjectItem, contentId: number, placement: ItemPlacement): number;
  removeItemRow(id: number): boolean;
  cleanupDeletedItem(item: ProjectItem): void;
  recordMount(id: number): void;
  updateSubtreeMembership(id: number, sourceProjects: number[], targetProjects: number[]): void;
  findReferencedContent(type: ProjectItemContentReference, id: number): number | undefined;
  createContent(item: CreateProjectItem): number;
  addReference(contentId: number): void;
  releaseReference(contentId: number, mode: ReleaseMode): void;
}

export function collectProjectItemSubtreeIds(rootId: number, readItem: ReadItem): number[] {
  const ids: number[] = [];
  const visited = new Set<number>();
  const pending = [rootId];
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    if (visited.has(id)) continue;
    visited.add(id);
    const item = readItem(id);
    if (!item) continue;
    ids.push(id);
    for (let i = item.children.length - 1; i >= 0; i--) pending.push(item.children[i]);
  }
  return ids;
}

export class ProjectItemOwnership {
  constructor(private readonly store: ProjectItemStore) {}

  addRoot(projectId: number, input: CreateProjectItem): [Project, ProjectItem | null] {
    return this.store.transaction(() => {
      const itemId = this.store.insertItem(input, this.acquireContent(input), {
        parents: [],
        projects: [projectId],
      });
      const project = this.store.readProject(projectId);
      project.children.push(itemId);
      this.store.writeProject(project);
      return [project, this.store.readItem(itemId)];
    });
  }

  addChild(
    parentId: number,
    input: CreateProjectItem
  ): [ProjectItem | null, ProjectItem | null] | null {
    return this.store.transaction(() => {
      const parent = this.store.readItem(parentId);
      if (!parent) return null;
      const itemId = this.store.insertItem(input, this.acquireContent(input), {
        parents: [parentId],
        projects: parent.projects,
      });
      parent.children = [...new Set([...parent.children, itemId])];
      const updatedParent = this.store.writeDirectoryItem(parent);
      if (!updatedParent) throw new Error("父项目条目已变化");
      return [updatedParent, this.store.readItem(itemId)];
    });
  }

  mountRoot(projectId: number, itemId: number): [Project, ProjectItem] | null {
    return this.store.transaction(() => {
      const project = this.store.readProject(projectId);
      const item = this.store.readItem(itemId);
      if (!item) return null;
      project.children.push(itemId);
      this.store.writeProject(project);
      item.projects = [...new Set([...item.projects, projectId])];
      this.store.writeDirectoryItem(item);
      this.store.updateSubtreeMembership(itemId, [], [projectId]);
      this.store.recordMount(itemId);
      return [project, item];
    });
  }

  mountChild(parentId: number, itemId: number): [ProjectItem, ProjectItem] | null {
    return this.store.transaction(() => {
      const parent = this.store.readItem(parentId);
      if (!parent) return null;
      const item = this.store.readItem(itemId);
      if (!item) return null;
      parent.children = [...new Set([...parent.children, itemId])];
      this.store.writeDirectoryItem(parent);
      item.parents = [...new Set([...item.parents, parentId])];
      item.projects = [...new Set([...item.projects, ...parent.projects])];
      this.store.writeDirectoryItem(item);
      this.store.updateSubtreeMembership(itemId, [], item.projects);
      this.store.recordMount(itemId);
      return [parent, item];
    });
  }

  removeRoot(projectId: number, itemId: number, keepItem?: boolean): [Project, ProjectItem] | null {
    return this.store.transaction(() => {
      const project = this.store.readProject(projectId);
      const item = this.store.readItem(itemId);
      if (!item) return null;
      project.children = project.children.filter(id => id !== itemId);
      this.store.writeProject(project);
      if (!keepItem) this.releasePlacement(itemId, [projectId]);
      return [project, item];
    });
  }

  removeChild(
    projectId: number,
    parentId: number,
    itemId: number,
    keepItem?: boolean
  ): [ProjectItem, ProjectItem] | null {
    return this.store.transaction(() => {
      const parent = this.store.readItem(parentId);
      if (!parent) return null;
      const item = this.store.readItem(itemId);
      if (!item) return null;
      parent.children = parent.children.filter(id => id !== itemId);
      this.store.writeDirectoryItem(parent);
      if (!keepItem) {
        item.parents = item.parents.filter(id => id !== parentId);
        this.store.writeDirectoryItem(item);
        // 父子边随父条目共用，解绑时需重算该父条目所在的所有项目。
        this.releasePlacement(itemId, [...new Set([projectId, ...parent.projects])]);
      }
      return [parent, item];
    });
  }

  deleteItem(id: number, mode: ReleaseMode): boolean {
    return this.store.transaction(() => {
      const item = this.store.readItem(id);
      return item ? this.removeOwner(item, mode) : false;
    });
  }

  private acquireContent(input: CreateProjectItem): number {
    if (input.contentId) {
      this.store.addReference(input.contentId);
      return input.contentId;
    }
    const { refType, refId } = input;
    if (refId && (refType === "content" || refType === "card" || refType === "article")) {
      const contentId = this.store.findReferencedContent(refType, refId);
      if (contentId === undefined) return 0;
      this.store.addReference(contentId);
      return contentId;
    }
    return input.projectItemType === EProjectItemType.Document && input.content
      ? this.store.createContent(input)
      : 0;
  }

  private removeOwner(item: ProjectItem, mode: ReleaseMode): boolean {
    if (!this.store.removeItemRow(item.id)) return false;
    if (item.contentId) this.store.releaseReference(item.contentId, mode);
    this.store.cleanupDeletedItem(item);
    return true;
  }

  private releasePlacement(itemId: number, sourceProjects: number[]) {
    this.store.updateSubtreeMembership(itemId, sourceProjects, []);
    const subtreeIds = collectProjectItemSubtreeIds(itemId, this.store.readItem);
    const deleted = new Set<number>();
    for (const id of [...subtreeIds].reverse()) {
      const item = this.store.readItem(id);
      if (item && !item.projects.length && this.removeOwner(item, "immediate")) deleted.add(id);
    }
    if (!deleted.size) return;
    for (const id of subtreeIds) {
      if (deleted.has(id)) continue;
      const item = this.store.readItem(id);
      if (!item) continue;
      const parents = item.parents.filter(parent => !deleted.has(parent));
      const children = item.children.filter(child => !deleted.has(child));
      if (parents.length === item.parents.length && children.length === item.children.length) {
        continue;
      }
      this.store.writeDirectoryItem({ ...item, parents, children });
    }
  }
}
