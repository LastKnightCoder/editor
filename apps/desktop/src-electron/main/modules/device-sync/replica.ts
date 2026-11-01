import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join, basename } from "node:path";
import { randomUUID } from "node:crypto";
import SQL from "@tau/db-schema/schema/device-sync.sql?raw";
import { ensureMainSchema } from "../main-schema";
import { DeviceSyncEngine } from "@tau/collaboration/src/device-sync/engine";
import type { DeviceReply, DeviceState } from "@tau/collaboration/src/device-sync/protocol";
import { prepareDeviceDocument } from "@tau/collaboration/src/device-sync/documents";
import {
  DeviceDatabaseStore,
  initializeDeviceSyncDatabase,
  readDeviceSyncState,
} from "./database-store";
import { projectDeviceDocument } from "./content-state";
import { writeDeviceState } from "./atomic-file";
import { parseDevicePairCode, requestDevice, type DevicePeer } from "./transport";

export interface DesktopDevicePeer extends DevicePeer {
  enabled: boolean;
}
export function readDesktopPeer(directory: string): DesktopDevicePeer | undefined {
  const path = join(directory, "peer.json");
  if (!existsSync(path)) return;
  const value = JSON.parse(readFileSync(path, "utf8")) as DesktopDevicePeer;
  if (
    !value ||
    typeof value.database !== "string" ||
    basename(value.database) !== value.database ||
    !value.database.endsWith(".db") ||
    typeof value.library !== "string" ||
    typeof value.node !== "string" ||
    typeof value.token !== "string" ||
    value.token.length < 40 ||
    typeof value.enabled !== "boolean"
  )
    throw new Error("DEVICE_SYNC_IDENTITY: 设备信任记录不可读，请重新配对");
  return value;
}
export async function pairDesktopReplica(options: {
  directory: string;
  databases: string;
  node: string;
  code: string;
  name: string;
  existingDatabase?: string;
}) {
  mkdirSync(options.directory, { recursive: true, mode: 0o700 });
  const code = parseDevicePairCode(options.code);
  let database: string | undefined,
    existing = false;
  let previous: DesktopDevicePeer | undefined;
  try {
    previous = readDesktopPeer(options.directory);
  } catch {
    /* 原信任材料保留，重新配对显式建立授权。 */
  }
  for (const candidate of new Set([
    options.existingDatabase,
    previous?.library === code.library ? previous.database : undefined,
  ])) {
    if (
      !candidate ||
      basename(candidate) !== candidate ||
      !existsSync(join(options.databases, candidate))
    )
      continue;
    const db = new Database(join(options.databases, candidate), { readonly: true });
    try {
      const state = readDeviceSyncState(db);
      if (state?.library === code.library && state.authority === options.node)
        throw new Error("DEVICE_SYNC_AUTHORITY: 本机已经是这份资料库的协调电脑");
      if (
        state?.library === code.library &&
        state.node === options.node &&
        state.authority !== state.node
      ) {
        database = candidate;
        existing = true;
        break;
      }
    } finally {
      db.close();
    }
  }
  const result = await requestDevice<{ reply: DeviceReply; token: string }>(code, {
    kind: "pair",
    secret: code.secret,
    node: options.node,
    name: options.name.slice(0, 80),
    existing,
  });
  if (
    result.reply?.state?.library !== code.library ||
    result.reply.protocol !== code.protocol ||
    result.reply.state.authority === options.node ||
    typeof result.token !== "string" ||
    result.token.length < 40
  )
    throw new Error("DEVICE_SYNC_IDENTITY: 配对身份或资料库不同");
  if (!existing) {
    if (!result.reply.snapshot) throw new Error("DEVICE_SYNC_PAIR: 配对快照不完整");
    database = `device-${randomUUID()}.db`;
    const path = join(options.databases, database),
      temporary = `${path}.pairing`;
    const db = new Database(temporary);
    try {
      ensureMainSchema(db);
      const schema = (
        db.prepare("SELECT value FROM schema_meta WHERE key='main_schema_hash'").get() as {
          value: string;
        }
      ).value;
      if (schema !== result.reply.state.schema)
        throw new Error("DEVICE_SYNC_SCHEMA: 请先将两端软件更新到相同版本");
      initializeDeviceSyncDatabase(db, SQL);
      const state = {
        ...result.reply.state,
        node: options.node,
        ackSeq: 0,
        ackHead: result.reply.state.head,
        enabled: true,
      };
      db.prepare("INSERT INTO _tau_device_state(id,payload) VALUES(1,?)").run(
        JSON.stringify(state)
      );
      await new DeviceDatabaseStore(db, (document, settings) =>
        projectDeviceDocument(db, document, settings)
      ).commit({
        expectedHead: state.head,
        expectedSequence: 0,
        state,
        snapshot: result.reply.snapshot,
        documents: await Promise.all(result.reply.snapshot.documents.map(prepareDeviceDocument)),
      });
      initializeDeviceSyncDatabase(db, SQL);
      db.pragma("wal_checkpoint(TRUNCATE)");
      db.close();
      renameSync(temporary, path);
    } finally {
      if (db.open) db.close();
      for (const file of [temporary, `${temporary}-wal`, `${temporary}-shm`])
        rmSync(file, { force: true });
    }
  }
  const peer: DesktopDevicePeer = {
    addresses: code.addresses,
    port: code.port,
    certificate: code.certificate,
    database: database!,
    library: code.library,
    node: options.node,
    token: result.token,
    enabled: true,
  };
  writeDeviceState(join(options.directory, "peer.json"), peer);
  return { peer, existing };
}

export async function prepareReplicaDownload(
  path: string,
  original: DeviceState,
  sequence: number,
  reply: DeviceReply
) {
  const db = new Database(path);
  try {
    ensureMainSchema(db);
    initializeDeviceSyncDatabase(db, SQL);
    db.prepare("INSERT INTO _tau_device_state(id,payload) VALUES(1,?)").run(
      JSON.stringify(original)
    );
    db.prepare("INSERT INTO sqlite_sequence(name,seq) VALUES('_tau_device_log',?)").run(
      BigInt(sequence)
    );
    initializeDeviceSyncDatabase(db, SQL);
    await new DeviceSyncEngine(
      new DeviceDatabaseStore(db, (document, settings) =>
        projectDeviceDocument(db, document, settings)
      )
    ).replace(reply);
    db.pragma("wal_checkpoint(TRUNCATE)");
  } finally {
    db.close();
  }
}
