"use strict";

const assert = require("node:assert/strict");
const { writeFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const { join } = require("node:path");

const sandbox = process.env.TAU_CONTENT_PRODUCTION_DIRECTORY;
const Sqlite = createRequire(join(process.env.TAU_CONTENT_PRODUCTION_APP, "package.json"))(
  "better-sqlite3"
);
const prepare = Sqlite.prototype.prepare;
const transaction = Sqlite.prototype.transaction;
const observed = new WeakMap();

function stop(fault, inTransaction) {
  writeFileSync(
    join(sandbox, "durability-cut.json"),
    JSON.stringify({ cut: fault.cut, nonce: fault.nonce, inTransaction })
  );
  process.kill(process.pid, "SIGKILL");
}

// 事务中的标记与同步提交返回点共用同一实际写入，防止近似定时误命中别的保存。
Sqlite.prototype.prepare = function (sql) {
  const statement = prepare.call(this, sql);
  const fault = globalThis.__tauG4DurabilityCut;
  if (!fault || this.name !== fault.database) return statement;
  assert(this.name.startsWith(join(sandbox, "home/.editor") + "/"));
  const journal = fault.cut.startsWith("journal-");
  const matches = journal
    ? /^\s*INSERT OR IGNORE INTO updates\(document_id,state,hash\)/i.test(sql)
    : /INSERT INTO operation\(operation_time,operation_id,operation_content_type,operation_action\) VALUES \(\?,\?,'content','update'\)/i.test(
        sql
      );
  if (!matches) return statement;
  const database = this;
  const run = statement.run.bind(statement);
  statement.run = function (...args) {
    const result = run(...args);
    if (
      globalThis.__tauG4DurabilityCut === fault &&
      database.inTransaction &&
      args[journal ? 0 : 1] === fault.target &&
      result.changes === 1
    ) {
      if (fault.cut.endsWith("-before")) stop(fault, true);
      observed.set(database, fault);
    }
    return result;
  };
  return statement;
};

Sqlite.prototype.transaction = function (...args) {
  const database = this;
  const execute = transaction.apply(database, args);
  return new Proxy(execute, {
    apply(fn, receiver, parameters) {
      const result = Reflect.apply(fn, receiver, parameters);
      const fault = observed.get(database);
      if (fault && fault === globalThis.__tauG4DurabilityCut && !database.inTransaction) {
        observed.delete(database);
        stop(fault, false);
      }
      return result;
    },
  });
};

require("./bootstrap.cjs");
