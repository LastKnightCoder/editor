import { ipcMain } from 'electron';
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
  db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initTables();
    this.initHandlers();
  }

  initTables() {
    this.db.exec(`
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

    this.db.exec(`
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

  initHandlers() {
    // Project handlers
    ipcMain.handle('create-project', async (_event, params: CreateProject) => {
      return await this.createProject(params);
    });

    ipcMain.handle('update-project', async (_event, params: UpdateProject) => {
      return await this.updateProject(params);
    });

    ipcMain.handle('delete-project', async (_event, id: number) => {
      return await this.deleteProject(id);
    });

    ipcMain.handle('get-project', async (_event, id: number) => {
      return await this.getProject(id);
    });

    ipcMain.handle('get-all-projects', async () => {
      return await this.getAllProjects();
    });

    // Project item handlers
    ipcMain.handle('create-project-item', async (_event, params: CreateProjectItem) => {
      return await this.createProjectItem(params);
    });

    ipcMain.handle('update-project-item', async (_event, params: UpdateProjectItem) => {
      return await this.updateProjectItem(params);
    });

    ipcMain.handle('delete-project-item', async (_event, id: number) => {
      return await this.deleteProjectItem(id);
    });

    ipcMain.handle('get-project-item', async (_event, id: number) => {
      return await this.getProjectItem(id);
    });

    ipcMain.handle('get-project-item-by-ref', async (_event, refType: string, refId: number) => {
      return await this.getProjectItemByRef(refType, refId);
    });

    // Additional utility handlers
    ipcMain.handle('get-project-item-count-in-project', async (_event, projectId: number) => {
      return await this.getProjectItemCountInProject(projectId);
    });

    ipcMain.handle('get-all-project-items-not-in-project', async (_event, projectId: number) => {
      return await this.getAllProjectItemsNotInProject(projectId);
    });

    ipcMain.handle('is-project-item-not-in-any-project', async (_event, id: number) => {
      return await this.isProjectItemNotInAnyProject(id);
    });

    ipcMain.handle('get-project-items-not-in-any-project', async () => {
      return await this.getProjectItemsNotInAnyProject();
    })

    ipcMain.handle('delete-project-items-not-in-any-project', async () => {
      return await this.deleteProjectItemsNotInAnyProject();
    });
  }

  parseProject(project: any): Project {
    return {
      ...project,
      children: JSON.parse(project.children || '[]'),
      archived: Boolean(project.archived),
      createTime: project.create_time,
      updateTime: project.update_time,
      desc: JSON.parse(project.desc),
    };
  }

  parseProjectItem(item: any): ProjectItem {
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

  async createProject(project: CreateProject): Promise<Project> {
    const stmt = this.db.prepare(`
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

    Operation.insertOperation(this.db, 'project', 'insert', res.lastInsertRowid, now);

    return this.getProject(Number(res.lastInsertRowid));
  }

  async updateProject(project: UpdateProject): Promise<Project> {
    const stmt = this.db.prepare(`
      UPDATE project SET
        update_time = ?,
        title = ?,
        description = ?,
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

    Operation.insertOperation(this.db, 'project', 'update', project.id, now);

    return this.getProject(project.id);
  }

  async deleteProject(id: number): Promise<number> {
    const stmt = this.db.prepare('DELETE FROM project WHERE id = ?');
    Operation.insertOperation(this.db, 'project', 'delete', id, Date.now());
    return stmt.run(id).changes;
  }

  async getProject(id: number): Promise<Project> {
    const stmt = this.db.prepare('SELECT * FROM project WHERE id = ?');
    const project = stmt.get(id);
    return this.parseProject(project);
  }

  async getAllProjects(): Promise<Project[]> {
    const stmt = this.db.prepare('SELECT * FROM project ORDER BY create_time DESC');
    const projects = stmt.all();
    return projects.map(p => this.parseProject(p));
  }

  async createProjectItem(item: CreateProjectItem): Promise<ProjectItem> {
    const stmt = this.db.prepare(`
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

    Operation.insertOperation(this.db, 'project_item', 'insert', res.lastInsertRowid, now);

    return this.getProjectItem(Number(res.lastInsertRowid));
  }

  async updateProjectItem(item: UpdateProjectItem): Promise<ProjectItem> {
    const stmt = this.db.prepare(`
      UPDATE project_item SET
        update_time = ?,
        title = ?,
        content = ?,
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
      const cardStmt = this.db.prepare('UPDATE cards SET update_time = ? content = ? WHERE id = ?');
      cardStmt.run(now, JSON.stringify(item.content || []), item.refId);
    }

    if (item.refType === 'article' && item.refId) {
      const articleStmt = this.db.prepare('UPDATE articles SET update_time = ?, content = ?, title = ? WHERE id = ?');
      articleStmt.run(now, JSON.stringify(item.content || []), item.title, item.refId);
    }

    Operation.insertOperation(this.db, 'project_item', 'update', item.id, now);

    // project_item 可能通过 card 和 article 有饮用关系，更新 project_item
    // TODO 可以优化
    if (item.refType !== '' && item.refId) {
      const projectItems = await this.getProjectItemByRef(item.refType, item.refId);
      for (const projectItem of projectItems) {
        if (projectItem.id !== item.id) {
          const projectItemStmt = this.db.prepare(
            `UPDATE project_items SET update_time = ?, content = ?, title = ? WHERE id = ?`
          );
          projectItemStmt.run(now, JSON.stringify(item.content || []), item.title, projectItem.id);
        }
      }
    }

    return this.getProjectItem(item.id);
  }

  async deleteProjectItem(id: number): Promise<number> {
    // TODO，一个 projectItem 可能在多个 project 中，删除  projectItem 需谨慎
    const stmt = this.db.prepare('DELETE FROM project_item WHERE id = ?');
    Operation.insertOperation(this.db, 'project_item', 'delete', id, Date.now());
    return stmt.run(id).changes;
  }

  async getProjectItem(id: number): Promise<ProjectItem> {
    const stmt = this.db.prepare('SELECT * FROM project_item WHERE id = ?');
    const item = stmt.get(id);
    return this.parseProjectItem(item);
  }

  async getProjectItemByRef(refType: string, refId: number): Promise<ProjectItem[]> {
    const stmt = this.db.prepare('SELECT * FROM project_item WHERE ref_type = ? AND ref_id = ?');
    const items = stmt.all(refType, refId);
    return items.map(item => this.parseProjectItem(item));
  }

  async getProjectItemCountInProject(projectId: number): Promise<number> {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) FROM project_item
      WHERE EXISTS (
        SELECT 1 FROM json_each(projects)
        WHERE value = ?
      )
    `);
    const result = stmt.get(projectId) as { 'COUNT(*)': number };
    return result['COUNT(*)'];
  }

  async getAllProjectItemsNotInProject(projectId: number): Promise<ProjectItem[]> {
    const stmt = this.db.prepare(`
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

  async getProjectItemsNotInAnyProject(): Promise<ProjectItem[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM project_item 
      WHERE json_array_length(projects) = 0
    `);
    const items = stmt.all();
    return items.map(item => this.parseProjectItem(item));
  }

  async isProjectItemNotInAnyProject(id: number): Promise<boolean> {
    const stmt = this.db.prepare('SELECT projects FROM project_item WHERE id = ?');
    const result = stmt.get(id) as { projects: string };
    return result.projects === '[]';
  }

  async deleteProjectItemsNotInAnyProject(): Promise<number> {
    const toDeleteItems = await this.getProjectItemsNotInAnyProject();
    for (const deleteItem of toDeleteItems) {
      await this.deleteProjectItem(deleteItem.id);
    }
    return toDeleteItems.length;
  }
}