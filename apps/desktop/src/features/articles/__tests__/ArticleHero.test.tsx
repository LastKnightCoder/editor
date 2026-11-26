import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { IArticle } from "@/types";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
import { articlesMessages } from "../i18n";
import { ArticleHero } from "../components/ArticleHero";

vi.mock("@/components/LocalImage", () => ({ default: () => null }));

it("切换语言保留正在输入的文章标题、焦点和选区，不触发额外编辑", async () => {
  const originalLocale = desktopLocaleSource.getSnapshot();
  desktopLocaleSource.setLocale("zh-CN");
  const onTitleChange = vi.fn();
  const onChangeCover = vi.fn();
  const article: IArticle = {
    id: 1,
    contentId: 10,
    title: "原始标题",
    author: "",
    bannerBg: "",
    bannerPosition: "center",
    content: [],
    tags: ["读书/原始标签"],
    links: [],
    isTop: false,
    isDelete: false,
    count: 0,
    create_time: 0,
    update_time: 0,
  };
  function Harness() {
    const [draft, setDraft] = useState(article);
    return (
      <ArticleHero
        article={draft}
        changingCover
        onChangeCover={onChangeCover}
        onTitleChange={title => {
          onTitleChange(title);
          setDraft(current => ({ ...current, title }));
        }}
      />
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Harness />));
    const input = host.querySelector("input")!;
    input.focus();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "尚未落库的繁體 title"
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onTitleChange).toHaveBeenCalledExactlyOnceWith("尚未落库的繁體 title");
    input.setSelectionRange(2, 5);
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(host.querySelector("input")).toBe(input);
      expect(input.value).toBe("尚未落库的繁體 title");
      expect(document.activeElement).toBe(input);
      expect([input.selectionStart, input.selectionEnd]).toEqual([2, 5]);
      expect(input.getAttribute("aria-label")).toBe(
        desktopI18n.get(articlesMessages).t("hero.title")
      );
      expect(host.querySelector("button")?.disabled).toBe(true);
      expect(onTitleChange).toHaveBeenCalledTimes(1);
      expect(onChangeCover).not.toHaveBeenCalled();
    }
  } finally {
    await act(async () => root.unmount());
    host.remove();
    desktopLocaleSource.setLocale(originalLocale);
  }
});
