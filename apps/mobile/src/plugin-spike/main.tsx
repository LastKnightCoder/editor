import {
  Component,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { Editor, type EditorRef } from "@tau/editor";
import { Editor as SlateEditor, Transforms, type Descendant } from "slate";
import { HistoryEditor } from "slate-history";
import {
  PluginEnvironmentProvider,
  snapshotPluginEnvironment,
} from "@tau/plugins/environment-host";
import type { PluginPageContext } from "@tau/plugins";
import { normalizePageParams } from "@tau/plugins/host";
import { createPluginMarkdownProcessor } from "@tau/plugins/content";
import { configureSpikeSourceEditor } from "./source-editor";
import {
  SpikeRuntime,
  downloadArtifacts,
  verifyArtifacts,
  PACKAGE_KEY,
  DOCUMENT_KEY,
} from "./runtime";
import { getMobileContentKit } from "../services/editorKit";
import { mobileCodecComposition } from "../services/editorMarkdown";
import { initThemeRuntime } from "../theme/themeStore";
import {
  definePage,
  paramString,
  PageHost,
  RouterProvider,
  PageQueryProvider,
  useNavigator,
  usePage,
  usePageInstanceContext,
} from "../router";
import { runSpikeChecks } from "./verification";
import "../styles.css";

const RuntimeContext = createContext<SpikeRuntime | null>(null);
function useRuntime() {
  const value = useContext(RuntimeContext);
  if (!value) throw new Error("验证宿主未就绪");
  return value;
}
const INITIAL: Descendant[] = [{ type: "paragraph", children: [{ type: "formatted", text: "" }] }];
let autoStarted = false;

export const driver: {
  runtime?: SpikeRuntime;
  editor?: SlateEditor;
  markdown?: ReturnType<typeof createPluginMarkdownProcessor>;
} = {};

function PluginPage() {
  const runtime = useRuntime();
  const { params, navigator, entryId } = usePage<{ id: string; params: string }>();
  const instance = usePageInstanceContext();
  const page = runtime.pages.get(params.id);
  const active = useRef(false);
  active.current = instance.phase === "active";
  const pageContext = useMemo<PluginPageContext>(
    () => ({
      register: provider => {
        if (runtime.pageStateProviders.has(entryId)) throw new Error("页面状态提供器重复注册");
        runtime.pageStateProviders.set(entryId, provider);
        return {
          dispose: () => {
            if (runtime.pageStateProviders.get(entryId) === provider)
              runtime.pageStateProviders.delete(entryId);
          },
        };
      },
      isActive: () =>
        active.current && !page?.context.signal.aborted && document.visibilityState !== "hidden",
      registerDismiss: dismiss => {
        const unregister = navigator.registerBackHandler(entryId, () => {
          dismiss();
          return true;
        });
        return { dispose: unregister };
      },
    }),
    [runtime, navigator, entryId, page]
  );
  useEffect(
    () => () => {
      active.current = false;
      runtime.pageStateProviders.delete(entryId);
    },
    [runtime, entryId]
  );
  if (!page || page.context.signal.aborted) return <p>插件页面不可用</p>;
  const Page = page.definition.component;
  return (
    <div className="bg-page min-h-full" data-spike-page>
      <button className="p-3" data-spike-back onClick={() => void navigator.goBack("ui")}>
        返回
      </button>
      <Page
        context={page.context}
        params={normalizePageParams(JSON.parse(params.params))}
        pageContext={pageContext}
      />
    </div>
  );
}

function EditorPage() {
  const runtime = useRuntime();
  const navigator = useNavigator();
  const reference = useRef<EditorRef>(null);
  const [ready, setReady] = useState(false);
  const [menu, setMenu] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [saved, setSaved] = useState(false);
  const kit = useMemo(
    () => getMobileContentKit().extend({ extensions: runtime.content.extensions }),
    [runtime]
  );
  const markdown = useMemo(
    () => createPluginMarkdownProcessor({ codecs: mobileCodecComposition }, runtime.content),
    [runtime]
  );
  const [initial] = useState<Descendant[]>(() => {
    const stored = localStorage.getItem(DOCUMENT_KEY);
    return stored ? JSON.parse(stored) : INITIAL;
  });
  const mobile = runtime.environment.platform !== "desktop";
  useEffect(() => {
    driver.markdown = markdown;
    return () => {
      driver.editor = undefined;
    };
  }, [markdown]);
  const insertItems = ready
    ? kit.assembly
        .getBlockPanelItems(reference.current!.getEditor())
        .filter(item => item.keywords.includes("abc"))
    : [];
  return (
    <main className="bg-page min-h-full space-y-3 p-4" data-spike-editor>
      <button className="p-2" onClick={() => void navigator.goBack("ui")}>
        返回
      </button>
      <h1 className="text-tau-title">ABC 编辑器验证</h1>
      <div className="flex flex-wrap gap-3" contentEditable={false}>
        <button
          data-spike-insert-menu
          className="bg-accent-soft rounded-tau-md p-3"
          disabled={!ready || readOnly}
          onClick={() => setMenu(value => !value)}
        >
          {mobile ? "插入扩展" : "扩展菜单"}
        </button>
        <button
          data-spike-undo
          onClick={() => {
            const editor = reference.current?.getEditor();
            if (editor) HistoryEditor.undo(editor);
          }}
        >
          撤销
        </button>
        <button
          data-spike-redo
          onClick={() => {
            const editor = reference.current?.getEditor();
            if (editor) HistoryEditor.redo(editor);
          }}
        >
          重做
        </button>
        <button data-spike-readonly onClick={() => setReadOnly(value => !value)}>
          {readOnly ? "恢复编辑" : "只读预览"}
        </button>
        <output data-spike-saved>{saved ? "已保存" : "就绪"}</output>
      </div>
      {menu && !readOnly && (
        <div
          data-spike-insert-placement={mobile ? "touch-actions" : "toolbar-menu"}
          className="bg-surface p-3"
        >
          {insertItems.map(item => (
            <button
              key={item.title}
              data-spike-insert-abc
              className="p-3"
              onClick={() => {
                const editor = reference.current!.getEditor();
                if (!editor.selection) Transforms.select(editor, SlateEditor.end(editor, []));
                Transforms.collapse(editor, { edge: "end" });
                item.onClick?.(editor);
                setMenu(false);
              }}
            >
              {item.title}
            </button>
          ))}
        </div>
      )}
      <Editor
        ref={reference}
        kit={kit}
        initValue={initial}
        readonly={readOnly}
        onInit={editor => {
          driver.editor = editor;
          setReady(true);
        }}
        onChange={value => {
          localStorage.setItem(DOCUMENT_KEY, JSON.stringify(value));
          setSaved(true);
        }}
      />
    </main>
  );
}

definePage({ key: "spike-home", params: {}, component: () => null });
definePage({
  key: "spike-plugin-page",
  match: "params",
  getId: params => JSON.stringify([params.id, params.instanceId]),
  params: { id: paramString(), instanceId: paramString(), params: paramString() },
  component: PluginPage,
});
definePage({ key: "spike-editor", params: {}, component: EditorPage });

function EntryList() {
  const runtime = useRuntime();
  return (
    <>
      {[...runtime.entries.entries()].map(([id, entry]) => (
        <button
          key={id}
          className="bg-surface rounded-tau-md p-4"
          data-spike-entry={id}
          onClick={() => void entry.page.open(entry.params)}
        >
          {entry.title}
        </button>
      ))}
    </>
  );
}

function Home() {
  const runtime = useRuntime();
  const navigator = useNavigator();
  const [report, setReport] = useState("");
  const [running, setRunning] = useState(false);
  const run = async () => {
    setRunning(true);
    try {
      const result = await runSpikeChecks(driver);
      setReport(JSON.stringify(result, null, 2));
    } catch (error) {
      setReport(String(error));
    } finally {
      setRunning(false);
    }
  };
  useEffect(() => {
    if (
      !autoStarted &&
      (new URLSearchParams(location.search).has("autotest") ||
        import.meta.env.VITE_SPIKE_AUTOTEST === "1")
    ) {
      autoStarted = true;
      void run();
    }
  }, []);
  return (
    <main className="space-y-4 p-4" data-spike-home>
      <h1 className="text-tau-title">跨端插件验证</h1>
      {runtime.environment.platform !== "desktop" && (
        <section data-entry-placement="my-tools" className="space-y-3">
          <h2>我的 · 插件功能</h2>
          <EntryList />
        </section>
      )}
      <button
        data-spike-open-editor
        className="bg-accent-soft rounded-tau-md p-3"
        onClick={() => navigator.push("spike-editor")}
      >
        打开 ABC 文档
      </button>
      <button
        className="bg-surface rounded-tau-md p-3"
        disabled={running}
        onClick={() => void run()}
      >
        运行行为验证
      </button>
      <p>本地可信样本，独立验证工作区。外观与触摸手感由用户验收。</p>
      <pre className="text-tau-caption whitespace-pre-wrap" data-spike-report>
        {report}
      </pre>
    </main>
  );
}

function Shell() {
  const runtime = useRuntime();
  const navigator = useNavigator();
  runtime.navigator = navigator;
  const desktop = runtime.environment.platform === "desktop";
  return (
    <div className="bg-page text-ink-1 flex h-dvh overflow-hidden pt-[env(safe-area-inset-top)]">
      {desktop && (
        <aside data-entry-placement="sidebar" className="bg-surface w-60 shrink-0 space-y-4 p-4">
          <h2>插件</h2>
          <EntryList />
        </aside>
      )}
      <div className="relative min-w-0 flex-1">
        <PageHost rootContent={<Home />} />
      </div>
    </div>
  );
}

class Boundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) {
    return { error: error.stack ?? error.message };
  }
  render() {
    return this.state.error ? <pre role="alert">{this.state.error}</pre> : this.props.children;
  }
}

