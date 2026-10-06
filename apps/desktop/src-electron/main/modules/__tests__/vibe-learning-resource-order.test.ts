import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: () => [],
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

vi.mock("../tables/operation", () => ({
  default: {
    insertOperation: vi.fn(),
  },
}));

import VibeLearningResourceTable from "../tables/vibe-learning-resource";

type ResourceRow = {
  id: number;
  project_id: number;
  sort_index: number;
  create_time: number;
  update_time: number;
  name: string;
  original_path: string;
  markdown_path: string | null;
  resource_type: string;
  file_size: number | null;
  duration: number | null;
  source_type: string | null;
  source_meta_info: string | null;
  transcript_segments: string | null;
};

const TABLE_COLUMNS = [
  "id",
  "project_id",
  "create_time",
  "update_time",
  "name",
  "original_path",
  "markdown_path",
  "resource_type",
  "file_size",
  "duration",
  "source_type",
  "source_meta_info",
  "transcript_segments",
] as const;

const sortRows = (rows: ResourceRow[]) => {
  return [...rows].sort((left, right) => {
    if (left.sort_index !== right.sort_index) {
      return left.sort_index - right.sort_index;
    }
    if (left.create_time !== right.create_time) {
      return right.create_time - left.create_time;
    }
    return right.id - left.id;
  });
};

class FakeStatement {
  constructor(
    private readonly executor: {
      all?: (...args: any[]) => any;
      get?: (...args: any[]) => any;
      run?: (...args: any[]) => any;
    }
  ) {}

  all(...args: any[]) {
    return this.executor.all?.(...args);
  }

  get(...args: any[]) {
    return this.executor.get?.(...args);
  }

  run(...args: any[]) {
    return this.executor.run?.(...args);
  }
}

class FakeVibeLearningResourceDb {
  rows: ResourceRow[] = [];
  columns = new Set<string>(TABLE_COLUMNS);
  indexes = new Set<string>();
  private nextId = 1;

  constructor(options?: { includeSortIndex?: boolean }) {
    if (options?.includeSortIndex) {
      this.columns.add("sort_index");
    }
  }

  exec(sql: string) {
    if (sql.includes("CREATE INDEX IF NOT EXISTS idx_vl_resource_project_sort")) {
      if (!this.columns.has("sort_index")) {
        throw new Error("SqliteError: no such column: sort_index");
      }
      this.indexes.add("idx_vl_resource_project_sort");
    }

    if (sql.includes("ADD COLUMN source_type")) {
      this.columns.add("source_type");
    }

    if (sql.includes("ADD COLUMN source_meta_info")) {
      this.columns.add("source_meta_info");
    }

    if (sql.includes("ADD COLUMN transcript_segments")) {
      this.columns.add("transcript_segments");
    }

    if (sql.includes("ADD COLUMN sort_index")) {
      this.columns.add("sort_index");
      this.rows = this.rows.map(row => ({ ...row, sort_index: 0 }));
    }
  }

  prepare(sql: string) {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.startsWith("pragma table_info(vibe_learning_resources)")) {
      return new FakeStatement({
        all: () => Array.from(this.columns).map(name => ({ name })),
      });
    }

    if (
      normalized.includes("select distinct project_id") &&
      normalized.includes("where sort_index = 0")
    ) {
      return new FakeStatement({
        all: () =>
          Array.from(
            new Set(this.rows.filter(row => row.sort_index === 0).map(row => row.project_id))
          ).map(project_id => ({ project_id })),
      });
    }

    if (
      normalized.includes("select id from vibe_learning_resources") &&
      normalized.includes("order by case when sort_index = 0 then 1 else 0 end")
    ) {
      return new FakeStatement({
        all: (projectId: number) =>
          sortRows(
            this.rows
              .filter(row => row.project_id === projectId)
              .map(row => ({
                ...row,
                sort_index: row.sort_index === 0 ? Number.MAX_SAFE_INTEGER : row.sort_index,
              }))
          ).map(row => ({ id: row.id })),
      });
    }

    if (
      normalized.includes("select min(sort_index) as min_sort") &&
      normalized.includes("from vibe_learning_resources")
    ) {
      return new FakeStatement({
        get: (projectId: number) => {
          const projectRows = this.rows.filter(row => row.project_id === projectId);
          if (projectRows.length === 0) {
            return { min_sort: null };
          }
          return {
            min_sort: Math.min(...projectRows.map(row => row.sort_index)),
          };
        },
      });
    }

