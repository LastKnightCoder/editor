// 开发模式路由面板：可视化 screen/overlay 栈与 query 缓存状态。
// 仅在 import.meta.env.DEV 下渲染（AppShell 挂载），生产构建零引入。

import { useState } from "react";
import { Z_INDEX } from "../zIndex";
import { useQueryClient } from "@tanstack/react-query";
import { useRouterContext } from "../RouterProvider";
import { useNavigator } from "../hooks";

export function RouterDevTools() {
  const { state, rootKey } = useRouterContext();
  const navigator = useNavigator();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const screens = state.screens.entries;
  const overlays = state.overlays.entries;
  const queries = queryClient.getQueryCache().getAll();
  const staleCount = queries.filter(query => query.isStale()).length;

  return (
    <div
      style={{
        position: "fixed",
        right: 8,
        bottom: 96,
        zIndex: Z_INDEX.DEVTOOLS,
        fontFamily: "monospace",
        fontSize: 11,
        maxWidth: 260,
      }}
    >
      {open ? (
        <div
          style={{
            background: "rgba(17,24,39,0.92)",
            color: "#e5e7eb",
            borderRadius: 10,
            padding: 10,
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            maxHeight: "50vh",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <strong>router</strong>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ color: "#9ca3af", background: "none", border: "none" }}
            >
              close
            </button>
          </div>
          <div style={{ marginBottom: 4, color: "#9ca3af" }}>screens</div>
          {screens.map((entry, index) => (
            <div key={entry.id}>
              {index === screens.length - 1 ? "▶ " : "  "}
              {entry.key}
              {entry.key === rootKey ? " (root)" : ""}
              <span style={{ color: "#6b7280" }}> {JSON.stringify(entry.params).slice(0, 40)}</span>
            </div>
          ))}
          {overlays.length > 0 && (
            <div style={{ marginTop: 6, marginBottom: 4, color: "#9ca3af" }}>overlays</div>
          )}
          {overlays.map(entry => (
            <div key={entry.id}>
              ◈ {entry.key}
              <span style={{ color: "#6b7280" }}> {JSON.stringify(entry.params).slice(0, 40)}</span>
            </div>
          ))}
          <div style={{ marginTop: 6, color: "#9ca3af" }}>
            queries: {queries.length} (stale {staleCount})
          </div>
          <button
            type="button"
            onClick={() => navigator.push("editorLab")}
            style={{
              marginTop: 8,
              color: "#e5e7eb",
              background: "rgba(255,255,255,0.12)",
              border: "none",
              borderRadius: 6,
              padding: "4px 8px",
            }}
          >
            editor lab
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            background: "rgba(17,24,39,0.75)",
            color: "#e5e7eb",
            border: "none",
            borderRadius: 999,
            padding: "6px 10px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          }}
        >
          ⌗ {screens.length + overlays.length}
        </button>
      )}
    </div>
  );
}

export default RouterDevTools;
