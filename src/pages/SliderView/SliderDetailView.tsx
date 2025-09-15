import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useContext,
  createContext,
} from "react";
import type { SliderTemplate } from "@/types";
import { useParams } from "react-router-dom";
import useSliderStore from "@/stores/useSliderStore";
import { SLIDER_BASE_WIDTH, SLIDER_BASE_HEIGHT } from "@/constants";
import {
  getContentById,
  updateContent,
  createContent,
} from "@/commands/content";
import Editor, { EditorRef } from "@/components/Editor";
import { Descendant } from "slate";

const StageScaleContext = createContext(1);
const Stage = ({ children }: { children: React.ReactNode }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const resize = () => {
      const { clientWidth, clientHeight } = el;
      const s = Math.min(
        clientWidth / SLIDER_BASE_WIDTH,
        clientHeight / SLIDER_BASE_HEIGHT,
      );
      setScale(s);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <StageScaleContext.Provider value={scale}>
        <div
          style={{
            width: SLIDER_BASE_WIDTH,
            height: SLIDER_BASE_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
            background: "#fff",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            position: "relative",
          }}
        >
          {children}
        </div>
      </StageScaleContext.Provider>
    </div>
  );
};

const SliderDetailView = () => {
  const params = useParams();
  const deckId = useMemo(() => Number(params.id), [params.id]);
  const {
    getPagesByDeck,
    getEditorsByPage,
    pagesByDeck,
    blocksByPage,
    updateEditor,
    createPage,
    createEditor,
    initTemplateSets,
    templateSets,
    getTemplatesBySet,
    templatesBySet,
    createTemplate,
    deleteEditor,
  } = useSliderStore();
  const editorRef = useRef<EditorRef | null>(null);

  const pages = pagesByDeck.get(deckId) || [];
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null);
  const currentPageId = selectedPageId ?? pages[0]?.id;
  const blocks = currentPageId ? blocksByPage.get(currentPageId) || [] : [];
  const firstFlow = blocks.find((b) => b.kind === "flow-editor");
  const [initValue, setInitValue] = useState<Descendant[] | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const [blockPositions, setBlockPositions] = useState<
    Map<number, { x: number; y: number }>
  >(new Map());
  const [dragState, setDragState] = useState<{
    id: number;
    originX: number;
    originY: number;
    startMouseX: number;
    startMouseY: number;
  } | null>(null);
  const stageScale = useContext(StageScaleContext);

  useEffect(() => {
    if (!Number.isFinite(deckId)) return;
    getPagesByDeck(deckId);
  }, [deckId, getPagesByDeck]);

  useEffect(() => {
    if (!currentPageId) return;
    getEditorsByPage(currentPageId);
  }, [currentPageId, getEditorsByPage]);

  useEffect(() => {
    (async () => {
      if (!firstFlow) {
        setInitValue(null);
        return;
      }
      if (firstFlow.contentId) {
        const content = await getContentById(firstFlow.contentId);
        setInitValue(content?.content || []);
      } else {
        setInitValue([]);
      }
    })();
  }, [firstFlow?.id, firstFlow?.contentId, firstFlow]);

  // 模板集合与模板
  const [selectedSetId, setSelectedSetId] = useState<number | null>(null);
  const templates = selectedSetId
    ? templatesBySet.get(selectedSetId) || []
    : [];
  useEffect(() => {
    initTemplateSets();
  }, [initTemplateSets]);
  useEffect(() => {
    if (selectedSetId) getTemplatesBySet(selectedSetId);
  }, [selectedSetId, getTemplatesBySet]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "260px 1fr 300px",
        height: "100%",
      }}
    >
      <div
        style={{
          borderRight: "1px solid var(--color-border)",
          padding: 12,
          overflow: "auto",
        }}
      >
        <div
          style={{
            fontWeight: 600,
            marginBottom: 8,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Pages</span>
          <button
            onClick={async () => {
              if (!Number.isFinite(deckId)) return;
              const name = `页面 ${pages.length + 1}`;
              const page = await createPage({
                deckId: deckId,
                name,
                orderIndex: pages.length,
                background: {},
                templateId: null,
              });
              setSelectedPageId(page.id);
              await createEditor({
                pageId: page.id,
                kind: "flow-editor",
                contentId: null,
                geometry: null,
                style: null,
                orderIndex: 0,
              });
              await getEditorsByPage(page.id);
            }}
          >
            新建页面
          </button>
        </div>
        {(pages || []).map((p) => (
          <div
            key={p.id}
            onClick={() => setSelectedPageId(p.id)}
            style={{
              padding: 8,
              borderRadius: 6,
              cursor: "pointer",
              background: p.id === currentPageId ? "#f5f5f5" : "transparent",
            }}
          >
            {p.name}
          </div>
        ))}
      </div>
      <div>
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: 8,
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <button
            onClick={async () => {
              if (!currentPageId) return;
              await createEditor({
                pageId: currentPageId,
                kind: "flow-editor",
                contentId: null,
                geometry: null,
                style: null,
                orderIndex:
                  blocks.filter((b) => b.kind === "flow-editor").length || 0,
              });
              await getEditorsByPage(currentPageId);
            }}
          >
            新增文本块(流)
          </button>
          <button
            onClick={async () => {
              if (!currentPageId) return;
              await createEditor({
                pageId: currentPageId,
                kind: "absolute-editor",
                contentId: null,
                geometry: {
                  x: 100,
                  y: 100,
                  width: 400,
                  height: 200,
                  zIndex: 1,
                },
                style: null,
                orderIndex:
                  blocks.filter((b) => b.kind === "absolute-editor").length ||
                  0,
              });
              await getEditorsByPage(currentPageId);
            }}
          >
            新增文本块(绝对)
          </button>
        </div>
        <Stage>
          {firstFlow ? (
            initValue ? (
              <Editor
                ref={editorRef as any}
                readonly={false}
                initValue={initValue}
                onChange={async (v: Descendant[]) => {
                  if (!firstFlow) return;
                  if (saveTimerRef.current)
                    window.clearTimeout(saveTimerRef.current);
                  saveTimerRef.current = window.setTimeout(async () => {
                    if (firstFlow.contentId) {
                      await updateContent(firstFlow.contentId, v);
                    } else {
                      const id = await createContent(v, v.length);
                      if (id) {
                        await updateEditor({ id: firstFlow.id, contentId: id });
                        const pid = currentPageId;
                        if (!pid) return;
                        await getEditorsByPage(pid);
                      }
                    }
                  }, 500);
                }}
                disableStartExtensions={false}
              />
            ) : (
              <div style={{ padding: 24, color: "#999" }}>加载中...</div>
            )
          ) : (
            <div style={{ padding: 24, color: "#999" }}>暂无可编辑内容</div>
          )}

          {blocks
            .filter((b) => b.kind === "absolute-editor" && b.geometry)
            .map((b) => {
              const g = b.geometry!;
              const displayX = blockPositions.get(b.id)?.x ?? g.x;
              const displayY = blockPositions.get(b.id)?.y ?? g.y;
              return (
                <div
                  key={b.id}
                  style={{
                    position: "absolute",
                    left: displayX,
                    top: displayY,
                    width: g.width,
                    height: g.height,
                    background: "#fff",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                    border: "1px solid #eee",
                    overflow: "hidden",
                    cursor: "move",
                  }}
                  onMouseDown={(e) => {
                    setDragState({
                      id: b.id,
                      originX: displayX,
                      originY: displayY,
                      startMouseX: e.clientX,
                      startMouseY: e.clientY,
                    });
                  }}
                  onMouseMove={(e) => {
                    if (!dragState || dragState.id !== b.id) return;
                    const dx =
                      (e.clientX - dragState.startMouseX) / (stageScale || 1);
                    const dy =
                      (e.clientY - dragState.startMouseY) / (stageScale || 1);
                    const newX = dragState.originX + dx;
                    const newY = dragState.originY + dy;
                    setBlockPositions((prev) => {
                      const next = new Map(prev);
                      next.set(b.id, { x: newX, y: newY });
                      return next;
                    });
                  }}
                  onMouseUp={async () => {
                    if (!dragState || dragState.id !== b.id) return;
                    const pos = blockPositions.get(b.id) || { x: g.x, y: g.y };
                    await updateEditor({
                      id: b.id,
                      geometry: { ...g, x: pos.x, y: pos.y },
                    });
                    setDragState(null);
                  }}
                >
                  <Editor
                    readonly={false}
                    disableStartExtensions={false}
                    onChange={async (v: Descendant[]) => {
                      if (!b) return;
                      if (saveTimerRef.current)
                        window.clearTimeout(saveTimerRef.current);
                      saveTimerRef.current = window.setTimeout(async () => {
                        if (b.contentId) {
                          await updateContent(b.contentId, v);
                        } else {
                          const id = await createContent(v, v.length);
                          if (id)
                            await updateEditor({ id: b.id, contentId: id });
                        }
                      }, 500);
                    }}
                  />
                </div>
              );
            })}
        </Stage>
      </div>
      <div
        style={{
          borderLeft: "1px solid var(--color-border)",
          padding: 12,
          overflow: "auto",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 8 }}>模板</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <select
            value={selectedSetId ?? ""}
            onChange={(e) =>
              setSelectedSetId(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">选择模板集合</option>
            {templateSets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            onClick={async () => {
              if (!selectedSetId || !currentPageId) return;
              const key = window.prompt("模板 key（集合内唯一）") || "";
              const name = window.prompt("模板名称") || "模板";
              if (!key) return;
              // 组装当前页数据
              const pageData = pages.find((p) => p.id === currentPageId);
              if (!pageData) return;
              const blocksData = blocks.map((b) => ({
                id: b.id,
                kind: b.kind,
                style: b.style,
                orderIndex: b.orderIndex,
                geometry: b.geometry,
                contentId: b.contentId,
              }));
              // 拉取文本内容
              const defaultBlocks: any[] = [];
              for (const b of blocksData) {
                let initialContent: any = undefined;
                if (b.contentId) {
                  const c = await getContentById(b.contentId);
                  initialContent = c?.content || [];
                }
                defaultBlocks.push({
                  kind: b.kind,
                  style: b.style,
                  orderIndex: b.orderIndex,
                  geometry: b.geometry,
                  initialContent,
                });
              }
              await createTemplate({
                setId: selectedSetId,
                key,
                name,
                category: "custom",
                defaultPage: pageData.background || {},
                defaultBlocks,
                preview: "",
              });
              await getTemplatesBySet(selectedSetId);
              alert("模板已保存");
            }}
          >
            保存当前页为模板
          </button>
        </div>

        {selectedSetId && (
          <div style={{ display: "grid", gap: 8 }}>
            {(templates || []).map((t) => (
              <div
                key={t.id}
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  padding: 8,
                }}
              >
                <div style={{ fontWeight: 600 }}>{t.name}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <button
                    onClick={async () => {
                      // 新建页并应用模板
                      if (!Number.isFinite(deckId)) return;
                      const name = `${t.name}-${(pages?.length || 0) + 1}`;
                      const page = await createPage({
                        deckId: deckId,
                        name,
                        orderIndex: pages.length,
                        background: t.defaultPage || {},
                        templateId: t.id,
                      });
                      // 物化 blocks
                      let idx = 0;
                      for (const b of t.defaultBlocks) {
                        let contentId: number | null = null;
                        if (b.initialContent) {
                          const id = await createContent(
                            b.initialContent as any,
                            (b.initialContent as any[]).length || 0,
                          );
                          contentId = id || null;
                        }
                        await createEditor({
                          pageId: page.id,
                          kind: b.kind as any,
                          contentId,
                          geometry: (b as any).geometry ?? null,
                          style: (b as any).style ?? null,
                          orderIndex: idx++,
                        });
                      }
                      await getEditorsByPage(page.id);
                      alert("已用模板创建新页面");
                    }}
                  >
                    用模板新建页
                  </button>
                  <button
                    onClick={async () => {
                      // 覆盖当前页：先删除现有块，再物化模板
                      if (!currentPageId) return;
                      const existing = blocksByPage.get(currentPageId) || [];
                      for (const eb of existing) {
                        await deleteEditor(eb.id);
                      }
                      let idx = 0;
                      for (const b of t.defaultBlocks) {
                        let contentId: number | null = null;
                        if (b.initialContent) {
                          const id = await createContent(
                            b.initialContent as any,
                            (b.initialContent as any[]).length || 0,
                          );
                          contentId = id || null;
                        }
                        await createEditor({
                          pageId: currentPageId,
                          kind: b.kind as any,
                          contentId,
                          geometry: (b as any).geometry ?? null,
                          style: (b as any).style ?? null,
                          orderIndex: idx++,
                        });
                      }
                      await getEditorsByPage(currentPageId);
                      alert("已覆盖当前页");
                    }}
                  >
                    覆盖当前页
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SliderDetailView;
