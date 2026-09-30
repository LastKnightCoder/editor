import { test } from "node:test";
import assert from "node:assert/strict";
import { forbiddenImports, forbiddenDependencies } from "./antd-ratchet.mjs";

test("静态、深路径、副作用与类型导入均被禁用", () => {
  assert.deepEqual(
    forbiddenImports(
      'import X from "antd"; import "antd/dist/reset.css"; import type { X } from "@ant-design/icons";'
    ),
    ["antd", "antd/dist/reset.css", "@ant-design/icons"]
  );
});
test("重导出、require、动态 import 与 TS import-equals 均被禁用", () => {
  assert.deepEqual(
    forbiddenImports(
      'export { X } from "antd"; const X = require("antd/es/x"); import("@ant-design/icons"); import Y = require("antd");'
    ),
    ["antd", "antd/es/x", "@ant-design/icons"]
  );
});
test("注释、测试字符串和同名本地路径不误报", () => {
  assert.deepEqual(
    forbiddenImports(
      '// import X from "antd";\n const fixture = \'import X from "antd"\'; import X from "./antd-helper";'
    ),
    []
  );
});
test("直接、开发、peer 与可选依赖均无豁免", () => {
  assert.deepEqual(
    forbiddenDependencies({
      dependencies: { antd: "1" },
      devDependencies: { "@ant-design/icons": "1" },
      peerDependencies: { antd: "2" },
      optionalDependencies: { "@ant-design/charts": "1" },
    }),
    ["antd", "@ant-design/icons", "@ant-design/charts"]
  );
});
