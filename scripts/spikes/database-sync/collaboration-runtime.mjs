import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createNodeDocument,
  applyNodeDocumentUpdate,
  validateNodeDocument,
  readNodeDocument,
} from "../../../packages/collaboration/src/node-document.ts";
import { NodeTree } from "../../../packages/collaboration/src/node-tree.ts";
import { prepareContentContract } from "../../../packages/db-schema/content-contracts.ts";
import { createContentMetrics } from "../../../packages/db-schema/content-metrics.ts";

const require = createRequire(
  new URL("../../../packages/collaboration/package.json", import.meta.url)
);
const manifestPath = require.resolve("yjs/package.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
export const Y = await import(
  pathToFileURL(resolve(dirname(manifestPath), manifest.exports["."].import)).href
);
export {
  createNodeDocument,
  applyNodeDocumentUpdate,
  validateNodeDocument,
  readNodeDocument,
  NodeTree,
  prepareContentContract,
  createContentMetrics,
};
