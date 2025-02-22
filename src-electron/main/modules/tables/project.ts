import Database from 'better-sqlite3';
import {
  Project,
  ProjectItem,
  CreateProject,
  UpdateProject,
  CreateProjectItem,
  UpdateProjectItem,
  EProjectItemType
} from '@/types/project';
import Operation from './operation';
import { WhiteBoard } from "@/types";
import { Descendant } from "slate";
import { getContentLength } from "@/utils/helper";

export default class ProjectTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS project (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        title TEXT NOT NULL,
        desc TEXT,
        children TEXT,
        archived INTEGER DEFAULT 0
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS project_item (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        children TEXT,
        parents TEXT,
        projects TEXT,
        ref_type TEXT,
        ref_id INTEGER,
        white_board_data TEXT,
        project_item_type TEXT DEFAULT 'document',
        count INTEGER DEFAULT 0
      )
    `);
  }

  static upgradeTable(db: Database.Database) {
    const stmt = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'project'");
    const tableInfo = (stmt.get() as { sql: string }).sql;
    if (!tableInfo.includes('archived')) {
      const alertStmt = db.prepare("ALTER TABLE project ADD COLUMN archived INTEGER DEFAULT 0");
      alertStmt.run();
    }

    const projectItemStmt = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'project_item'");
    const projectItemTableInfo = (projectItemStmt.get() as { sql: string }).sql;

    if (!projectItemTableInfo.includes('white_board_data')) {
      const alertStmt = db.prepare("ALTER TABLE project_item ADD COLUMN white_board_data TEXT");
      alertStmt.run();
    }
    if (!projectItemTableInfo.includes('project_item_type')) {
      const alertStmt = db.prepare("ALTER TABLE project_item ADD COLUMN project_item_type TEXT DEFAULT 'document'");
      alertStmt.run();
    }
    if (!projectItemTableInfo.includes('count')) {
      const alertStmt = db.prepare("ALTER TABLE project_item ADD COLUMN count INTEGER DEFAULT 0");
      alertStmt.run();
      const projectItems = this.getAllProjectItems(db);
      for (const projectItem of projectItems) {
        const contentLength = getContentLength(projectItem.content);
        const stmt = db.prepare('UPDATE project_item SET count = ? WHERE id = ?');
        stmt.run(contentLength, projectItem.id);
      }
    }
  }

  static getListenEvents() {
    return {
      'create-project': this.createProject.bind(this),
      'update-project': this.updateProject.bind(this),
      'delete-project': this.deleteProject.bind(this),
      'get-project': this.getProject.bind(this),
      'get-all-projects': this.getAllProjects.bind(this),
      'create-project-item': this.createProjectItem.bind(this),
      'update-project-item': this.updateProjectItem.bind(this),
      'update-project-item-whiteboard-data': this.updateProjectItemWhiteBoardData.bind(this),
      'update-project-item-content': this.updateProjectItemContent.bind(this),
      'delete-project-item': this.deleteProjectItem.bind(this),
      'get-project-item': this.getProjectItem.bind(this),
      'get-project-items-by-ids': this.getProjectItemsByIds.bind(this),
      'get-project-item-by-ref': this.getProjectItemByRef.bind(this),
      'get-project-item-count-in-project': this.getProjectItemCountInProject.bind(this),
      'get-all-project-items-not-in-project': this.getAllProjectItemsNotInProject.bind(this),
      'is-project-item-not-in-any-project': this.isProjectItemNotInAnyProject.bind(this),
      'get-project-items-not-in-any-project': this.getProjectItemsNotInAnyProject.bind(this),
      'delete-project-items-not-in-any-project': this.deleteProjectItemsNotInAnyProject.bind(this),
      'get-all-project-items': this.getAllProjectItems.bind(this)
    }
  }

  static parseProject(project: any): Project {
    const parsed = {
      ...project,
      children: JSON.parse(project.children || '[]'),
      archived: Boolean(project.archived),
      createTime: project.create_time,
      updateTime: project.update_time,
      desc: JSON.parse(project.desc),
    };

    delete parsed.create_time;
    delete parsed.update_time;

    return parsed;
  }

  static parseProjectItem(item: any): ProjectItem {
    const parsed = {
      ...item,
      content: JSON.parse(item.content),
      children: JSON.parse(item.children || '[]'),
      parents: JSON.parse(item.parents || '[]'),
      projects: JSON.parse(item.projects || '[]'),
      createTime: item.create_time,
      updateTime: item.update_time,
      whiteBoardData: JSON.parse(item.white_board_data || '{}') || {},
      projectItemType: item.project_item_type as EProjectItemType || EProjectItemType.Document,
      refType: item.ref_type,
      refId: item.ref_id
    };

    delete parsed.create_time;
    delete parsed.update_time;
    delete parsed.white_board_data;
    delete parsed.ref_type;
    delete parsed.ref_id;
    delete parsed.project_item_type;

    return parsed;
  }

  static createProject(db: Database.Database, project: CreateProject): Project {
    const stmt = db.prepare(`
      INSERT INTO project
      (create_time, update_time, title, desc, children, archived)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      now,
      now,
      project.title,
      JSON.stringify(project.desc || []),
      JSON.stringify(project.children || []),
      Number(project.archived || false)
    );

    Operation.insertOperation(db, 'project', 'insert', res.lastInsertRowid, now);

    return this.getProject(db, Number(res.lastInsertRowid));
  }

  static updateProject(db: Database.Database, project: UpdateProject): Project {
    const stmt = db.prepare(`
      UPDATE project SET
        update_time = ?,
        title = ?,
        desc = ?,
        children = ?,
        archived = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      now,
      project.title,
      JSON.stringify(project.desc || []),
      JSON.stringify(project.children || []),
      Number(project.archived || false),
      project.id
    );

    Operation.insertOperation(db, 'project', 'update', project.id, now);

    return this.getProject(db, project.id);
  }

  static deleteProject(db: Database.Database, id: number): number {
    const stmt = db.prepare('DELETE FROM project WHERE id = ?');
    Operation.insertOperation(db, 'project', 'delete', id, Date.now());
    return stmt.run(id).changes;
  }

  static getProject(db: Database.Database, id: number): Project {
    const stmt = db.prepare('SELECT * FROM project WHERE id = ?');
    const project = stmt.get(id);
    return this.parseProject(project);
  }

  static getAllProjects(db: Database.Database,): Project[] {
    const stmt = db.prepare('SELECT * FROM project ORDER BY create_time DESC');
    const projects = stmt.all();
    return projects.map(p => this.parseProject(p));
  }

  static createProjectItem(db: Database.Database, item: CreateProjectItem): ProjectItem {
    const stmt = db.prepare(`
      INSERT INTO project_item
      (create_time, update_time, title, content, children, parents, projects, ref_type, ref_id, white_board_data, project_item_type, count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      now,
      now,
      item.title,
      JSON.stringify(item.content || []),
      JSON.stringify(item.children || []),
      JSON.stringify(item.parents || []),
      JSON.stringify(item.projects || []),
      item.refType,
      item.refId,
      JSON.stringify(item.whiteBoardData || {}),
      item.projectItemType,
      item.count || 0,
    );

    Operation.insertOperation(db, 'project_item', 'insert', res.lastInsertRowid, now);

    return this.getProjectItem(db, Number(res.lastInsertRowid));
  }

  static updateProjectItem(db: Database.Database, item: UpdateProjectItem): ProjectItem {
    const stmt = db.prepare(`
      UPDATE project_item SET
        update_time = ?,
        title = ?,
        content = ?,
        children = ?,
        parents = ?,
        projects = ?,
        ref_type = ?,
        ref_id = ?,
        white_board_data = ?,
        project_item_type = ?,
        count = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      now,
      item.title,
      JSON.stringify(item.content || []),
      JSON.stringify(item.children || []),
      JSON.stringify(item.parents || []),
      JSON.stringify(item.projects || []),
      item.refType,
      item.refId,
      JSON.stringify(item.whiteBoardData || {}),
      item.projectItemType,
      item.count || 0,
      item.id,
    );

    if (item.refType === 'card' && item.refId && item.content) {
      const cardStmt = db.prepare('UPDATE cards SET update_time = ?, content = ?, count = ? WHERE id = ?');
      cardStmt.run(now, JSON.stringify(item.content || []), item.count || 0, item.refId);
    }

    if (item.refType === 'article' && item.refId) {
      const articleStmt = db.prepare('UPDATE articles SET update_time = ?, content = ?, title = ?, count = ? WHERE id = ?');
      articleStmt.run(now, JSON.stringify(item.content), item.title, item.count || 0, item.refId);
    }

    if (item.refType === 'white-board' && item.refId && item.whiteBoardData) {
      const whiteBoardStmt = db.prepare('UPDATE white_boards SET update_time = ?, data = ?, title = ?, is_project_item = ? WHERE id = ?');
      whiteBoardStmt.run(now, JSON.stringify(item.whiteBoardData), item.title, 1, item.refId);
    }

    Operation.insertOperation(db, 'project_item', 'update', item.id, now);

    // project_item 可能通过 card 和 article 有引用关系，更新 project_item
    // TODO 可以优化
    if (item.refType !== '' && item.refId) {
      const projectItems = this.getProjectItemByRef(db, item.refType, item.refId);
      for (const projectItem of projectItems) {
        if (projectItem.id !== item.id) {
          const projectItemStmt = db.prepare(
            `UPDATE project_item SET update_time = ?, content = ?, white_board_data = ?, title = ?, count = ?, WHERE id = ?`
          );
          projectItemStmt.run(now, JSON.stringify(item.content || []), JSON.stringify(item.whiteBoardData || {}), item.title, projectItem.count, projectItem.id);
        }
      }
    }

    return this.getProjectItem(db, item.id);
  }
  
  static updateProjectItemWhiteBoardData(db: Database.Database, id: number, whiteBoardData: WhiteBoard['data']): ProjectItem {
    const stmt = db.prepare(`
      UPDATE project_item SET
        update_time = ?,
        white_board_data = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      now,
      JSON.stringify(whiteBoardData || {}),
      id,
    );

    Operation.insertOperation(db, 'project_item', 'update', id, now);
    
    const item = this.getProjectItem(db, id);
    
    if (item.refType === 'white-board' && item.refId && item.whiteBoardData) {
      const whiteBoardStmt = db.prepare('UPDATE white_boards SET update_time = ?, data = ? WHERE id = ?');
      whiteBoardStmt.run(now, JSON.stringify(item.whiteBoardData), item.refId);
    }
    
    if (item.refType !== '' && item.refId) {
      const projectItems = this.getProjectItemByRef(db, item.refType, item.refId);
      for (const projectItem of projectItems) {
        if (projectItem.id !== item.id) {
          const projectItemStmt = db.prepare(
            `UPDATE project_item SET update_time = ?, white_board_data = ? WHERE id = ?`
          );
          projectItemStmt.run(now, JSON.stringify(item.whiteBoardData || {}), projectItem.id);
        }
      }
    }
    
    return item;
  }
  
  static updateProjectItemContent(db: Database.Database, id: number, content: Descendant[]): ProjectItem {
    const count = getContentLength(content);
    const stmt = db.prepare(`
      UPDATE project_item SET
        update_time = ?,
        content = ?,
        count = ?,
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      now,
      JSON.stringify(content || []),
      count,
      id,
    );
    
    Operation.insertOperation(db,'project_item', 'update', id, now);

    const item = this.getProjectItem(db, id);
    
    if (item.refType === 'card' && item.refId && item.content) {
      const cardStmt = db.prepare('UPDATE cards SET update_time = ?, content = ?, count = ? WHERE id = ?');
      cardStmt.run(now, JSON.stringify(item.content || []), item.count || 0, item.refId);
    }
    
    if (item.refType === 'article' && item.refId) {
      const articleStmt = db.prepare('UPDATE articles SET update_time = ?, content = ?, count = ? WHERE id = ?');
      articleStmt.run(now, JSON.stringify(item.content), item.count || 0, item.refId);
    }
    
    if (item.refType !== '' && item.refId) {
      const projectItems = this.getProjectItemByRef(db, item.refType, item.refId);
      for (const projectItem of projectItems) {
        if (projectItem.id !== item.id) {
          const projectItemStmt = db.prepare(
            `UPDATE project_item SET update_time = ?, content = ?, count = ? WHERE id = ?`
          );
          projectItemStmt.run(now, JSON.stringify(item.content || []), projectItem.count || 0, projectItem.id);
        }
      }
    }
    
    return item;
  }

  static deleteProjectItem(db: Database.Database, id: number): number {
    // TODO，一个 projectItem 可能在多个 project 中，删除  projectItem 需谨慎
    const stmt = db.prepare('DELETE FROM project_item WHERE id = ?');

    Operation.insertOperation(db, 'project_item', 'delete', id, Date.now());
    return stmt.run(id).changes;
  }

  static getProjectItem(db: Database.Database, id: number): ProjectItem {
    const stmt = db.prepare('SELECT * FROM project_item WHERE id = ?');
    const item = stmt.get(id);
    return this.parseProjectItem(item);
  }

  static getProjectItemsByIds(db: Database.Database, ids: number[]): ProjectItem[] {
    const placeholders = ids.map(() => '?').join(',');
    const stmt = db.prepare(`SELECT * FROM project_item WHERE id IN (${placeholders})`);
    const items = stmt.all(ids);
    return items.map(item => this.parseProjectItem(item));
  }

  static getProjectItemByRef(db: Database.Database, refType: string, refId: number): ProjectItem[] {
    const stmt = db.prepare('SELECT * FROM project_item WHERE ref_type = ? AND ref_id = ?');
    const items = stmt.all(refType, refId);
    return items.map(item => this.parseProjectItem(item));
  }

  static getProjectItemCountInProject(db: Database.Database, projectId: number): number {
    const stmt = db.prepare(`
      SELECT COUNT(*) FROM project_item
      WHERE EXISTS (
        SELECT 1 FROM json_each(projects)
        WHERE value = ?
      )
    `);
    const result = stmt.get(projectId) as { 'COUNT(*)': number };
    return result['COUNT(*)'];
  }

  static getAllProjectItemsNotInProject(db: Database.Database, projectId: number): ProjectItem[] {
    const stmt = db.prepare(`
      SELECT * FROM project_item
      WHERE json_array_length(projects) = 0
      OR NOT EXISTS (
        SELECT 1 FROM json_each(projects)
        WHERE value = ?
      )
    `);
    const items = stmt.all(projectId);
    return items.map(item => this.parseProjectItem(item));
  }

  static getProjectItemsNotInAnyProject(db: Database.Database): ProjectItem[] {
    const stmt = db.prepare(`
      SELECT * FROM project_item 
      WHERE json_array_length(projects) = 0
    `);
    const items = stmt.all();
    return items.map(item => this.parseProjectItem(item));
  }

  static isProjectItemNotInAnyProject(db: Database.Database, id: number): boolean {
    const stmt = db.prepare('SELECT projects FROM project_item WHERE id = ?');
    const result = stmt.get(id) as { projects: string };
    return result.projects === '[]';
  }

  static deleteProjectItemsNotInAnyProject(db: Database.Database,): number {
    const toDeleteItems = this.getProjectItemsNotInAnyProject(db);
    for (const deleteItem of toDeleteItems) {
      this.deleteProjectItem(db, deleteItem.id);
    }
    return toDeleteItems.length;
  }

  static async deleteProjectItemByRef(db: Database.Database, refType: string, refId: number): Promise<void> {
    const stmt = db.prepare(`
      DELETE FROM project_item
      WHERE ref_type = ? AND ref_id = ?
    `);
    stmt.run(refType, refId);
  }

  static resetProjectItemRef(db: Database.Database, refType: string, refId: number) {
    const stmt = db.prepare(`
      UPDATE project_item
      SET ref_type = '', ref_id = 0 
      WHERE ref_type = ? AND ref_id = ?
    `);
    stmt.run(refType, refId);
  }

  static getAllProjectItems(db: Database.Database): ProjectItem[] {
    const stmt = db.prepare('SELECT * FROM project_item');
    const items = stmt.all();
    return items.map(item => this.parseProjectItem(item));
  }
}
