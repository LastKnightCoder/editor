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

vi.mock("../video-note-index-queue");

import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import { EProjectItemType } from "@/types/project";
import ProjectTable from "../tables/project";
import { must } from "../../test-support";

const emptyContent = [{ type: "paragraph", children: [{ text: "" }] }] as any;

function createTestDatabase() {
  const db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
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
    whiteboardContentId: 0,
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
    const [, child] = must(
      ProjectTable.addChildProjectItem(db, must(parent, "parent").id, createProjectItem("子节点")),
      "ProjectTable.addChildProjectItem"
    );
    expect(child).not.toBeNull();

    const result = ProjectTable.moveProjectTreeItem(db, project.id, {
      dragItem: {
        itemId: must(parent, "parent").id,
        parentId: project.id,
        isRoot: true,
        parentChildren: [must(parent, "parent").id],
      },
      dropTargetId: must(child, "child").id,
      dropTargetParentId: must(parent, "parent").id,
      dropTargetIsRoot: false,
      dragPosition: "inside",
    });

    expect(result).toBeNull();
    expect(ProjectTable.getProject(db, project.id).children).toEqual([must(parent, "parent").id]);
    expect(ProjectTable.getProjectItem(db, must(parent, "parent").id)?.children).toEqual([
      must(child, "child").id,
    ]);
    expect(ProjectTable.getProjectItem(db, must(parent, "parent").id)?.parents).toEqual([]);
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
    const [, movingItem] = must(
      ProjectTable.addChildProjectItem(
        db,
        must(sourceParent, "sourceParent").id,
        createProjectItem("移动节点")
      ),
      "ProjectTable.addChildProjectItem"
    );
    expect(movingItem).not.toBeNull();

    db.exec(`CREATE TEMP TRIGGER reject_move_target BEFORE UPDATE OF children ON project_item
      WHEN NEW.id = ${must(targetParent, "targetParent").id}
        AND (SELECT children FROM project_item WHERE id = ${must(sourceParent, "sourceParent").id}) = '[]'
      BEGIN SELECT RAISE(ABORT, '目录移动写入故障'); END`);

    expect(() =>
      ProjectTable.moveProjectTreeItem(db, project.id, {
        dragItem: {
          itemId: must(movingItem, "movingItem").id,
          parentId: must(sourceParent, "sourceParent").id,
          isRoot: false,
          parentChildren: [must(movingItem, "movingItem").id],
        },
        dropTargetId: must(targetParent, "targetParent").id,
        dropTargetParentId: project.id,
        dropTargetIsRoot: true,
        dragPosition: "inside",
      })
    ).toThrow("目录移动写入故障");

    expect(
      ProjectTable.getProjectItem(db, must(sourceParent, "sourceParent").id)?.children
    ).toEqual([must(movingItem, "movingItem").id]);
    expect(
      ProjectTable.getProjectItem(db, must(targetParent, "targetParent").id)?.children
    ).toEqual([]);
    expect(ProjectTable.getProjectItem(db, must(movingItem, "movingItem").id)?.parents).toEqual([
      must(sourceParent, "sourceParent").id,
    ]);
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
    const [, existingChild] = must(
      ProjectTable.addChildProjectItem(
        db,
        must(existingRoot, "existingRoot").id,
        createProjectItem("已有子节点")
      ),
      "ProjectTable.addChildProjectItem"
    );
    expect(existingChild).not.toBeNull();

    ProjectTable.addRefRootProjectItem(db, targetProject.id, must(sourceParent, "sourceParent").id);
    const result = ProjectTable.addRefChildProjectItem(
      db,
      must(sourceParent, "sourceParent").id,
      must(existingRoot, "existingRoot").id
    );

    expect(result).not.toBeNull();
    expect(
      ProjectTable.getProjectItem(db, must(existingRoot, "existingRoot").id)?.projects
    ).toEqual(expect.arrayContaining([sourceProject.id, targetProject.id]));
    expect(
      ProjectTable.getProjectItem(db, must(existingChild, "existingChild").id)?.projects
    ).toEqual(expect.arrayContaining([sourceProject.id, targetProject.id]));
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
    const [, sharedRoot] = must(
      ProjectTable.addChildProjectItem(
        db,
        must(firstParent, "firstParent").id,
        createProjectItem("共享节点")
      ),
      "ProjectTable.addChildProjectItem"
    );
    expect(sharedRoot).not.toBeNull();
    const [, sharedChild] = must(
      ProjectTable.addChildProjectItem(
        db,
        must(sharedRoot, "sharedRoot").id,
        createProjectItem("共享子节点")
      ),
      "ProjectTable.addChildProjectItem"
    );
    expect(sharedChild).not.toBeNull();
    ProjectTable.addRefChildProjectItem(
      db,
      must(secondParent, "secondParent").id,
      must(sharedRoot, "sharedRoot").id
    );

    const result = ProjectTable.removeChildProjectItem(
      db,
      project.id,
      must(firstParent, "firstParent").id,
      must(sharedRoot, "sharedRoot").id
    );

    expect(result).not.toBeNull();
    expect(ProjectTable.getProjectItem(db, must(sharedRoot, "sharedRoot").id)?.parents).toEqual([
      must(secondParent, "secondParent").id,
    ]);
    expect(ProjectTable.getProjectItem(db, must(sharedRoot, "sharedRoot").id)?.projects).toEqual(
      expect.arrayContaining([project.id])
    );
    expect(ProjectTable.getProjectItem(db, must(sharedChild, "sharedChild").id)?.projects).toEqual(
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
    const [, child] = must(
      ProjectTable.addChildProjectItem(db, must(parent, "parent").id, createProjectItem("子节点")),
      "ProjectTable.addChildProjectItem"
    );
    expect(child).not.toBeNull();
    const [, grandChild] = must(
      ProjectTable.addChildProjectItem(db, must(child, "child").id, createProjectItem("孙节点")),
      "ProjectTable.addChildProjectItem"
    );
    expect(grandChild).not.toBeNull();

    ProjectTable.removeChildProjectItem(
      db,
      project.id,
      must(parent, "parent").id,
      must(child, "child").id
    );

    expect(ProjectTable.getProjectItem(db, must(child, "child").id)).toBeNull();
    expect(ProjectTable.getProjectItem(db, must(grandChild, "grandChild").id)).toBeNull();
  });
});