async function start() {
  if (
    new URLSearchParams(location.search).has("autotest") ||
    import.meta.env.VITE_SPIKE_AUTOTEST === "1"
  ) {
    // 自动验证每轮从同一个根页开始，数据恢复单独通过持久化断言验证。
    history.replaceState(null, "", location.href);
  }
  initThemeRuntime();
  configureSpikeSourceEditor();
  const platform = /Android/i.test(navigator.userAgent)
    ? "android"
    : /iPhone|iPad|iPod/i.test(navigator.userAgent)
      ? "ios"
      : "desktop";
  const environment = snapshotPluginEnvironment({
    platform,
    layout: innerWidth < 700 ? "compact" : "wide",
    input: {
      touch: navigator.maxTouchPoints > 0,
      finePointer: matchMedia("(pointer:fine)").matches,
    },
    capabilities: [
      "pages",
      "navigation",
      "storage",
      "editor.elements",
      "editor.codecs",
      "editor.source",
    ],
  });
  const stored = localStorage.getItem(PACKAGE_KEY);
  const artifacts = stored ? await verifyArtifacts(JSON.parse(stored)) : await downloadArtifacts();
  const runtime = new SpikeRuntime(environment);
  await runtime.start(artifacts);
  driver.runtime = runtime;
  document.documentElement.dataset.spikePlatform = platform;
  createRoot(document.getElementById("root")!).render(
    <Boundary>
      <PluginEnvironmentProvider value={runtime.environment}>
        <RuntimeContext.Provider value={runtime}>
          <PageQueryProvider>
            <RouterProvider rootKey="spike-home">
              <Shell />
            </RouterProvider>
          </PageQueryProvider>
        </RuntimeContext.Provider>
      </PluginEnvironmentProvider>
    </Boundary>
  );
}

void start().catch(error => {
  document.getElementById("root")!.textContent = `启动失败：${String(error)}`;
  void fetch("http://127.0.0.1:2420/__plugin-spike__/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      platform: /Android/i.test(navigator.userAgent)
        ? "android"
        : /iPhone/i.test(navigator.userAgent)
          ? "ios"
          : "desktop",
      status: "failed",
      error: String(error),
      userAgent: navigator.userAgent,
    }),
  });
});
