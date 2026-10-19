import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  HashRouter,
  Link,
  Outlet,
  Route,
  Routes,
  useParams,
} from "react-router-dom";
import type {
  ContentNode,
  ContentRef,
  DataClient,
  DataManifest,
  DataResult,
  ManifestItem,
  SearchHit,
} from "../protocol/contracts";
import { createDirectClient } from "./direct-client";
import { loadTemplateContent, type TemplatePlugin } from "./plugins";
import { sharedModules } from "./modules";
import markUrl from "./mark.svg";
import "./style.css";

const mode = __TEMPLATE_MODE__;
const Context = createContext<{ client: DataClient; manifest: DataManifest } | null>(null);
const useData = () => {
  const value = useContext(Context);
  if (!value) throw new Error("模板缺少数据来源");
  return value;
};

function routeFor(item: ManifestItem): string {
  if (mode === "hash") return `/entry/${encodeURIComponent(item.key)}`;
  switch (item.type) {
    case "home":
      return "/";
    case "article":
      return `/journal/${item.id}`;
    case "card":
      return `/snippets/${item.id}`;
    case "doc":
      return `/work/${item.projectId}/items/${item.id}`;
    case "quest":
      return `/questions/${item.id}`;
    case "list":
      return `/collection/${encodeURIComponent(item.key)}`;
  }
}

function ItemLink({
  target,
  children,
  ...props
}: {
  target: ContentRef;
  children: ReactNode;
  "data-testid"?: string;
  "data-key"?: string;
}) {
  const { manifest } = useData();
  const item = manifest.items.find(item => item.key === target.key);
  return item ? (
    <Link to={routeFor(item)} {...props}>
      {children}
    </Link>
  ) : (
    <span>{children}</span>
  );
}

function Shell() {
  const { client, manifest } = useData();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function search() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError("");
    try {
      const result = await client.search(query, { signal: controller.signal });
      if (!controller.signal.aborted) setHits(result);
    } catch (error) {
      if (!controller.signal.aborted) setError(String(error));
    }
  }
  return (
    <>
      <header>
        <img src={markUrl} alt="实验标记" />
        <div>
          <h1>{manifest.site.title}</h1>
          <p>
            模板 {mode} · {mode === "path" ? "数据工具 + 自有正文/预览" : "直接 fetch + 摘要展示"}
          </p>
        </div>
      </header>
      <main>
        <nav>
          {manifest.items.map(item => (
            <ItemLink key={item.key} target={item} data-testid="nav-item" data-key={item.key}>
              {item.title}
            </ItemLink>
          ))}
        </nav>
        <form
          onSubmit={event => {
            event.preventDefault();
            void search();
          }}
        >
          <input
            aria-label="搜索"
            data-testid="search-input"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
          <button type="submit" data-testid="search-submit">
            搜索
          </button>
        </form>
        {error && <p role="alert">{error}</p>}
        <ul data-testid="search-results">
          {hits.map(hit => (
            <li key={hit.key}>
              <ItemLink target={hit} data-key={hit.key}>
                {hit.title}
              </ItemLink>
            </li>
          ))}
        </ul>
        <Outlet />
      </main>
    </>
  );
}

interface ContentState {
  loading: boolean;
  item?: DataResult;
  definitions: TemplatePlugin[];
  error?: string;
}

function useContent(entry: ManifestItem): ContentState {
  const { client } = useData();
  const [state, setState] = useState<ContentState>({ loading: true, definitions: [] });
  useEffect(() => {
    const controller = new AbortController();
    let release = () => {};
    setState({ loading: true, definitions: [] });
    void (async () => {
      const item = await client.readData({ key: entry.key, signal: controller.signal });
      const loaded =
        mode === "path"
          ? await loadTemplateContent(item, sharedModules, controller.signal)
          : { definitions: [], dispose: () => {} };
      release = loaded.dispose;
      if (controller.signal.aborted) {
        release();
        return;
      }
      setState({ loading: false, item, definitions: loaded.definitions });
    })().catch(error => {
      release();
      if (!controller.signal.aborted)
        setState({ loading: false, definitions: [], error: String(error) });
    });
    return () => {
      controller.abort();
      release();
    };
  }, [client, entry.key]);
  return state;
}

function Nodes({
  nodes,
  item,
  definitions,
  onPreview,
}: {
  nodes: ContentNode[];
  item: DataResult;
  definitions: TemplatePlugin[];
  onPreview?: (target: ContentRef) => void;
}) {
  return (
    <>
      {nodes.map((node, index) => {
        const children = node.children ? (
          <Nodes
            nodes={node.children}
            item={item}
            definitions={definitions}
            onPreview={onPreview}
          />
        ) : null;
        if (node.type === "formatted") return <span key={index}>{node.text}</span>;
        if (node.type === "paragraph") return <p key={index}>{children}</p>;
        if (node.type === "html-block")
          return <div key={index} dangerouslySetInnerHTML={{ __html: node.html ?? "" }} />;
        if (node.type === "content-link") {
          const target = item.data.contentLinkTargets?.[`${node.contentType}:${node.refId}`];
          return (
            <span key={index}>
              {target ? <ItemLink target={target}>{children}</ItemLink> : children}
              {target && onPreview && (
                <button data-preview-key={target.key} onClick={() => onPreview(target)}>
                  预览
                </button>
              )}
            </span>
          );
        }
        const contribution = definitions
          .flatMap(definition =>
            definition.editorExtensions.flatMap(extension => extension.elements)
          )
          .find(element => element.type === node.type);
        if (!contribution) throw new Error(`这个模板没有实现节点 ${node.type}`);
        return createElement(contribution.render, {
          key: index,
          attributes: {},
          element: node,
          children,
        });
      })}
    </>
  );
}

