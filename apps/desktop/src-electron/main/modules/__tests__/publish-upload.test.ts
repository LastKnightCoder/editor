import { expect, it } from "vitest";
import { uploadPublication } from "../publish-upload";
const files = [
  { path: "index.html", publicationEntry: true as const, content: "", hash: "" },
  ...Array.from({ length: 3 }, (_, i) => ({ path: `data/${i}.json`, content: "", hash: "" })),
];
it("入口即使排在列表前面，也等待所有依赖上传成功", async () => {
  const events: string[] = [];
  await uploadPublication(files, 2, async file => {
    await Promise.resolve();
    events.push(file.path);
    return true;
  });
  expect(events.at(-1)).toBe("index.html");
  expect(events).toHaveLength(4);
});
it("任意依赖失败均不更新入口", async () => {
  const events: string[] = [];
  await uploadPublication(files, 2, async file => {
    events.push(file.path);
    return file.path !== "data/0.json";
  });
  expect(events).not.toContain("index.html");
});
it("写入异常等待其他在途依赖结束，再拒绝发布", async () => {
  let finished = false;
  await expect(
    uploadPublication(files, 2, async file => {
      if (file.path === "data/0.json") throw new Error("写入失败");
      await Promise.resolve();
      finished = true;
      return true;
    })
  ).rejects.toThrow("写入失败");
  expect(finished).toBe(true);
});
