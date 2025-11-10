import Database from "better-sqlite3";
import Operation from "./operation";
import log from "electron-log";

export type ResourceType = "image" | "video" | "audio" | "attachment";

export interface IResourceSource {
  type: "content" | "whiteboard" | "podcast";
  id: number;
}

export interface IResource {
  id: number;
  name: string;
  path: string;
  type: ResourceType;
  sources: IResourceSource[];
  refCount: number;
  createTime: number;
  updateTime: number;
}

export interface ICreateResource {
  name: string;
  path: string;
  type: ResourceType;
  source: IResourceSource;
}

// 数据库行类型定义
interface ContentRow {
  id: number;
  content: string;
  [key: string]: unknown;
}

interface WhiteboardRow {
  id: number;
  data: string;
  [key: string]: unknown;
}

interface PodcastRow {
  id: number;
  audio_url: string;
  [key: string]: unknown;
}

// 节点类型定义
interface BaseNode {
  type?: string;
  children?: BaseNode[];
  [key: string]: unknown;
}

interface ImageNode extends BaseNode {
  type: "image";
  url?: string;
  src?: string;
}

interface VideoNode extends BaseNode {
  type: "video";
  src?: string;
}

interface AudioNode extends BaseNode {
  type: "audio";
  src?: string;
}

interface FileAttachmentNode extends BaseNode {
  type: "file-attachment";
  filePath?: string;
}

interface ImageGalleryNode extends BaseNode {
  type: "image-gallery";
  images?: Array<{ url?: string }>;
}

interface RichTextNode extends BaseNode {
  type: "richtext";
  content?: BaseNode[];
}

type ResourceNode =
  | ImageNode
  | VideoNode
  | AudioNode
  | FileAttachmentNode
  | ImageGalleryNode
  | RichTextNode
  | BaseNode;

export default class ResourceTable {
  static getListenEvents() {
    return {
      "resource:create-or-update": this.createOrUpdateResource.bind(this),
      "resource:increment-ref": this.incrementRefCount.bind(this),
      "resource:decrement-ref": this.decrementRefCount.bind(this),
      "resource:get-all": this.getAllResources.bind(this),
      "resource:search": this.searchResources.bind(this),
      "resource:get-by-type": this.getResourcesByType.bind(this),
      "resource:scan-and-update": this.scanAndUpdateResources.bind(this),
    };
  }

