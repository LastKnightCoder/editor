/* eslint-disable react-refresh/only-export-components -- 插件入口默认导出插件定义。 */
import type { ReactNode } from "react";
import { BookOpen } from "lucide-react";
import { definePlugin, SIDEBAR_GROUPS, type PluginPageProps } from "@tau/plugins";
import { toast } from "@tau/ui";
import "./styles.css";
import { RuntimeProvider, type WeReadPages } from "./hooks";
import { WeReadRuntime } from "./runtime";
import { WeReadView } from "./ui/WeReadView";
import { WeReadBookView } from "./ui/WeReadBookView";
import { WeReadSettings } from "./ui/WeReadSettings";

declare const __PLUGIN_META__: { id: string; name: string; version: string };

export default definePlugin({
  ...__PLUGIN_META__,
  create: () => ({
    activate(context) {
      const runtime = new WeReadRuntime(context);
      // 页面句柄在注册后才有，组件渲染时读取
      const pages = {} as WeReadPages;
      const wrap = (children: ReactNode) => (
        <RuntimeProvider runtime={runtime} pages={pages}>
          {children}
        </RuntimeProvider>
      );

      const settings = context.settings.register({
        id: "connection",
        title: "账号与连接",
        description: "微信读书 API Key",
        component: () => wrap(<WeReadSettings />),
      });
      const openSettings = () => void settings.open();
      pages.shelf = context.pages.register({
        id: "shelf",
        title: "微信读书",
        component: () => wrap(<WeReadView onSettings={openSettings} />),
      });
      pages.book = context.pages.register({
        id: "book",
        title: "微信读书",
        match: "params",
        getId: params => String(params.bookId),
        component: ({ params }: PluginPageProps) =>
          wrap(
            <WeReadBookView
              bookId={String(params.bookId)}
              bookmark={typeof params.bookmark === "string" ? params.bookmark : undefined}
            />
          ),
      });
      context.sidebar.registerItem({
        id: "shelf",
        title: "微信读书",
        icon: BookOpen,
        group: SIDEBAR_GROUPS.learning,
        page: pages.shelf,
      });
      // externalId = bookId:bookmarkId 或 bookId:review:reviewId；单书页以 bookmarkId / reviewId 标识每条
      context.excerpts.register({
        label: "微信读书",
        open: ({ sourceKey, externalId }) => {
          const bookmark = externalId.slice(sourceKey.length + 1).replace(/^review:/, "");
          return pages.book.open({ bookId: sourceKey, ...(bookmark ? { bookmark } : {}) });
        },
      });
      context.commands.register({
        id: "open",
        title: "打开微信读书",
        run: async () => {
          await pages.shelf.open();
          return null;
        },
      });
      context.commands.register({
        id: "sync",
        title: "同步微信读书书架",
        run: async () => {
          const outcome = await runtime.sync();
          if (!outcome) toast.error("请先连接微信读书");
          else toast.success(`同步完成，共 ${outcome.total} 本书`);
          return null;
        },
      });
      // 读取存储与校验不阻塞激活
      void runtime.load().catch(error => {
        if (!context.signal.aborted) console.error("[weread] 初始化失败", error);
      });
    },
  }),
});
