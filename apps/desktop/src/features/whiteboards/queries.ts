import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  addSubWhiteBoard,
  createWhiteBoard,
  deleteSubWhiteBoard,
  deleteWhiteBoard,
  duplicateSubWhiteBoard,
  getAllWhiteBoards,
  getWhiteBoardById,
  renameSubWhiteBoard,
  reorderSubWhiteBoard,
  setActiveSubWhiteBoard,
  getFileBaseName,
  getProjectById,
  getProjectItemByRef,
  getWhiteBoardContentById,
  readBinaryFile,
  selectFile,
  updateWhiteBoardContent,
  updateWhiteBoardMeta,
} from "@/commands";
import useUploadResource from "@/hooks/useUploadResource";
import useSettingStore from "@/stores/useSettingStore";
import type { WhiteBoard, WhiteBoardContent } from "@/types";
import { toast } from "@tau/ui";
import { normalizeTags, toItem, type WhiteboardItem } from "./model";

// 旧版缩略图是真实截图、存在 IndexedDB；现改为按页数据生成示意图（schematic.ts），清掉遗留缓存
if (typeof indexedDB !== "undefined") indexedDB.deleteDatabase("tau-whiteboard-thumbnails");

const hasBridge = typeof window !== "undefined" && Boolean(window.electron);
const listKey = (database: string) => ["whiteboards", "list", database] as const;
const detailKey = (database: string, id: number) =>
  ["whiteboards", "detail", database, id] as const;
const contentKey = (database: string, id: number) => ["whiteboard-content", database, id] as const;

/* ───────── 列表 ───────── */

/**
 * 全部白板（含各页数据，列表接口原样返回）。写入口不止本页（项目条目、AI 工具、画布页），
 * 没有变更广播：画布页保存后与本页写入后主动失效，另开窗口回来时按焦点刷新。
 */