function ContentBody({
  state,
  onPreview,
}: {
  state: ContentState;
  onPreview?: (target: ContentRef) => void;
}) {
  if (!state.item) return null;
  const { content } = state.item.data;
  if (mode === "hash")
    return (
      <p data-testid="summary-only">这个模板只消费数据并展示摘要，不加载内容插件、不提供预览。</p>
    );
  return (
    <div data-testid="body">
      <Nodes
        nodes={content.content ?? content.description ?? []}
        item={state.item}
        definitions={state.definitions}
        onPreview={onPreview}
      />
      {content.answers?.map((answer, index) => (
        <section key={index}>
          <Nodes
            nodes={answer.content}
            item={state.item!}
            definitions={state.definitions}
            onPreview={onPreview}
          />
        </section>
      ))}
      {(content.items ?? content.timeline ?? content.materials ?? []).map(target => (
        <p key={target.key}>
          <ItemLink target={target}>{target.key}</ItemLink>
        </p>
      ))}
      {content.tree?.map(node => (
        <p key={node.target.key}>
          <ItemLink target={node.target}>{node.title}</ItemLink>
        </p>
      ))}
    </div>
  );
}

function Preview({ entry, close }: { entry: ManifestItem; close: () => void }) {
  const state = useContent(entry);
  useEffect(() => {
    if (state.item && window.__spike) window.__spike.previewKey = state.item.data.key;
    return () => {
      if (window.__spike) delete window.__spike.previewKey;
    };
  }, [state.item]);
  return (
    <aside role="dialog" aria-label="模板自行实现的预览" data-testid="preview" data-key={entry.key}>
      <button onClick={close} data-testid="close-preview">
        关闭预览
      </button>
      {state.loading ? (
        <p>预览加载中</p>
      ) : state.error ? (
        <p role="alert">{state.error}</p>
      ) : (
        <>
          <h2>{state.item?.data.content.title}</h2>
          <ContentBody state={state} />
        </>
      )}
    </aside>
  );
}

function DataPage({ entry }: { entry: ManifestItem }) {
  const { manifest } = useData();
  const state = useContent(entry);
  const [preview, setPreview] = useState<ManifestItem | null>(null);
  useEffect(() => {
    if (!window.__spike) return;
    window.__spike.pendingKey = state.loading ? entry.key : undefined;
    if (state.item) {
      window.__spike.activeKey = state.item.data.key;
      window.__spike.ready = true;
      document.title = state.item.data.content.title;
    }
    window.__spike.error = state.error;
  }, [state, entry.key]);
  return (
    <section data-testid="page" data-key={entry.key} data-loading={state.loading}>
      {state.loading ? (
        <p>模板加载中</p>
      ) : state.error ? (
        <p role="alert" data-testid="page-error">
          {state.error}
        </p>
      ) : (
        <>
          <h2 data-testid="content-title">{state.item?.data.content.title}</h2>
          <ContentBody
            state={state}
            onPreview={target =>
              setPreview(manifest.items.find(item => item.key === target.key) ?? null)
            }
          />
        </>
      )}
      {preview && <Preview entry={preview} close={() => setPreview(null)} />}
    </section>
  );
}

function KeyPage({ home = false }: { home?: boolean }) {
  const { manifest } = useData();
  const params = useParams();
  const key = home ? "home" : params.key;
  const entry = manifest.items.find(item => item.key === key);
  return entry ? (
    <DataPage key={entry.key} entry={entry} />
  ) : (
    <p data-testid="not-found">模板没有这个内容</p>
  );
}

function EntityPage({ kind }: { kind: ManifestItem["type"] }) {
  const { manifest } = useData();
  const params = useParams();
  const entry = manifest.items.find(
    item =>
      item.type === kind &&
      String(item.id) === params.id &&
      (kind !== "doc" || String(item.projectId) === params.projectId)
  );
  return entry ? (
    <DataPage key={entry.key} entry={entry} />
  ) : (
    <p data-testid="not-found">模板没有这个内容</p>
  );
}

async function bootstrap() {
  const declared = (name: string) => {
    const value = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content;
    if (!value) throw new Error(`模板缺少 ${name}`);
    return value;
  };
  const manifestUrl = new URL(declared("tau-manifest"), location.origin).href;
  const client: DataClient =
    mode === "hash"
      ? createDirectClient(manifestUrl)
      : (
          await import(/* @vite-ignore */ new URL(declared("tau-client"), location.origin).href)
        ).createClient({ manifestUrl });
  const manifest = await client.readManifest();
  const Router = mode === "path" ? BrowserRouter : HashRouter;
  const basename =
    mode === "path" ? declared("template-base").replace(/\/$/, "") || "/" : undefined;
  window.__spike = { mode, ready: false };
  createRoot(document.getElementById("root")!).render(
    <Context.Provider value={{ client, manifest }}>
      <Router basename={basename}>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<KeyPage home />} />
            {mode === "path" ? (
              <>
                <Route path="journal/:id" element={<EntityPage kind="article" />} />
                <Route path="snippets/:id" element={<EntityPage kind="card" />} />
                <Route path="work/:projectId/items/:id" element={<EntityPage kind="doc" />} />
                <Route path="questions/:id" element={<EntityPage kind="quest" />} />
                <Route path="collection/:key" element={<KeyPage />} />
              </>
            ) : (
              <Route path="entry/:key" element={<KeyPage />} />
            )}
            <Route path="*" element={<p data-testid="not-found">模板路由未命中</p>} />
          </Route>
        </Routes>
      </Router>
    </Context.Provider>
  );
}

void bootstrap().catch(error => {
  window.__spike = { mode, ready: false, error: String(error) };
  const root = document.getElementById("root");
  if (root) {
    root.setAttribute("role", "alert");
    root.textContent = String(error);
  }
});
