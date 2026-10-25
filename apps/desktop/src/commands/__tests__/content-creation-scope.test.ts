import { beforeEach, expect, it, vi } from "vitest";
import { bindDatabaseCommands } from "@/services/command-context";

const state = vi.hoisted(() => {
  const invoke = vi.fn(async () => ({ id: 1, segments: [] }));
  window.electron = { platform: "darwin", invoke } as unknown as ElectronAPI;
  return { invoke, prepare: vi.fn() };
});
vi.mock("@/services/editorKit", () => ({ prepareNewContent: state.prepare }));

import "../contracts/install";
import { invoke } from "@/electron";
import { createContent, createPendingContent } from "../content";
import { createCard, createScopedCard } from "../card";
import { createArticle } from "../article";
import { createDailyNote } from "../daily-note";
import { createDiaryEntry, createDiarySegment, createDiaryMoment } from "../diary";
import { addRootProjectItem, addChildProjectItem } from "../project";
import { createFlashcard, updateFlashcard } from "../flashcard";
import { EProjectItemType } from "@/types";

const commands = {
  createContent,
  createPendingContent,
  createCard,
  createScopedCard,
  createArticle,
  createDailyNote,
  createDiaryEntry,
  createDiarySegment,
  createDiaryMoment,
  addRootProjectItem,
  addChildProjectItem,
  createFlashcard,
  updateFlashcard,
};
const content = [{ type: "paragraph", children: [{ type: "formatted", text: "正文" }] }];
const cases: Array<[keyof typeof commands, unknown[]]> = [
  ["createContent", [content, 2]],
  ["createPendingContent", [content]],
  ["createCard", [{ content }]],
  ["createScopedCard", ["original", { content }]],
  ["createArticle", [{ content }]],
  ["createDailyNote", [{ content }]],
  ["createDiaryEntry", [{ content }]],
  ["createDiarySegment", [{ diaryId: 1, content }]],
  ["createDiaryMoment", [{ date: "2026-10-25", content }]],
  ["addRootProjectItem", [1, { projectItemType: EProjectItemType.Document, content }]],
  ["addChildProjectItem", [1, { projectItemType: EProjectItemType.Document, content }]],
  ["createFlashcard", [{ references: [{ refType: "custom", customContent: content }] }]],
  ["updateFlashcard", [{ id: 1, references: [{ refType: "custom", customContent: content }] }]],
];

beforeEach(() => {
  state.invoke.mockClear();
  state.prepare.mockReset();
});

it.each(cases)("%s 异步准备期间另一库执行命令，仍提交原库", async (name, args) => {
  let finish!: (value: unknown) => void;
  state.prepare.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const bound = bindDatabaseCommands(commands, { databaseName: "original" });
  const pending = Reflect.apply(bound[name], bound, args);
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  const other = bindDatabaseCommands({ invoke }, { databaseName: "other" });
  await other.invoke("other:read");
  expect((state.invoke.mock.calls as unknown[][])[0].at(-1)).toEqual({ toolDatabaseName: "other" });
  state.invoke.mockClear();
  finish({ content, contracts: {} });
  await pending;
  expect(state.invoke).toHaveBeenCalledTimes(1);
  expect((state.invoke.mock.calls as unknown[][])[0].at(-1)).toEqual({
    toolDatabaseName: "original",
  });
});

it.each(cases)("%s 准备期间取消，不向任何数据库提交", async (name, args) => {
  let finish!: (value: unknown) => void;
  state.prepare.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const controller = new AbortController();
  const bound = bindDatabaseCommands(commands, {
    databaseName: "original",
    signal: controller.signal,
  });
  const pending = Reflect.apply(bound[name], bound, args);
  const rejected = expect(pending).rejects.toThrow();
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  controller.abort();
  finish({ content, contracts: {} });
  await rejected;
  expect(state.invoke).not.toHaveBeenCalled();
});
