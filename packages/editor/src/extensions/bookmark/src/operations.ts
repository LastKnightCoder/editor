import { Editor, Element, Node, Path, Transforms, type PathRef } from "slate";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import {
  captureElementSubmission,
  createParagraph,
  getCommandElementPath,
  setOrInsertNode,
  type BlockElement,
} from "@tau/editor/api";
import { IFetchService, IResourceService } from "@tau/shared/host-services";

import type { BookmarkAppearance, BookmarkElement, BookmarkMeta } from "./types";
import { downloadImage, readLinkPreview } from "./preview";

export const isBookmarkElement = (node: unknown): node is BookmarkElement =>
  Element.isElement(node) && node.type === "bookmark";

export const createBookmark = (url: string, appearance?: BookmarkAppearance): BookmarkElement => ({
  type: "bookmark",
  url,
  ...(appearance ? { appearance } : {}),
  children: [{ type: "formatted", text: "" }],
});

const createLoadingStore = () => createStore<readonly PathRef[]>(() => []);
const loadingByEditor = new WeakMap<Editor, ReturnType<typeof createLoadingStore>>();
const loadingOf = (editor: Editor) => {
  let store = loadingByEditor.get(editor);
  if (!store) loadingByEditor.set(editor, (store = createLoadingStore()));
  return store;
};

/** 读取中只属于当前实例，不写进文档或协作数据。 */
export function useBookmarkLoading(editor: Editor, element: BookmarkElement): boolean {
  return useStore(loadingOf(editor), refs =>
    refs.some(
      ref =>
        ref.current && Node.has(editor, ref.current) && Node.get(editor, ref.current) === element
    )
  );
}

/** 用户改过的封面不重新存储；网页封面与图标经资源服务按设置存本地或上传。 */
async function storeImage(
  editor: Editor,
  fetcher: typeof fetch,
  url: string | undefined,
  name: string,
  signal: AbortSignal
): Promise<string | undefined> {
  if (!url) return undefined;
  const upload = editor.tryGetService?.(IResourceService)?.upload;
  if (!upload) return undefined;
  const file = await downloadImage(fetcher, url, name, signal);
  if (!file) return undefined;
  try {
    return (await upload(file)) || undefined;
  } catch (error) {
    console.error("书签图片存储失败:", error);
    return undefined;
  }
}

/**
 * 读取网页信息并写回节点；同一节点同时只读一次。
 * 宿主没有跨域 fetch 时写入空快照，按网址卡显示。
 */
export async function fetchBookmarkMeta(
  editor: Editor,
  element: BookmarkElement,
  options: { path?: Path; signal?: AbortSignal } = {}
): Promise<void> {
  const path = getCommandElementPath(editor, { element, path: options.path });
  if (!path) return;
  const loading = loadingOf(editor);
  if (loading.getState().some(ref => ref.current && Path.equals(ref.current, path))) return;
  const url = element.url;
  const submission = captureElementSubmission(editor, {
    element,
    path,
    signal: options.signal,
    services: [IFetchService, IResourceService],
    accept: current => isBookmarkElement(current) && current.url === url,
  });
  if (submission.check()) {
    submission.dispose();
    return;
  }
  const ref = Editor.pathRef(editor, path);
  loading.setState([...loading.getState(), ref], true);
  try {
    const fetcher = editor.tryGetService?.(IFetchService)?.fetch;
    const preview = fetcher ? await readLinkPreview(fetcher, url, submission.signal) : null;
    let meta: BookmarkMeta;
    if (!fetcher) meta = { fetchedAt: Date.now() };
    else if (!preview) meta = { failed: true, fetchedAt: Date.now() };
    else {
      const [image, icon] = await Promise.all([
        storeImage(editor, fetcher, preview.image, "bookmark-cover", submission.signal),
        storeImage(editor, fetcher, preview.icon, "bookmark-icon", submission.signal),
      ]);
      meta = {
        ...(preview.title ? { title: preview.title } : {}),
        ...(preview.description ? { description: preview.description } : {}),
        ...(preview.siteName ? { siteName: preview.siteName } : {}),
        ...(image ? { image } : {}),
        ...(preview.image ? { sourceImage: preview.image } : {}),
        ...(icon ? { icon } : {}),
        ...(preview.icon ? { sourceIcon: preview.icon } : {}),
        fetchedAt: Date.now(),
      };
    }
    submission.commit(({ path }) => {
      Transforms.setNodes(editor, { meta } as Partial<BookmarkElement>, { at: path });
    });
  } catch (error) {
    if (!submission.signal.aborted) console.error("读取网页信息失败:", error);
  } finally {
    ref.unref();
    loading.setState(
      loading.getState().filter(item => item !== ref),
      true
    );
    submission.dispose();
  }
}

/** 在当前位置插入书签并开始读取网页信息；返回插入位置。 */
export function insertBookmark(editor: Editor, url: string): Path | undefined {
  const path = setOrInsertNode(editor, createBookmark(url) as unknown as BlockElement);
  if (!path || !Node.has(editor, path)) return undefined;
  const node = Node.get(editor, path);
  if (isBookmarkElement(node)) void fetchBookmarkMeta(editor, node, { path });
  return path;
}

/** 把空段落替换为书签（粘贴菜单选「网页书签」）。 */
export function replaceParagraphWithBookmark(editor: Editor, path: Path, url: string): void {
  const bookmark = createBookmark(url);
  Editor.withoutNormalizing(editor, () => {
    Transforms.removeNodes(editor, { at: path });
    Transforms.insertNodes(editor, bookmark as unknown as Node, { at: path });
    const next = Path.next(path);
    if (!Node.has(editor, next)) Transforms.insertNodes(editor, createParagraph(), { at: next });
    Transforms.select(editor, Editor.start(editor, next));
  });
  const node = Node.get(editor, path);
  if (isBookmarkElement(node)) void fetchBookmarkMeta(editor, node, { path });
}

export function setBookmarkFields(
  editor: Editor,
  element: BookmarkElement,
  patch: Partial<Pick<BookmarkElement, "appearance" | "overrides">>
): void {
  const path = getCommandElementPath(editor, { element });
  if (!path) return;
  Transforms.setNodes(editor, patch, { at: path });
}
