import Database from 'better-sqlite3';
import {
  Project,
  ProjectItem,
  CreateProject,
  UpdateProject,
  CreateProjectItem,
  UpdateProjectItem
} from '@/types/project';
import Operation from './operation';

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
        ref_id INTEGER
      )
    `);
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
      'delete-project-item': this.deleteProjectItem.bind(this),
      'get-project-item': this.getProjectItem.bind(this),
      'get-project-item-by-ref': this.getProjectItemByRef.bind(this),
      'get-project-item-count-in-project': this.getProjectItemCountInProject.bind(this),
      'get-all-project-items-not-in-project': this.getAllProjectItemsNotInProject.bind(this),
      'is-project-item-not-in-any-project': this.isProjectItemNotInAnyProject.bind(this),
      'get-project-items-not-in-any-project': this.getProjectItemsNotInAnyProject.bind(this),
      'delete-project-items-not-in-any-project': this.deleteProjectItemsNotInAnyProject.bind(this),
    }
  }

  static parseProject(project: any): Project {
    return {
      ...project,
      children: JSON.parse(project.children || '[]'),
      archived: Boolean(project.archived),
      createTime: project.create_time,
      updateTime: project.update_time,
      desc: JSON.parse(project.desc),
    };
  }

  static parseProjectItem(item: any): ProjectItem {
    return {
      ...item,
      content: JSON.parse(item.content),
      children: JSON.parse(item.children || '[]'),
      parents: JSON.parse(item.parents || '[]'),
      projects: JSON.parse(item.projects || '[]'),
      createTime: item.create_time,
      updateTime: item.update_time,
      refType: item.ref_type,
      refId: item.ref_id
    };
  }

  static async createProject(db: Database.Database, project: CreateProject): Promise<Project> {
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

  static async updateProject(db: Database.Database, project: UpdateProject): Promise<Project> {
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

  static async deleteProject(db: Database.Database, id: number): Promise<number> {
    const stmt = db.prepare('DELETE FROM project WHERE id = ?');
    Operation.insertOperation(db, 'project', 'delete', id, Date.now());
    return stmt.run(id).changes;
  }

  static async getProject(db: Database.Database, id: number): Promise<Project> {
    const stmt = db.prepare('SELECT * FROM project WHERE id = ?');
    const project = stmt.get(id);
    return this.parseProject(project);
  }

  static async getAllProjects(db: Database.Database,): Promise<Project[]> {
    const stmt = db.prepare('SELECT * FROM project ORDER BY create_time DESC');
    const projects = stmt.all();
    return projects.map(p => this.parseProject(p));
  }

  static async createProjectItem(db: Database.Database, item: CreateProjectItem): Promise<ProjectItem> {
    const stmt = db.prepare(`
      INSERT INTO project_item
      (create_time, update_time, title, content, children, parents, projects, ref_type, ref_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      item.refId
    );

    Operation.insertOperation(db, 'project_item', 'insert', res.lastInsertRowid, now);

    return this.getProjectItem(db, Number(res.lastInsertRowid));
  }

  static async updateProjectItem(db: Database.Database, item: UpdateProjectItem): Promise<ProjectItem> {
    const stmt = db.prepare(`
      UPDATE project_item SET
        update_time = ?,
        title = ?,
        "content" = ?,
        children = ?,
        parents = ?,
        projects = ?,
        ref_type = ?,
        ref_id = ?
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
      item.id
    );

    // update card and article update_time and content, article also set title
    if (item.refType === 'card' && item.refId) {
      const cardStmt = db.prepare('UPDATE cards SET update_time = ?, content = ? WHERE id = ?');
      cardStmt.run(now, JSON.stringify(item.content || []), item.refId);
    }

    if (item.refType === 'article' && item.refId) {
      const articleStmt = db.prepare('UPDATE articles SET update_time = ?, content = ?, title = ? WHERE id = ?');
      articleStmt.run(now, JSON.stringify(item.content || []), item.title, item.refId);
    }

    Operation.insertOperation(db, 'project_item', 'update', item.id, now);

    // project_item 可能通过 card 和 article 有饮用关系，更新 project_item
    // TODO 可以优化
    if (item.refType !== '' && item.refId) {
      const projectItems = await this.getProjectItemByRef(db, item.refType, item.refId);
      for (const projectItem of projectItems) {
        if (projectItem.id !== item.id) {
          const projectItemStmt = db.prepare(
            `UPDATE project_item SET update_time = ?, content = ?, title = ? WHERE id = ?`
          );
          projectItemStmt.run(now, JSON.stringify(item.content || []), item.title, projectItem.id);
        }
      }
    }

    return this.getProjectItem(db, item.id);
  }

  static async deleteProjectItem(db: Database.Database, id: number): Promise<number> {
    // TODO，一个 projectItem 可能在多个 project 中，删除  projectItem 需谨慎
    const stmt = db.prepare('DELETE FROM project_item WHERE id = ?');
    Operation.insertOperation(db, 'project_item', 'delete', id, Date.now());
    return stmt.run(id).changes;
  }

  static async getProjectItem(db: Database.Database, id: number): Promise<ProjectItem> {
    const stmt = db.prepare('SELECT * FROM project_item WHERE id = ?');
    const item = stmt.get(id);
    return this.parseProjectItem(item);
  }

  static async getProjectItemByRef(db: Database.Database, refType: string, refId: number): Promise<ProjectItem[]> {
    const stmt = db.prepare('SELECT * FROM project_item WHERE ref_type = ? AND ref_id = ?');
    const items = stmt.all(refType, refId);
    return items.map(item => this.parseProjectItem(item));
  }

  static async getProjectItemCountInProject(db: Database.Database, projectId: number): Promise<number> {
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

  static async getAllProjectItemsNotInProject(db: Database.Database, projectId: number): Promise<ProjectItem[]> {
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

  static async getProjectItemsNotInAnyProject(db: Database.Database): Promise<ProjectItem[]> {
    const stmt = db.prepare(`
      SELECT * FROM project_item 
      WHERE json_array_length(projects) = 0
    `);
    const items = stmt.all();
    return items.map(item => this.parseProjectItem(item));
  }

  static async isProjectItemNotInAnyProject(db: Database.Database, id: number): Promise<boolean> {
    const stmt = db.prepare('SELECT projects FROM project_item WHERE id = ?');
    const result = stmt.get(id) as { projects: string };
    return result.projects === '[]';
  }

  static async deleteProjectItemsNotInAnyProject(db: Database.Database,): Promise<number> {
    const toDeleteItems = await this.getProjectItemsNotInAnyProject(db);
    for (const deleteItem of toDeleteItems) {
      await this.deleteProjectItem(db, deleteItem.id);
    }
    return toDeleteItems.length;
  }
}