    if (
      normalized.startsWith("insert into vibe_learning_resources") &&
      normalized.includes("sort_index")
    ) {
      return new FakeStatement({
        run: (
          projectId: number,
          sortIndex: number,
          createTime: number,
          updateTime: number,
          name: string,
          originalPath: string,
          markdownPath: string | null,
          resourceType: string,
          fileSize: number | null,
          duration: number | null,
          sourceType: string | null,
          sourceMetaInfo: string | null
        ) => {
          const id = this.nextId++;
          this.rows.push({
            id,
            project_id: projectId,
            sort_index: sortIndex,
            create_time: createTime,
            update_time: updateTime,
            name,
            original_path: originalPath,
            markdown_path: markdownPath,
            resource_type: resourceType,
            file_size: fileSize,
            duration,
            source_type: sourceType,
            source_meta_info: sourceMetaInfo,
            transcript_segments: null,
          });
          return { lastInsertRowid: id };
        },
      });
    }

    if (normalized === "select * from vibe_learning_resources where id = ?") {
      return new FakeStatement({
        get: (id: number) => this.rows.find(row => row.id === id),
      });
    }

    if (
      normalized.includes("select * from vibe_learning_resources where project_id = ?") &&
      normalized.includes("order by sort_index asc")
    ) {
      return new FakeStatement({
        all: (projectId: number) => sortRows(this.rows.filter(row => row.project_id === projectId)),
      });
    }

    if (
      normalized.startsWith(
        "update vibe_learning_resources set sort_index = ?, update_time = ? where id = ? and project_id = ?"
      )
    ) {
      return new FakeStatement({
        run: (sortIndex: number, updateTime: number, id: number, projectId: number) => {
          const target = this.rows.find(row => row.id === id && row.project_id === projectId);
          if (target) {
            target.sort_index = sortIndex;
            target.update_time = updateTime;
          }
          return { changes: target ? 1 : 0 };
        },
      });
    }

    if (
      normalized.startsWith(
        "update vibe_learning_resources set sort_index = ?, update_time = ? where id = ?"
      )
    ) {
      return new FakeStatement({
        run: (sortIndex: number, updateTime: number, id: number) => {
          const target = this.rows.find(row => row.id === id);
          if (target) {
            target.sort_index = sortIndex;
            target.update_time = updateTime;
          }
          return { changes: target ? 1 : 0 };
        },
      });
    }

    throw new Error(`Unsupported SQL in FakeVibeLearningResourceDb: ${sql}`);
  }

  seedRows(rows: ResourceRow[]) {
    this.rows = rows.map(row => ({ ...row }));
    this.nextId = rows.reduce((maxId, row) => Math.max(maxId, row.id), 0) + 1;
  }
}

describe("VibeLearningResourceTable 排序", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("手动重排后应按持久化顺序返回，并且新资源默认插入顶部", () => {
    const db = new FakeVibeLearningResourceDb({ includeSortIndex: true });

    const first = VibeLearningResourceTable.createResource(db as never, {
      projectId: 1,
      name: "first.pdf",
      originalPath: "/tmp/first.pdf",
      resourceType: "pdf",
    });
    const second = VibeLearningResourceTable.createResource(db as never, {
      projectId: 1,
      name: "second.pdf",
      originalPath: "/tmp/second.pdf",
      resourceType: "pdf",
    });
    const third = VibeLearningResourceTable.createResource(db as never, {
      projectId: 1,
      name: "third.pdf",
      originalPath: "/tmp/third.pdf",
      resourceType: "pdf",
    });

    expect(
      VibeLearningResourceTable.getResourcesByProjectId(db as never, 1).map(resource => resource.id)
    ).toEqual([third.id, second.id, first.id]);

    VibeLearningResourceTable.reorderResources(db as never, {
      projectId: 1,
      orderedIds: [second.id, first.id, third.id],
    });

    expect(
      VibeLearningResourceTable.getResourcesByProjectId(db as never, 1).map(resource => resource.id)
    ).toEqual([second.id, first.id, third.id]);

    const latest = VibeLearningResourceTable.createResource(db as never, {
      projectId: 1,
      name: "latest.pdf",
      originalPath: "/tmp/latest.pdf",
      resourceType: "pdf",
    });

    const reorderedResources = VibeLearningResourceTable.getResourcesByProjectId(db as never, 1);
    expect(reorderedResources.map(resource => resource.id)).toEqual([
      latest.id,
      second.id,
      first.id,
      third.id,
    ]);
    expect(reorderedResources[0]?.sortIndex).toBeLessThan(
      reorderedResources[1]?.sortIndex ?? Number.MAX_SAFE_INTEGER
    );
  });

  it("解析资源时不应暴露旧分章兼容字段", () => {
    const parsed = VibeLearningResourceTable.parseResource({
      id: 1,
      project_id: 9,
      sort_index: 2048,
      create_time: 100,
      update_time: 100,
      name: "legacy.pdf",
      original_path: "/tmp/legacy.pdf",
      markdown_path: null,
      resource_type: "pdf",
      file_size: null,
      duration: null,
      source_type: null,
      source_meta_info: null,
      is_chunked: 1,
      chapter_count: 12,
      transcript_segments: null,
    } as never);

    expect(parsed).not.toHaveProperty("isChunked");
    expect(parsed).not.toHaveProperty("chapterCount");
  });
});
