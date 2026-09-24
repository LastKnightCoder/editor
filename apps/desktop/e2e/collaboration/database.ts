import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const directory = process.env.TAU_COLLAB_E2E_DIR!;
const databases = new Map<string, Database.Database>();
for (const name of ["primary", "secondary"]) {
  const db = new Database(join(directory, `${name}.db`));
  db.exec(readFileSync(process.env.TAU_COLLAB_E2E_SCHEMA!, "utf8"));
  const content = JSON.stringify([
    {
      type: "paragraph",
      children: [{ type: "formatted", text: name === "primary" ? "同步测试正文" : "另一个数据库" }],
    },
  ]);
  db.prepare(
    "INSERT INTO contents(id,create_time,update_time,content,count) VALUES (7,100,100,?,6)"
  ).run(content);
  db.exec(
    "INSERT INTO articles(id,title,create_time,update_time,content_id) VALUES (1,'协作测试标题',1,1,7); INSERT INTO project_item(id,title,create_time,update_time,content_id) VALUES (2,'项目旧标题',1,1,7),(3,'共享项目旧标题',1,1,7);"
  );
  databases.set(name, db);
}

export default {
  databases,
  windowToDatabase: new Map<number, string>(),
  getDatabase: (name: string) => databases.get(name),
};
