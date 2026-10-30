import test from "node:test";
import assert from "node:assert/strict";
import { delimiter } from "node:path";
import { prependEnvPath } from "../run-pnpm.mjs";

test("prependEnvPath updates the existing Windows Path key", () => {
  const env = { Path: "C:\\tools", npm_execpath: "pnpm.mjs" };

  prependEnvPath(env, ["C:\\java\\bin", "C:\\android\\platform-tools"]);

  assert.deepEqual(
    Object.keys(env).filter(key => key.toLowerCase() === "path"),
    ["Path"]
  );
  assert.equal(
    env.Path,
    ["C:\\java\\bin", "C:\\android\\platform-tools", "C:\\tools"].join(delimiter)
  );
});

test("prependEnvPath creates PATH when no path key exists", () => {
  const env = {};

  prependEnvPath(env, ["/opt/java/bin"]);

  assert.equal(env.PATH, "/opt/java/bin");
});
