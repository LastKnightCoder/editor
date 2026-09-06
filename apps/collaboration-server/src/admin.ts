import { mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadConfig } from "./config";
import { CollaborationStore } from "./store";

const config = loadConfig();
const [command = "status", argument] = process.argv.slice(2);
const store = new CollaborationStore(config);
try {
  if (command === "status") {
    console.log(
      JSON.stringify(
        {
          documents: store.db
            .prepare("SELECT status,count(*) AS count FROM documents GROUP BY status")
            .all(),
          devices: store.db.prepare("SELECT count(*) AS count FROM devices").get(),
          storageBytes: store.storageBytes(),
        },
        null,
        2
      )
    );
  } else if (command === "ban" && argument) {
    const changes = store.db
      .prepare("UPDATE devices SET banned=1 WHERE id=?")
      .run(argument).changes;
    if (!changes) throw new Error("设备不存在");
    store.invalidateAuthorization();
    console.log("身份已停用");
  } else if (command === "close" && argument) {
    store.closeDocument(argument, store.document(argument).owner_id);
    console.log("共享已结束");
  } else if (command === "backup" && argument) {
    const directory = resolve(argument);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    await store.db.backup(join(directory, "collaboration.db"));
    copyFileSync(join(config.dataDir, "signing.key"), join(directory, "signing.key"));
    const files = store.db.prepare("SELECT DISTINCT hash FROM assets").all() as { hash: string }[];
    const assetDir = join(directory, "assets");
    mkdirSync(assetDir, { recursive: true });
    for (const { hash } of files) {
      const target = join(assetDir, hash);
      if (!existsSync(target)) copyFileSync(join(config.dataDir, "assets", hash), target);
    }
    writeFileSync(
      join(directory, "manifest.json"),
      JSON.stringify(
        {
          version: 1,
          createdAt: Date.now(),
          assets: files.map(file => file.hash),
        },
        null,
        2
      )
    );
    console.log(directory);
  } else if (command === "verify-backup" && argument) {
    const directory = resolve(argument);
    const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
    if (
      manifest.version !== 1 ||
      !existsSync(join(directory, "collaboration.db")) ||
      !existsSync(join(directory, "signing.key")) ||
      manifest.assets.some(
        (hash: string) =>
          !/^[a-f0-9]{64}$/.test(hash) || !existsSync(join(directory, "assets", hash))
      )
    )
      throw new Error("备份不完整");
    console.log("备份文件完整");
  } else
    throw new Error(
      "用法：admin status | ban <设备ID> | close <文章ID> | backup <目录> | verify-backup <目录>"
    );
} finally {
  store.close();
}
