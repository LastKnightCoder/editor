import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getPluginToolId, getPluginToolName } from "../plugin-tool-name";

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());

it("按领域和动作命名，并省去重复的 MCP 领域", async () => {
  expect(await getPluginToolName("tau.questions", "questions", "list_questions")).toBe(
    "tau_questions__list-questions"
  );
  expect(await getPluginToolName("tau.questions", "archive", "list_questions")).toBe(
    "tau_questions__archive__list-questions"
  );
  expect(await getPluginToolName("other.questions", "questions", "list_questions")).toBe(
    "other_questions__list-questions"
  );
  expect(await getPluginToolId("test.mcp", "notes", "lookup")).toBe(
    "plugin_c8f8c15ff486e548_lookup"
  );
});

it("分隔符清洗、特殊字符和截断不会把不同身份合成同名", async () => {
  const identities = [
    ["tau.questions", "questions", "list_questions"],
    ["tau_questions", "questions", "list_questions"],
    ["tau-questions", "questions", "list_questions"],
    ["tau.questions", "questions", "list-questions"],
    ["tau.questions", "questions", "list__questions"],
    ["tau.questions", "questions", "archive__list_questions"],
    ["tau.questions", "archive", "list_questions"],
    ["tau.questions", "a.b", "lookup"],
    ["tau.questions", "a_b", "lookup"],
    ["tau.questions", "questions", "查询问题"],
    ["tau.questions", "questions", "查询答案"],
    ["tau.questions", "questions", "list_" + "a".repeat(100)],
    ["tau.questions", "questions", "list_" + "a".repeat(99) + "b"],
    ["tau." + "a".repeat(100), "questions", "lookup"],
    ["tau." + "a".repeat(99) + "b", "questions", "lookup"],
  ] as const;
  const names = await Promise.all(
    identities.map(([plugin, mcp, tool]) => getPluginToolName(plugin, mcp, tool))
  );
  expect(new Set(names).size).toBe(identities.length);
  for (const name of names) expect(name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
  expect(await getPluginToolName(...identities[0])).toBe(names[0]);
});