  static initTable(db: Database.Database) {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS resources (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        type TEXT NOT NULL,
        sources TEXT NOT NULL,
        ref_count INTEGER DEFAULT 0,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      )
    `;
    db.exec(createTableSql);

    // 添加索引以优化查询性能
    const createIndexSql = `
      CREATE INDEX IF NOT EXISTS idx_resources_path ON resources(path);
      CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(type);
      CREATE INDEX IF NOT EXISTS idx_resources_name ON resources(name);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_path_unique ON resources(path);
    `;
    db.exec(createIndexSql);
  }

  static upgradeTable(db: Database.Database) {
    // 初始化时调用一次扫描
    this.scanAndUpdateResources(db);
  }

  /**
   * 扫描并更新资源统计
   * 可以手动调用此方法来修正数据
   */
  static scanAndUpdateResources(db: Database.Database): void {
    log.info("开始扫描资源...");

    const resourceMap = new Map<
      string,
      {
        name: string;
        type: ResourceType;
        sources: IResourceSource[];
        refCount: number;
      }
    >();

    // 辅助函数：添加资源到 map
    const addResource = (path: string, source: IResourceSource) => {
      if (!path) return;

      if (resourceMap.has(path)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const resource = resourceMap.get(path)!;

        // 检查来源是否已存在
        const sourceExists = resource.sources.some(
          (s) => s.type === source.type && s.id === source.id,
        );

        if (!sourceExists) {
          resource.sources.push(source);
        }
        resource.refCount++;
      } else {
        resourceMap.set(path, {
          name: this.extractFileName(path),
          type: this.getResourceType(path),
          sources: [source],
          refCount: 1,
        });
      }
    };

    // DFS 遍历函数
    const dfs = (nodes: BaseNode[], visit: (node: ResourceNode) => void) => {
      if (!nodes || !Array.isArray(nodes)) return;

      for (const node of nodes) {
        if (node) {
          visit(node as ResourceNode);
          if (node.children && Array.isArray(node.children)) {
            dfs(node.children, visit);
          }
        }
      }
    };

    // 处理资源节点
    const processResourceNode = (
      node: ResourceNode,
      source: IResourceSource,
    ) => {
      if (!node || !node.type) return;

      // Image 元素
      if (node.type === "image") {
        const imageNode = node as ImageNode;
        const url = imageNode.url || imageNode.src;
        if (url) addResource(url, source);
      }

      // InlineImage 元素
      if (node.type === "inline-image") {
        const imageNode = node as ImageNode;
        if (imageNode.url) addResource(imageNode.url, source);
      }

      // ImageGallery 元素
      if (node.type === "image-gallery") {
        const galleryNode = node as ImageGalleryNode;
        if (galleryNode.images && Array.isArray(galleryNode.images)) {
          for (const image of galleryNode.images) {
            if (image.url) addResource(image.url, source);
          }
        }
      }

      // Video 元素
      if (node.type === "video") {
        const videoNode = node as VideoNode;
        if (videoNode.src) addResource(videoNode.src, source);
      }

      // Audio 元素
      if (node.type === "audio") {
        const audioNode = node as AudioNode;
        if (audioNode.src) addResource(audioNode.src, source);
      }

      // FileAttachment 元素
      if (node.type === "file-attachment") {
        const fileNode = node as FileAttachmentNode;
        if (fileNode.filePath) addResource(fileNode.filePath, source);
      }
    };

    // 1. 扫描 contents 表
    try {
      const contentsStmt = db.prepare("SELECT * FROM contents");
      const contents = contentsStmt.all() as ContentRow[];

      log.info(`扫描 ${contents.length} 个 content 记录...`);

      for (const contentRow of contents) {
        try {
          const contentData = JSON.parse(contentRow.content) as BaseNode[];
          const source: IResourceSource = {
            type: "content",
            id: contentRow.id,
          };

          dfs(contentData, (node) => processResourceNode(node, source));
        } catch (e) {
          log.error(`解析 content ${contentRow.id} 时出错:`, e);
        }
      }
    } catch (e) {
      log.error("扫描 contents 表时出错:", e);
    }

    // 2. 扫描 white_board_contents 表
    try {
      const whiteboardsStmt = db.prepare("SELECT * FROM white_board_contents");
      const whiteboards = whiteboardsStmt.all() as WhiteboardRow[];

      log.info(`扫描 ${whiteboards.length} 个白板记录...`);

      for (const whiteboardRow of whiteboards) {
        try {
          const data = JSON.parse(whiteboardRow.data) as {
            children?: ResourceNode[];
          };
          const source: IResourceSource = {
            type: "whiteboard",
            id: whiteboardRow.id,
          };

          if (data.children && Array.isArray(data.children)) {
            // 对白板的所有子元素进行 dfs 遍历
            dfs(data.children, (element) => {
              // 处理普通资源节点（Image、Video、Audio 等）
              processResourceNode(element, source);

              // 对 RichText 元素，需要遍历其 content
              if (element.type === "richtext") {
                const richTextNode = element as RichTextNode;
                if (richTextNode.content) {
                  dfs(richTextNode.content, (node) =>
                    processResourceNode(node, source),
                  );
                }
              }
            });
          }
        } catch (e) {
          log.error(`解析 whiteboard ${whiteboardRow.id} 时出错:`, e);
        }
      }
    } catch (e) {
      log.error("扫描 white_board_contents 表时出错:", e);
    }

    // 3. 扫描 podcasts 表
    try {
      const podcastsStmt = db.prepare("SELECT * FROM podcasts");
      const podcasts = podcastsStmt.all() as PodcastRow[];

      log.info(`扫描 ${podcasts.length} 个播客记录...`);

      for (const podcastRow of podcasts) {
        try {
          if (podcastRow.audio_url) {
            const source: IResourceSource = {
              type: "podcast",
              id: podcastRow.id,
            };
            addResource(podcastRow.audio_url, source);
          }
        } catch (e) {
          log.error(`解析 podcast ${podcastRow.id} 时出错:`, e);
        }
      }
    } catch (e) {
      log.error("扫描 podcasts 表时出错:", e);
    }

    // 4. 清空现有资源表（因为是重新扫描）
    try {
      db.prepare("DELETE FROM resources").run();
      log.info("已清空现有资源表");
    } catch (e) {
      log.error("清空资源表失败:", e);
    }

    // 5. 将收集的资源插入数据库
    log.info(`找到 ${resourceMap.size} 个唯一资源，开始插入...`);

    const now = Date.now();
    const insertStmt = db.prepare(`
      INSERT INTO resources 
      (name, path, type, sources, ref_count, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let insertCount = 0;
    for (const [path, resource] of resourceMap) {
      try {
        insertStmt.run(
          resource.name,
          path,
          resource.type,
          JSON.stringify(resource.sources),
          resource.refCount,
          now,
          now,
        );
        insertCount++;
      } catch (e) {
        log.error(`插入资源 ${path} 时出错:`, e);
      }
    }

    log.info(`成功插入 ${insertCount} 个资源记录`);
  }

  static parseResource(row: unknown): IResource {
    const r = row as {
      id: number;
      name: string;
      path: string;
      type: string;
      sources: string;
      ref_count: number;
      create_time: number;
      update_time: number;
    };
    return {
      id: r.id,
      name: r.name,
      path: r.path,
      type: r.type as ResourceType,
      sources: JSON.parse(r.sources),
      refCount: r.ref_count,
      createTime: r.create_time,
      updateTime: r.update_time,
    };
  }

  static extractFileName(pathOrUrl: string): string {
    if (!pathOrUrl) return "未命名资源";

    // 处理 URL
    try {
      const url = new URL(pathOrUrl);
      const pathname = url.pathname;
      const filename = pathname.substring(pathname.lastIndexOf("/") + 1);
      return decodeURIComponent(filename) || "未命名资源";
    } catch {
      // 不是有效的 URL，当作路径处理
      const parts = pathOrUrl.replace(/\\/g, "/").split("/");
      return parts[parts.length - 1] || "未命名资源";
    }
  }

  static getResourceType(pathOrUrl: string): ResourceType {
    const lower = pathOrUrl.toLowerCase();

    // 图片格式
    if (/\.(jpg|jpeg|png|gif|webp|bmp|svg|ico)(\?.*)?$/i.test(lower)) {
      return "image";
    }

    // 视频格式
    if (/\.(mp4|webm|ogg|mov|avi|mkv|flv|wmv)(\?.*)?$/i.test(lower)) {
      return "video";
    }

    // 音频格式
    if (/\.(mp3|wav|ogg|m4a|aac|flac|wma)(\?.*)?$/i.test(lower)) {
      return "audio";
    }

    // 其他都当作附件
    return "attachment";
  }

  static createOrUpdateResource(
    db: Database.Database,
    data: ICreateResource,
  ): IResource {
    const { name, path, type, source } = data;

    // 先查找是否已存在
    const existingStmt = db.prepare("SELECT * FROM resources WHERE path = ?");
    const existing = existingStmt.get(path);

    const now = Date.now();

    if (existing) {
      // 资源已存在，更新 sources
      const existingResource = this.parseResource(existing);
      const sources = existingResource.sources;

      // 检查来源是否已存在
      const sourceExists = sources.some(
        (s) => s.type === source.type && s.id === source.id,
      );

      if (!sourceExists) {
        sources.push(source);
        const updateStmt = db.prepare(`
          UPDATE resources 
          SET sources = ?, update_time = ?, ref_count = ref_count + 1
          WHERE path = ?
        `);
        updateStmt.run(JSON.stringify(sources), now, path);

        Operation.insertOperation(
          db,
          "resource",
          "update",
          existingResource.id,
          now,
        );
      } else {
        // 来源已存在，只增加引用计数
        const updateStmt = db.prepare(`
          UPDATE resources 
          SET ref_count = ref_count + 1, update_time = ?
          WHERE path = ?
        `);
        updateStmt.run(now, path);
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return this.getResourceByPath(db, path)!;
    } else {
      // 创建新资源
      const stmt = db.prepare(`
        INSERT INTO resources 
        (name, path, type, sources, ref_count, create_time, update_time)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const res = stmt.run(
        name,
        path,
        type,
        JSON.stringify([source]),
        1,
        now,
        now,
      );

      const createdResourceId = Number(res.lastInsertRowid);
      Operation.insertOperation(
        db,
        "resource",
        "insert",
        createdResourceId,
        now,
      );

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return this.getResourceById(db, createdResourceId)!;
    }
  }

  static incrementRefCount(
    db: Database.Database,
    path: string,
    source?: IResourceSource,
  ): void {
    const now = Date.now();

    if (source) {
      // 如果提供了来源，确保来源在列表中
      const existingStmt = db.prepare("SELECT * FROM resources WHERE path = ?");
      const existing = existingStmt.get(path);

      if (existing) {
        const existingResource = this.parseResource(existing);
        const sources = existingResource.sources;

        const sourceExists = sources.some(
          (s) => s.type === source.type && s.id === source.id,
        );

        if (!sourceExists) {
          sources.push(source);
          const updateStmt = db.prepare(`
            UPDATE resources 
            SET sources = ?, ref_count = ref_count + 1, update_time = ?
            WHERE path = ?
          `);
          updateStmt.run(JSON.stringify(sources), now, path);
          return;
        }
      }
    }

    // 只增加引用计数
    const stmt = db.prepare(`
      UPDATE resources 
      SET ref_count = ref_count + 1, update_time = ?
      WHERE path = ?
    `);
    stmt.run(now, path);
  }

  static decrementRefCount(db: Database.Database, path: string): void {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE resources 
      SET ref_count = ref_count - 1, update_time = ?
      WHERE path = ? AND ref_count > 0
    `);
    stmt.run(now, path);
  }

  static getResourceById(db: Database.Database, id: number): IResource | null {
    const stmt = db.prepare("SELECT * FROM resources WHERE id = ?");
    const row = stmt.get(id);
    if (!row) return null;
    return this.parseResource(row);
  }

  static getResourceByPath(
    db: Database.Database,
    path: string,
  ): IResource | null {
    const stmt = db.prepare("SELECT * FROM resources WHERE path = ?");
    const row = stmt.get(path);
    if (!row) return null;
    return this.parseResource(row);
  }

  static getAllResources(db: Database.Database): IResource[] {
    const stmt = db.prepare(
      "SELECT * FROM resources ORDER BY update_time DESC",
    );
    const rows = stmt.all();
    return rows.map((row) => this.parseResource(row));
  }

  static searchResources(db: Database.Database, keyword: string): IResource[] {
    const stmt = db.prepare(
      "SELECT * FROM resources WHERE name LIKE ? OR path LIKE ? ORDER BY update_time DESC",
    );
    const rows = stmt.all(`%${keyword}%`, `%${keyword}%`);
    return rows.map((row) => this.parseResource(row));
  }

  static getResourcesByType(
    db: Database.Database,
    type: ResourceType,
  ): IResource[] {
    const stmt = db.prepare(
      "SELECT * FROM resources WHERE type = ? ORDER BY update_time DESC",
    );
    const rows = stmt.all(type);
    return rows.map((row) => this.parseResource(row));
  }

  static deleteResourcesBySource(
    db: Database.Database,
    source: IResourceSource,
  ): void {
    // 获取所有资源
    const allResources = this.getAllResources(db);

    for (const resource of allResources) {
      // 检查是否包含该来源
      const newSources = resource.sources.filter(
        (s) => !(s.type === source.type && s.id === source.id),
      );

      if (newSources.length < resource.sources.length) {
        // 该资源包含了要删除的来源
        if (newSources.length === 0) {
          // 没有其他来源了，删除资源（但根据需求，我们不删除记录）
          const stmt = db.prepare(`
            UPDATE resources 
            SET sources = ?, update_time = ?
            WHERE id = ?
          `);
          stmt.run(JSON.stringify(newSources), Date.now(), resource.id);
        } else {
          // 还有其他来源，只更新 sources
          const stmt = db.prepare(`
            UPDATE resources 
            SET sources = ?, update_time = ?
            WHERE id = ?
          `);
          stmt.run(JSON.stringify(newSources), Date.now(), resource.id);
        }
      }
    }
  }
}
