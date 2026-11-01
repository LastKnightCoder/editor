import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import SCHEMA from "@tau/db-schema/schema/device-sync-local.sql?raw";
import HEALTH from "@tau/db-schema/schema/device-sync-local-health.sql?raw";

function assertRepairable(error: unknown) {
  const failure = error as { code?: string; message?: string };
  if (failure.message?.startsWith("DEVICE_SYNC_LOCAL_DAMAGED:")) return;
  if (failure.code === "SQLITE_ERROR" && /no such (column|table):/.test(failure.message ?? ""))
    return;
  throw error;
}
export function ensureLocalGeneration(db: Database.Database): string {
  if (
    !db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_tau_device_local'").get()
  ) {
    const material = db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name GLOB '_tau_device_*' LIMIT 1"
      )
      .get();
    db.transaction(() => {
      db.exec(SCHEMA);
      db.prepare("INSERT INTO _tau_device_local(id,generation) VALUES(1,?)").run(
        material ? randomUUID() : ""
      );
    })();
  }
  try {
    if (db.prepare(HEALTH).get()) throw new Error("DEVICE_SYNC_LOCAL_DAMAGED: 本机版本记录损坏");
    return (
      db.prepare("SELECT generation FROM _tau_device_local WHERE id=1").get() as {
        generation: string;
      }
    ).generation;
  } catch (error) {
    assertRepairable(error);
    return db.transaction(() => {
      let retained: string | undefined;
      try {
        const rows = db.prepare("SELECT id,generation FROM _tau_device_local").all() as {
          id: number;
          generation: unknown;
        }[];
        if (
          rows.length === 1 &&
          rows[0].id === 1 &&
          typeof rows[0].generation === "string" &&
          /^(?:|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/.test(rows[0].generation)
        )
          retained = rows[0].generation;
      } catch (readError) {
        assertRepairable(readError);
      }
      db.exec(
        `ALTER TABLE _tau_device_local RENAME TO _tau_device_quarantine_${randomUUID().replaceAll("-", "")}_local`
      );
      db.exec(SCHEMA);
      const generation = retained ?? randomUUID();
      db.prepare("INSERT INTO _tau_device_local(id,generation) VALUES(1,?)").run(generation);
      if (db.prepare(HEALTH).get()) throw new Error("DEVICE_SYNC_LOCAL_DAMAGED: 本机版本重建失败");
      return generation;
    })();
  }
}
