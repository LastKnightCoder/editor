import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { createExcerptMaterialRef, parseExcerptMaterialRef } from "../material-ref";

it("宿主材料引用与原生共享夹具一致，数字编号不决定逻辑身份", () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL("../../../db-schema/fixtures/material-ref-v1.json", import.meta.url),
      "utf8"
    )
  );
  expect(createExcerptMaterialRef(7, "reader.plugin", "book:mark")).toEqual(fixture);
  expect(parseExcerptMaterialRef({ ...fixture, id: 99 })).toEqual({
    provider: "reader.plugin",
    externalId: "book:mark",
  });
  expect(
    parseExcerptMaterialRef(createExcerptMaterialRef(1, "reader.plugin", "字" + "\n".repeat(511)))
  ).toEqual({ provider: "reader.plugin", externalId: "字" + "\n".repeat(511) });
});

it("缺少、伪造版本或类型不匹配的身份明确拒绝，不回退到数字编号", () => {
  for (const identity of [
    "",
    "{}",
    '["excerpt",2,"reader.plugin","book:mark"]',
    '["pdf-annotation",1,"reader.plugin","book:mark"]',
  ])
    expect(() => parseExcerptMaterialRef({ kind: "excerpt", id: 7, identity })).toThrow();
});
