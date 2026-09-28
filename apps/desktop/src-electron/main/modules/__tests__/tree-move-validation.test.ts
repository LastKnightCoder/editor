import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp/editor-test",
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

vi.mock("../video-note-index-queue", () => ({
  default: {
    enqueueTask: vi.fn(),
    cleanupVideoNoteArtifacts: vi.fn(),
  },
}));

import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import { EProjectItemType } from "@/types/project";
import ProjectTable from "../tables/project";

const emptyContent = [{ type: "paragraph", children: [{ text: "" }] }] as any;

function createTestDatabase() {
  const db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
  ProjectTable.upgradeTable(db);
  return db;
}

function createProjectItem(title: string) {
  return {
    title,
    content: emptyContent,
    count: 0,
    children: [],
    refType: "",
    refId: 0,
    whiteBoardContentId: 0,
    projectItemType: EProjectItemType.Document,
  };
}

describe("tree item move validation", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db?.close();
  });

  it("ProjectTable.moveProjectTreeItem 拒绝把节点移动到自己的后代下", () => {
    const project = ProjectTable.createProject(db, {
      title: "项目",
      desc: [],
      children: [],
      archived: false,
      pinned: false,
    });
    const [, parent] = ProjectTable.addRootProjectItem(db, project.id, createProjectItem("父节点"));
    expect(parent).not.toBeNull();
    const [, child] = ProjectTable.addChildProjectItem(
      db,
      parent!.id,
      createProjectItem("子节点")
    )!;
    expect(child).not.toBeNull();

    const result = ProjectTable.moveProjectTreeItem(db, project.id, {
      dragItem: {
        itemId: parent!.id,
        parentId: project.id,
        isRoot: true,
        parentChildren: [parent!.id],
      },
      dropTargetId: child!.id,
      dropTargetParentId: parent!.id,
      dropTargetIsRoot: false,
      dragPosition: "inside",
    });

    expect(result).toBeNull();
    expect(ProjectTable.getProject(db, project.id).children).toEqual([parent!.id]);
    expect(ProjectTable.getProjectItem(db, parent!.id)?.children).toEqual([child!.id]);
    expect(ProjectTable.getProjectItem(db, parent!.id)?.parents).toEqual([]);
  });

  it("ProjectTable.moveProjectTreeItem 中途写入失败时回滚源父级 children", () => {
    const project = ProjectTable.createProject(db, {
      title: "项目",
      desc: [],
      children: [],
      archived: false,
      pinned: false,
    });
    const [, sourceParent] = ProjectTable.addRootProjectItem(
      db,
      project.id,
      createProjectItem("源父级")
    );
    const [, targetParent] = ProjectTable.addRootProjectItem(
      db,
      project.id,
      createProjectItem("目标父级")
    );
    expect(sourceParent).not.toBeNull();
    expect(targetParent).not.toBeNull();
    const [, movingItem] = ProjectTable.addChildProjectItem(
      db,
      sourceParent!.id,
      createProjectItem("移动节点")
    )!;
    expect(movingItem).not.toBeNull();

    const originalUpdateProjectItem = ProjectTable.updateProjectItem;
    let updateProjectItemCallCount = 0;
    ProjectTable.updateProjectItem = ((...args) => {
      updateProjectItemCallCount += 1;
      if (updateProjectItemCallCount === 2) {
        throw new Error("forced project move failure");
      }
      return originalUpdateProjectItem.apply(ProjectTable, args);
    }) as typeof ProjectTable.updateProjectItem;

    try {
      expect(() =>
        ProjectTable.moveProjectTreeItem(db, project.id, {
          dragItem: {
            itemId: movingItem!.id,
            parentId: sourceParent!.id,
            isRoot: false,
            parentChildren: [movingItem!.id],
          },
          dropTargetId: targetParent!.id,
          dropTargetParentId: project.id,
          dropTargetIsRoot: true,
          dragPosition: "inside",
        })
      ).toThrow("forced project move failure");
    } finally {
      ProjectTable.updateProjectItem = originalUpdateProjectItem;
    }

    expect(ProjectTable.getProjectItem(db, sourceParent!.id)?.children).toEqual([movingItem!.id]);
    expect(ProjectTable.getProjectItem(db, targetParent!.id)?.children).toEqual([]);
    expect(ProjectTable.getProjectItem(db, movingItem!.id)?.parents).toEqual([sourceParent!.id]);
  });

  it("addRefChildProjectItem 会把父级项目归属传播到已有子树", () => {
    const sourceProject = ProjectTable.createProject(db, {
      title: "源项目",
      desc: [],
      children: [],
      archived: false,
      pinned: false,
    });
    const targetProject = ProjectTable.createProject(db, {
      title: "目标项目",
      desc: [],
      children: [],
      archived: false,
      pinned: false,
    });
    const [, sourceParent] = ProjectTable.addRootProjectItem(
      db,
      sourceProject.id,
      createProjectItem("源父级")
    );
    const [, existingRoot] = ProjectTable.addRootProjectItem(
      db,
      sourceProject.id,
      createProjectItem("已有父节点")
    );
    expect(sourceParent).not.toBeNull();
    expect(existingRoot).not.toBeNull();
    const [, existingChild] = ProjectTable.addChildProjectItem(
      db,
      existingRoot!.id,
      createProjectItem("已有子节点")
    )!;
    expect(existingChild).not.toBeNull();

    ProjectTable.addRefRootProjectItem(db, targetProject.id, sourceParent!.id);
    const result = ProjectTable.addRefChildProjectItem(db, sourceParent!.id, existingRoot!.id);

    expect(result).not.toBeNull();
    expect(ProjectTable.getProjectItem(db, existingRoot!.id)?.projects).toEqual(
      expect.arrayContaining([sourceProject.id, targetProject.id])
    );
    expect(ProjectTable.getProjectItem(db, existingChild!.id)?.projects).toEqual(
      expect.arrayContaining([sourceProject.id, targetProject.id])
    );
  });

  it("removeChildProjectItem 保留仍可通过同项目其他父级访问的共享子树归属", () => {
    const project = ProjectTable.createProject(db, {
      title: "项目",
      desc: [],
      children: [],
      archived: false,
      pinned: false,
    });
    const [, firstParent] = ProjectTable.addRootProjectItem(
      db,
      project.id,
      createProjectItem("父节点 A")
    );
    const [, secondParent] = ProjectTable.addRootProjectItem(
      db,
      project.id,
      createProjectItem("父节点 B")
    );
    expect(firstParent).not.toBeNull();
    expect(secondParent).not.toBeNull();
    const [, sharedRoot] = ProjectTable.addChildProjectItem(
      db,
      firstParent!.id,
      createProjectItem("共享节点")
    )!;
    expect(sharedRoot).not.toBeNull();
    const [, sharedChild] = ProjectTable.addChildProjectItem(
      db,
      sharedRoot!.id,
      createProjectItem("共享子节点")
    )!;
    expect(sharedChild).not.toBeNull();
    ProjectTable.addRefChildProjectItem(db, secondParent!.id, sharedRoot!.id);

    const result = ProjectTable.removeChildProjectItem(
      db,
      project.id,
      firstParent!.id,
      sharedRoot!.id
    );

    expect(result).not.toBeNull();
    expect(ProjectTable.getProjectItem(db, sharedRoot!.id)?.parents).toEqual([secondParent!.id]);
    expect(ProjectTable.getProjectItem(db, sharedRoot!.id)?.projects).toEqual(
      expect.arrayContaining([project.id])
    );
    expect(ProjectTable.getProjectItem(db, sharedChild!.id)?.projects).toEqual(
      expect.arrayContaining([project.id])
    );
  });

  it("removeChildProjectItem 删除不再属于任何项目的子树", () => {
    const project = ProjectTable.createProject(db, {
      title: "项目",
      desc: [],
      children: [],
      archived: false,
      pinned: false,
    });
    const [, parent] = ProjectTable.addRootProjectItem(db, project.id, createProjectItem("父节点"));
    expect(parent).not.toBeNull();
    const [, child] = ProjectTable.addChildProjectItem(
      db,
      parent!.id,
      createProjectItem("子节点")
    )!;
    expect(child).not.toBeNull();
    const [, grandChild] = ProjectTable.addChildProjectItem(
      db,
      child!.id,
      createProjectItem("孙节点")
    )!;
    expect(grandChild).not.toBeNull();

    ProjectTable.removeChildProjectItem(db, project.id, parent!.id, child!.id);

    expect(ProjectTable.getProjectItem(db, child!.id)).toBeNull();
    expect(ProjectTable.getProjectItem(db, grandChild!.id)).toBeNull();
  });
});
