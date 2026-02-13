import Database from "better-sqlite3";
import { SetWebViewPreferencePayload, WebViewPreference } from "@/types";

export default class WebViewPreferenceTable {
  static upgradeTable(_db: Database.Database) {
    // placeholder for migrations
  }

  static parse(row: Record<string, unknown>): WebViewPreference {
    return {
      projectItemId: row.project_item_id as number,
      preferredContentId:
        (row.preferred_content_id as number | null | undefined) ?? null,
    };
  }

  static getListenEvents() {
    return {
      "web-view-preference:get": this.getByProjectItemId.bind(this),
      "web-view-preference:set": this.setPreference.bind(this),
    };
  }

  static getByProjectItemId(
    db: Database.Database,
    projectItemId: number,
  ): WebViewPreference | null {
    const row = db
      .prepare(`SELECT * FROM web_view_preference WHERE project_item_id = ?`)
      .get(projectItemId) as Record<string, unknown> | undefined;
    return row ? this.parse(row) : null;
  }

  static setPreference(
    db: Database.Database,
    payload: SetWebViewPreferencePayload,
  ): WebViewPreference {
    const stmt = db.prepare(`
      INSERT INTO web_view_preference (project_item_id, preferred_content_id)
      VALUES (?, ?)
      ON CONFLICT(project_item_id) DO UPDATE SET preferred_content_id = excluded.preferred_content_id
    `);
    stmt.run(payload.projectItemId, payload.preferredContentId);
    const preference = this.getByProjectItemId(db, payload.projectItemId);
    if (!preference) {
      throw new Error("Failed to update web view preference");
    }
    return preference;
  }
}