export function useWhiteboards() {
  const database = useSettingStore(state => state.setting.database.active);
  const query = useQuery({
    queryKey: listKey(database),
    queryFn: async () => (hasBridge ? (await getAllWhiteBoards()).map(toItem) : []),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  return { items: query.data ?? null, loading: query.isPending };
}

/** 侧栏标签子项槽「是否有内容」：有白板带标签才展开 */
export function useWhiteboardNavHasContent() {
  const { items } = useWhiteboards();
  return Boolean(items?.some(item => item.tags.length > 0));
}

const invalidateList = (client: QueryClient) =>
  client.invalidateQueries({ queryKey: ["whiteboards", "list"] });

/* ───────── 写入 ───────── */

export interface WhiteboardInfo {
  title: string;
  description: string;
  tags: string[];
}

/** 新白板的第一页：空画布 */
const emptyPage = (name: string) => ({
  name,
  data: {
    children: [],
    viewPort: { zoom: 1, minX: 0, minY: 0, width: 0, height: 0 },
    selection: { selectArea: null, selectedElements: [] },
    presentationSequences: [],
  },
});

export function useWhiteboardMutations() {
  const client = useQueryClient();
  const uploadResource = useUploadResource();
  const database = useSettingStore(state => state.setting.database.active);

  return useMemo(() => {
    const patchItem = (board: WhiteBoard) => {
      client.setQueryData<WhiteboardItem[]>(listKey(database), prev =>
        prev?.map(item => (item.id === board.id ? toItem(board) : item))
      );
      client.setQueryData(detailKey(database, board.id), board);
    };
    const updateMeta = async (
      id: number,
      patch: Partial<Pick<WhiteBoard, "title" | "description" | "tags" | "snapshot">>
    ) => {
      const board = await updateWhiteBoardMeta(id, patch);
      patchItem(board);
      return board;
    };

    return {
      async create(info: WhiteboardInfo): Promise<WhiteBoard> {
        const title = info.title.trim();
        const board = await createWhiteBoard({
          title,
          description: info.description.trim(),
          tags: normalizeTags(info.tags),
          snapshot: "",
          whiteBoardContentList: [emptyPage(title || "未命名")],
        });
        void invalidateList(client);
        return board;
      },

      saveInfo(id: number, info: WhiteboardInfo) {
        return updateMeta(id, {
          title: info.title.trim(),
          description: info.description.trim(),
          tags: normalizeTags(info.tags),
        });
      },

      /** 选本地图片作封面；取消选择返回 false */
      async pickCover(id: number): Promise<boolean> {
        const paths = await selectFile({
          properties: ["openFile"],
          filters: [{ name: "Image", extensions: ["jpg", "jpeg", "png", "gif", "bmp", "webp"] }],
        });
        const path = Array.isArray(paths) ? paths[0] : paths;
        if (!path) return false;
        const data = (await readBinaryFile(path)) as Uint8Array<ArrayBuffer>;
        const url = await uploadResource(new File([data], await getFileBaseName(path)));
        if (!url) throw new Error("封面上传失败");
        await updateMeta(id, { snapshot: url });
        return true;
      },

      removeCover(id: number) {
        return updateMeta(id, { snapshot: "" });
      },

      async remove(item: WhiteboardItem) {
        await deleteWhiteBoard(item.id);
        client.setQueryData<WhiteboardItem[]>(listKey(database), prev =>
          prev?.filter(x => x.id !== item.id)
        );
      },

      /** 从所有白板上摘掉这个标签（侧栏子项右键「清理」） */
      async clearTag(name: string, items: WhiteboardItem[]) {
        for (const item of items) {
          if (!item.tags.includes(name)) continue;
          await updateMeta(item.id, { tags: item.tags.filter(t => t !== name) });
        }
      },
    };
  }, [client, uploadResource, database]);
}

/* ───────── 详情（多页） ───────── */

/** 一块白板及其页顺序（详情页的页签栏用；页内容各自经 useWhiteBoardContent 读取） */
export function useWhiteboardDetail(id: number) {
  const database = useSettingStore(state => state.setting.database.active);
  const query = useQuery({
    queryKey: detailKey(database, id),
    queryFn: () => getWhiteBoardById(id),
    enabled: hasBridge,
  });
  return { board: query.data ?? null, loading: query.isPending, error: query.isError };
}

/** 新页的空画布（与新建白板第一页同形） */
const EMPTY_PAGE_DATA = emptyPage("").data;

/** 页操作：写入后用主进程返回的白板更新详情缓存，并失效列表（页数 / 元素数随之变化） */
export function useWhiteboardPageMutations(boardId: number) {
  const client = useQueryClient();
  const database = useSettingStore(state => state.setting.database.active);

  return useMemo(() => {
    const setBoard = (board: WhiteBoard) => {
      client.setQueryData(detailKey(database, boardId), board);
      void invalidateList(client);
    };
    const refetch = async () => setBoard(await getWhiteBoardById(boardId));

    return {
      /** 记住停留的页（查看状态，不刷新更新时间） */
      async setActive(pageId: number) {
        client.setQueryData<WhiteBoard>(detailKey(database, boardId), prev =>
          prev ? { ...prev, activeWhiteBoardContentId: pageId } : prev
        );
        client.setQueryData<WhiteboardItem[]>(listKey(database), prev =>
          prev?.map(item => (item.id === boardId ? { ...item, activePageId: pageId } : item))
        );
        await setActiveSubWhiteBoard(boardId, pageId);
      },

      /** 新建空白页并设为当前页，返回新页 id */
      async add(name: string): Promise<number> {
        const page = await addSubWhiteBoard(boardId, name, EMPTY_PAGE_DATA);
        setBoard(await setActiveSubWhiteBoard(boardId, page.id));
        return page.id;
      },

      async rename(pageId: number, name: string) {
        const page = await renameSubWhiteBoard(pageId, name);
        // 画布正在用的页缓存也要改名，否则下次保存会把旧名写回去
        client.setQueryData<WhiteBoardContent>(contentKey(database, pageId), prev =>
          prev ? { ...prev, name: page.name } : prev
        );
        await refetch();
      },

      /** 复制一页，返回副本 id（调用前先让画布 flush，副本才拿得到最新内容） */
      async duplicate(pageId: number): Promise<number> {
        const board = await duplicateSubWhiteBoard(boardId, pageId);
        setBoard(board);
        return board.activeWhiteBoardContentId ?? pageId;
      },

      async remove(pageId: number) {
        await deleteSubWhiteBoard(boardId, pageId);
        client.removeQueries({ queryKey: contentKey(database, pageId) });
        await refetch();
      },

      async reorder(orderedIds: number[]) {
        // 先乐观排好，页签不跳回原位
        client.setQueryData<WhiteBoard>(detailKey(database, boardId), prev => {
          if (!prev) return prev;
          const byId = new Map(prev.whiteBoardContentList.map(p => [p.id, p]));
          return {
            ...prev,
            whiteBoardContentIds: orderedIds,
            whiteBoardContentList: orderedIds.flatMap(id => byId.get(id) ?? []),
          };
        });
        setBoard(await reorderSubWhiteBoard(boardId, orderedIds));
      },
    };
  }, [client, database, boardId]);
}

/* ───────── 引用 ───────── */

/** 引用该白板的项目名称（删除确认用）；项目条目不在任何项目里时不计 */
export function useWhiteboardRefs(id: number | null) {
  const database = useSettingStore(state => state.setting.database.active);
  return useQuery({
    queryKey: ["whiteboards", "refs", database, id],
    enabled: id !== null && hasBridge,
    staleTime: 0,
    queryFn: async () => {
      if (id === null) return [];
      const items = await getProjectItemByRef("white-board", id);
      const projectIds = [...new Set(items.flatMap(item => item.projects ?? []))];
      const projects = await Promise.allSettled(projectIds.map(pid => getProjectById(pid)));
      return projects.flatMap(r => (r.status === "fulfilled" && r.value ? [r.value.title] : []));
    },
  });
}

/* ───────── 单页画布 ───────── */

export function useWhiteBoardContent(id: number) {
  const database = useSettingStore(state => state.setting.database.active);
  const queryClient = useQueryClient();
  const queryKey = contentKey(database, id);
  const query = useQuery({ queryKey, queryFn: () => getWhiteBoardContentById(id) });
  const save = useMutation({
    scope: { id: `whiteboard-content-${database}-${id}` },
    mutationFn: (content: Parameters<typeof updateWhiteBoardContent>[0]) => {
      if (useSettingStore.getState().setting.database.active !== database) {
        throw new Error("数据库已切换，取消旧白板写入");
      }
      return updateWhiteBoardContent(content);
    },
    onSuccess: content => {
      queryClient.setQueryData(queryKey, content);
      // 列表的元素数 / 更新时间随之变化
      void invalidateList(queryClient);
    },
    onError: () => toast.error("白板保存失败，请重试"),
  });
  return { ...query, save };
}
