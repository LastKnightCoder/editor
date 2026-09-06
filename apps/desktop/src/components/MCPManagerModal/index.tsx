import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { MdClose, MdEdit, MdDelete, MdAdd, MdRefresh } from "react-icons/md";
import { App } from "antd";
import useMCPStore, {
  CustomMCPServer,
  TransportConfig,
  ConnectionStatus,
} from "@/stores/useMCPStore";
import { MCP_PROVIDERS } from "@/mcp/providers";
import {
  connectToServer,
  disconnectFromServer,
  reconnectToServer,
  onConnectionStatusChange,
} from "@/tools/customMCP";
import "./index.css";

interface MCPManagerModalProps {
  open: boolean;
  onClose: () => void;
}

type TransportType = "stdio" | "streamable-http";
type TabType = "builtin" | "custom";

// Toggle Switch 组件
const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}> = ({ checked, onChange, disabled = false }) => {
  return (
    <div className="relative">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        disabled={disabled}
        className="peer sr-only"
      />
      <div
        onClick={() => !disabled && onChange(!checked)}
        className={`h-6 w-11 cursor-pointer rounded-full transition-all duration-200 ease-in-out ${checked ? "bg-indigo-500" : "bg-gray-200 dark:bg-zinc-700"} ${disabled ? "cursor-not-allowed opacity-50" : "hover:shadow-md"} `}
      >
        <div
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out ${checked ? "translate-x-5" : "translate-x-0"} `}
        />
      </div>
    </div>
  );
};

// 连接状态标签
const ConnectionStatusBadge: React.FC<{
  status?: ConnectionStatus;
  error?: string;
}> = ({ status, error }) => {
  const getStatusConfig = () => {
    switch (status) {
      case "connected":
        return {
          text: "已连接",
          className: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400",
        };
      case "connecting":
        return {
          text: "连接中",
          className: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400",
        };
      case "error":
        return {
          text: "错误",
          className: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",
        };
      default:
        return {
          text: "未连接",
          className: "bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-slate-400",
        };
    }
  };

  const config = getStatusConfig();

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}
      title={error}
    >
      {config.text}
    </span>
  );
};

// 传输类型标签
const TransportTypeBadge: React.FC<{ type: "stdio" | "streamable-http" }> = ({ type }) => {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-zinc-800 dark:text-slate-400">
      {type === "stdio" ? "stdio" : "http"}
    </span>
  );
};

const MCPManagerModal: React.FC<MCPManagerModalProps> = ({ open, onClose }) => {
  const { modal } = App.useApp();
  const providerStates = useMCPStore(state => state.providerStates);
  const customServers = useMCPStore(state => state.customServers);
  const connectionStatus = useMCPStore(state => state.connectionStatus);
  const connectionErrors = useMCPStore(state => state.connectionErrors);
  const setProviderEnabled = useMCPStore(state => state.setProviderEnabled);
  const addCustomServer = useMCPStore(state => state.addCustomServer);
  const updateCustomServer = useMCPStore(state => state.updateCustomServer);
  const removeCustomServer = useMCPStore(state => state.removeCustomServer);
  const setCustomServerEnabled = useMCPStore(state => state.setCustomServerEnabled);
  const setConnectionStatus = useMCPStore(state => state.setConnectionStatus);

  const [activeTab, setActiveTab] = useState<TabType>("builtin");
  const [transportType, setTransportType] = useState<TransportType>("stdio");
  const [editingServer, setEditingServer] = useState<CustomMCPServer | null>(null);

  // 表单状态
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCommand, setFormCommand] = useState("");
  const [formArgs, setFormArgs] = useState("");
  const [formEnv, setFormEnv] = useState("");
  const [formCwd, setFormCwd] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formHeaders, setFormHeaders] = useState("");
  const [showJsonImport, setShowJsonImport] = useState(true); // 默认显示导入配置
  const [jsonConfig, setJsonConfig] = useState("");

  // 监听来自主进程的连接状态变化
  useEffect(() => {
    const unsubscribe = onConnectionStatusChange(data => {
      setConnectionStatus(data.serverId, data.status, data.error);
    });
    return unsubscribe;
  }, [setConnectionStatus]);

  // 编辑时填充表单
  useEffect(() => {
    if (editingServer) {
      setFormName(editingServer.name);
      setFormDescription(editingServer.description || "");
      setTransportType(editingServer.transport.type);
      setShowJsonImport(false); // 编辑时不显示导入模式

      if (editingServer.transport.type === "stdio") {
        setFormCommand(editingServer.transport.command);
        setFormArgs(editingServer.transport.args?.join(", ") || "");
        setFormEnv(
          editingServer.transport.env ? JSON.stringify(editingServer.transport.env, null, 2) : ""
        );
        setFormCwd(editingServer.transport.cwd || "");
        setFormUrl("");
        setFormHeaders("");
      } else {
        setFormUrl(editingServer.transport.url);
        setFormHeaders(
          editingServer.transport.headers
            ? JSON.stringify(editingServer.transport.headers, null, 2)
            : ""
        );
        setFormCommand("");
        setFormArgs("");
        setFormEnv("");
        setFormCwd("");
      }
    }
  }, [editingServer]);

  const resetForm = () => {
    setFormName("");
    setFormDescription("");
    setFormCommand("");
    setFormArgs("");
    setFormEnv("");
    setFormCwd("");
    setFormUrl("");
    setFormHeaders("");
    setTransportType("stdio");
    setEditingServer(null);
    setShowJsonImport(true); // 重置为默认显示导入配置
    setJsonConfig("");
  };

  const parseJsonConfig = () => {
    try {
      const config = JSON.parse(jsonConfig);

      // 支持两种格式
      if (config.mcpServers) {
        // 格式 1: { mcpServers: { "name": { ... } } }
        const serverEntries = Object.entries(config.mcpServers);
        if (serverEntries.length === 0) {
          throw new Error("未找到 MCP 服务器配置");
        }

        const [serverName, serverConfig] = serverEntries[0] as [string, any];
        setFormName(serverName);

        if (serverConfig.type === "streamable_http" || serverConfig.url) {
          // HTTP 传输
          setTransportType("streamable-http");
          setFormUrl(serverConfig.url || "");
          if (serverConfig.headers) {
            setFormHeaders(JSON.stringify(serverConfig.headers, null, 2));
          }
        } else if (serverConfig.command || serverConfig.args) {
          // Stdio 传输
          setTransportType("stdio");
          setFormCommand(serverConfig.command || "");
          if (serverConfig.args && Array.isArray(serverConfig.args)) {
            setFormArgs(serverConfig.args.join(", "));
          }
          if (serverConfig.env) {
            setFormEnv(JSON.stringify(serverConfig.env, null, 2));
          }
          if (serverConfig.cwd) {
            setFormCwd(serverConfig.cwd);
          }
        }
      }

      // 解析成功后切换到手动输入模式，显示已填充的表单
      setShowJsonImport(false);
      setJsonConfig("");
    } catch (error) {
      modal.error({
        title: "JSON 解析失败",
        content: error instanceof Error ? error.message : "无效的 JSON 格式",
        zIndex: 10000,
      });
    }
  };

  const buildTransportConfig = (): TransportConfig => {
    if (transportType === "stdio") {
      const config: TransportConfig = {
        type: "stdio",
        command: formCommand.trim(),
      };
      if (formArgs.trim()) {
        config.args = formArgs
          .split(",")
          .map(s => s.trim())
          .filter(Boolean);
      }
      if (formEnv.trim()) {
        try {
          config.env = JSON.parse(formEnv);
        } catch {
          // ignore
        }
      }
      if (formCwd.trim()) {
        config.cwd = formCwd.trim();
      }
      return config;
    } else {
      const config: TransportConfig = {
        type: "streamable-http",
        url: formUrl.trim(),
      };
      if (formHeaders.trim()) {
        try {
          config.headers = JSON.parse(formHeaders);
        } catch {
          // ignore
        }
      }
      return config;
    }
  };

  const isFormValid = () => {
    if (!formName.trim()) return false;
    if (transportType === "stdio") {
      return !!formCommand.trim();
    } else {
      return !!formUrl.trim();
    }
  };

  const handleSubmit = async () => {
    if (!isFormValid()) return;

    const transport = buildTransportConfig();

    if (editingServer) {
      // 更新
      updateCustomServer(editingServer.id, {
        name: formName,
        description: formDescription,
        transport,
      });

      if (editingServer.enabled) {
        setConnectionStatus(editingServer.id, "connecting");
        try {
          await disconnectFromServer(editingServer.id);
          await connectToServer({ ...editingServer, transport });
          setConnectionStatus(editingServer.id, "connected");
        } catch (error) {
          setConnectionStatus(
            editingServer.id,
            "error",
            error instanceof Error ? error.message : "连接失败"
          );
        }
      }
    } else {
      // 新增
      const server = addCustomServer({
        name: formName,
        description: formDescription,
        transport,
      });

      setConnectionStatus(server.id, "connecting");
      try {
        await connectToServer(server);
        setConnectionStatus(server.id, "connected");
      } catch (error) {
        setConnectionStatus(
          server.id,
          "error",
          error instanceof Error ? error.message : "连接失败"
        );
      }
    }

    resetForm();
  };

  const handleToggleEnabled = async (server: CustomMCPServer, enabled: boolean) => {
    setCustomServerEnabled(server.id, enabled);

    if (enabled) {
      setConnectionStatus(server.id, "connecting");
      try {
        await connectToServer(server);
        setConnectionStatus(server.id, "connected");
      } catch (error) {
        setConnectionStatus(
          server.id,
          "error",
          error instanceof Error ? error.message : "连接失败"
        );
      }
    } else {
      try {
        await disconnectFromServer(server.id);
        setConnectionStatus(server.id, "disconnected");
      } catch {
        // ignore
      }
    }
  };

  const handleReconnect = async (server: CustomMCPServer) => {
    setConnectionStatus(server.id, "connecting");
    try {
      await reconnectToServer(server);
      setConnectionStatus(server.id, "connected");
    } catch (error) {
      setConnectionStatus(server.id, "error", error instanceof Error ? error.message : "连接失败");
    }
  };

  const handleDelete = async (server: CustomMCPServer) => {
    modal.confirm({
      title: "删除 MCP 服务",
      content: `确定要删除「${server.name}」吗？此操作无法撤销。`,
      okText: "确认删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      zIndex: 10000,
      onOk: async () => {
        try {
          await disconnectFromServer(server.id);
        } catch {
          // ignore
        }
        removeCustomServer(server.id);
      },
    });
  };

  const getTransportDescription = (transport: TransportConfig): string => {
    if (transport.type === "stdio") {
      return `${transport.command}${transport.args?.length ? ` ${transport.args.join(" ")}` : ""}`;
    } else {
      return transport.url;
    }
  };

  if (!open) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="z-9999 fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="m-4 flex max-h-[90vh] w-full max-w-[720px] flex-col"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-zinc-900/95">
            {/* Header */}
            <div className="mb-5 flex shrink-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-indigo-200 bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/20">
                <svg
                  className="h-5 w-5 text-indigo-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="m-0 text-base font-bold text-gray-800 dark:text-white">
                  MCP 管理中心
                </h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-500">
                  管理模型上下文协议服务
                </p>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-gray-100 text-gray-500 transition-all hover:bg-gray-200 hover:text-gray-700 dark:bg-zinc-800 dark:text-slate-400 dark:hover:bg-zinc-700 dark:hover:text-slate-200"
              >
                <MdClose className="h-5 w-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="mb-4 flex shrink-0 gap-1 rounded-xl bg-gray-100 p-1 dark:bg-zinc-800">
              <button
                onClick={() => setActiveTab("builtin")}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  activeTab === "builtin"
                    ? "bg-white text-gray-900 shadow-sm dark:bg-zinc-700 dark:text-white"
                    : "text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                内置服务
              </button>
              <button
                onClick={() => setActiveTab("custom")}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  activeTab === "custom"
                    ? "bg-white text-gray-900 shadow-sm dark:bg-zinc-700 dark:text-white"
                    : "text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                MCP 服务
              </button>
            </div>

            {/* Content */}
            <div className="mcp-modal-scroll min-h-0 flex-1 overflow-y-auto pr-1">
              {activeTab === "builtin" ? (
                /* 内置服务列表 */
                <div className="space-y-2">
                  <p className="mb-3 text-xs text-gray-500 dark:text-slate-500">
                    选择要启用的内置 MCP 服务，启用后模型即可自动调用相应的工具完成任务。
                  </p>
                  {MCP_PROVIDERS.filter(provider => provider.isAvailable?.() ?? true).map(
                    provider => {
                      const enabled =
                        providerStates[provider.id]?.enabled ?? provider.defaultEnabled ?? false;
                      return (
                        <div
                          key={provider.id}
                          className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-slate-700/50 dark:bg-zinc-800/50"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="mb-0.5 flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-800 dark:text-white">
                                {provider.name}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                  enabled
                                    ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
                                    : "bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-slate-400"
                                }`}
                              >
                                {enabled ? "已启用" : "未启用"}
                              </span>
                            </div>
                            <p className="line-clamp-2 text-xs text-gray-500 dark:text-slate-500">
                              {provider.description}
                            </p>
                          </div>
                          <ToggleSwitch
                            checked={enabled}
                            onChange={checked => setProviderEnabled(provider.id, checked)}
                          />
                        </div>
                      );
                    }
                  )}
                </div>
              ) : (
                /* MCP 服务 */
                <div className="space-y-4">
                  <p className="text-xs text-gray-500 dark:text-slate-500">
                    连接 MCP 服务器以扩展模型能力。支持本地 stdio 和远程 HTTP 两种传输方式。
                  </p>

                  {/* 添加/编辑表单 */}
                  <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-700/50 dark:bg-zinc-800/50">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MdAdd className="h-4 w-4 text-indigo-500" />
                        <span className="text-sm font-medium text-gray-800 dark:text-white">
                          {editingServer ? "编辑服务" : "添加服务"}
                        </span>
                      </div>
                      {!editingServer && (
                        <button
                          onClick={() => setShowJsonImport(!showJsonImport)}
                          className="rounded-lg bg-indigo-100 px-3 py-1.5 text-xs font-medium text-indigo-600 transition-all hover:bg-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-400 dark:hover:bg-indigo-500/30"
                        >
                          {showJsonImport ? "手动输入" : "导入配置"}
                        </button>
                      )}
                    </div>

                    {/* JSON 导入面板 */}
                    {showJsonImport && !editingServer && (
                      <div className="space-y-3 border-b border-gray-200 pb-3 dark:border-slate-700">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                            粘贴 MCP 配置 JSON
                          </label>
                          <textarea
                            value={jsonConfig}
                            onChange={e => setJsonConfig(e.target.value)}
                            rows={8}
                            className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 font-mono text-sm text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
                            placeholder={`{\n  "mcpServers": {\n    "服务名称": {\n      "command": "npx",\n      "args": ["-y", "@antv/mcp-server-chart"]\n    }\n  }\n}`}
                          />
                          <p className="text-xs text-gray-500 dark:text-slate-400">
                            支持标准 MCP 配置格式，系统会自动解析并填充表单
                          </p>
                        </div>
                        <button
                          onClick={parseJsonConfig}
                          disabled={!jsonConfig.trim()}
                          className="w-full rounded-xl bg-[var(--th-btn-bg)] px-4 py-2.5 text-sm font-medium text-[var(--th-btn-text)] transition-all hover:bg-[var(--th-btn-hover)] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 dark:disabled:bg-zinc-700 dark:disabled:text-slate-500"
                        >
                          解析并填充
                        </button>
                      </div>
                    )}

                    {/* 手动输入表单 - 仅在不是导入模式或正在编辑时显示 */}
                    {(!showJsonImport || editingServer) && (
                      <>
                        {/* 名称 */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                            名称 *
                          </label>
                          <input
                            type="text"
                            value={formName}
                            onChange={e => setFormName(e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
                            placeholder="例如：文件系统 MCP"
                          />
                        </div>

                        {/* 描述 */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                            描述
                          </label>
                          <textarea
                            value={formDescription}
                            onChange={e => setFormDescription(e.target.value)}
                            rows={2}
                            className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
                            placeholder="可选描述，帮助记忆用途"
                          />
                        </div>

                        {/* 传输类型 */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                            传输类型
                          </label>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setTransportType("stdio")}
                              className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
                                transportType === "stdio"
                                  ? "border-[var(--th-border-focus)]/30 bg-[var(--th-accent-soft)] text-indigo-700 dark:text-indigo-400"
                                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:bg-zinc-900 dark:text-slate-400 dark:hover:bg-zinc-800"
                              }`}
                            >
                              Stdio（本地进程）
                            </button>
                            <button
                              onClick={() => setTransportType("streamable-http")}
                              className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
                                transportType === "streamable-http"
                                  ? "border-[var(--th-border-focus)]/30 bg-[var(--th-accent-soft)] text-indigo-700 dark:text-indigo-400"
                                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:bg-zinc-900 dark:text-slate-400 dark:hover:bg-zinc-800"
                              }`}
                            >
                              Streamable HTTP
                            </button>
                          </div>
                        </div>

                        {/* Stdio 字段 */}
                        {transportType === "stdio" && (
                          <>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                                命令 *
                              </label>
                              <input
                                type="text"
                                value={formCommand}
                                onChange={e => setFormCommand(e.target.value)}
                                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-mono text-sm text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
                                placeholder="npx"
                              />
                              <p className="-mt-1 text-xs text-gray-500 dark:text-slate-400">
                                可执行命令，如 npx、node、python 等
                              </p>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                                参数（逗号分隔）
                              </label>
                              <input
                                type="text"
                                value={formArgs}
                                onChange={e => setFormArgs(e.target.value)}
                                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-mono text-sm text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
                                placeholder="-y, @modelcontextprotocol/server-filesystem, /path/to/directory"
                              />
                              <p className="-mt-1 text-xs text-gray-500 dark:text-slate-400">
                                命令行参数，用逗号分隔。例如：-y, @antv/mcp-server-chart
                              </p>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                                环境变量（JSON）
                              </label>
                              <textarea
                                value={formEnv}
                                onChange={e => setFormEnv(e.target.value)}
                                rows={2}
                                className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 font-mono text-sm text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
                                placeholder='{"API_KEY": "xxx"}'
                              />
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                                工作目录
                              </label>
                              <input
                                type="text"
                                value={formCwd}
                                onChange={e => setFormCwd(e.target.value)}
                                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-mono text-sm text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
                                placeholder="可选，默认为当前目录"
                              />
                            </div>
                          </>
                        )}

                        {/* HTTP 字段 */}
                        {transportType === "streamable-http" && (
                          <>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                                服务器 URL *
                              </label>
                              <input
                                type="text"
                                value={formUrl}
                                onChange={e => setFormUrl(e.target.value)}
                                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-mono text-sm text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
                                placeholder="https://example.com/mcp"
                              />
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                                自定义请求头（JSON）
                              </label>
                              <textarea
                                value={formHeaders}
                                onChange={e => setFormHeaders(e.target.value)}
                                rows={2}
                                className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 font-mono text-sm text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
                                placeholder='{"Authorization": "Bearer xxx"}'
                              />
                            </div>
                          </>
                        )}

                        {/* 按钮 */}
                        <div className="flex gap-2 pt-2">
                          {editingServer && (
                            <button
                              onClick={resetForm}
                              className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-200 dark:bg-zinc-700 dark:text-slate-200 dark:hover:bg-slate-600"
                            >
                              取消编辑
                            </button>
                          )}
                          <button
                            onClick={handleSubmit}
                            disabled={!isFormValid()}
                            className="flex-1 rounded-xl bg-[var(--th-btn-bg)] px-4 py-2.5 text-sm font-medium text-[var(--th-btn-text)] transition-all hover:bg-[var(--th-btn-hover)] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 dark:disabled:bg-zinc-700 dark:disabled:text-slate-500"
                          >
                            {editingServer ? "保存更改" : "添加服务"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* 服务列表 */}
                  {customServers.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                        已添加的服务
                      </div>
                      {customServers.map(server => {
                        const status = connectionStatus[server.id];
                        const error = connectionErrors[server.id];

                        return (
                          <div
                            key={server.id}
                            className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 dark:border-slate-700/50 dark:bg-zinc-800/50"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="mb-0.5 flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-gray-800 dark:text-white">
                                  {server.name}
                                </span>
                                {server.enabled ? (
                                  <ConnectionStatusBadge status={status} error={error} />
                                ) : (
                                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-zinc-700 dark:text-slate-400">
                                    未启用
                                  </span>
                                )}
                                <TransportTypeBadge type={server.transport.type} />
                              </div>
                              <p className="truncate font-mono text-xs text-gray-500 dark:text-slate-500">
                                {getTransportDescription(server.transport)}
                              </p>
                              {server.description && (
                                <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-600">
                                  {server.description}
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {/* 重连按钮 - 仅在错误状态且已启用时显示 */}
                              {server.enabled && status === "error" && (
                                <button
                                  onClick={() => handleReconnect(server)}
                                  className="rounded-lg p-2 text-orange-500 transition-all hover:bg-orange-50 hover:text-orange-600 dark:text-orange-400 dark:hover:bg-orange-500/10 dark:hover:text-orange-300"
                                  title="重新连接"
                                >
                                  <MdRefresh className="h-4 w-4" />
                                </button>
                              )}
                              <button
                                onClick={() => setEditingServer(server)}
                                className="rounded-lg p-2 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 dark:text-slate-500 dark:hover:bg-zinc-700 dark:hover:text-slate-300"
                                title="编辑"
                              >
                                <MdEdit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(server)}
                                className="rounded-lg p-2 text-gray-400 transition-all hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                                title="删除"
                              >
                                <MdDelete className="h-4 w-4" />
                              </button>
                              <ToggleSwitch
                                checked={server.enabled}
                                onChange={checked => handleToggleEnabled(server, checked)}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {customServers.length === 0 && (
                    <div className="py-8 text-center text-gray-400 dark:text-slate-600">
                      <p className="text-sm">尚未添加 MCP 服务</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

export default MCPManagerModal;
