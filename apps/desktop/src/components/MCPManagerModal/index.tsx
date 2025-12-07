import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { MdClose, MdEdit, MdDelete, MdAdd } from "react-icons/md";
import useMCPStore, {
  CustomMCPServer,
  TransportConfig,
  ConnectionStatus,
} from "@/stores/useMCPStore";
import { MCP_PROVIDERS } from "@/mcp/providers";
import {
  connectToServer,
  disconnectFromServer,
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
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="sr-only peer"
      />
      <div
        onClick={() => !disabled && onChange(!checked)}
        className={`
          w-11 h-6 rounded-full transition-all duration-200 ease-in-out cursor-pointer
          ${checked ? "bg-indigo-500" : "bg-gray-200 dark:bg-slate-700"}
          ${disabled ? "opacity-50 cursor-not-allowed" : "hover:shadow-md"}
        `}
      >
        <div
          className={`
            absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md
            transition-transform duration-200 ease-in-out
            ${checked ? "translate-x-5" : "translate-x-0"}
          `}
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
          className: "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-400",
        };
    }
  };

  const config = getStatusConfig();

  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}
      title={error}
    >
      {config.text}
    </span>
  );
};

// 传输类型标签
const TransportTypeBadge: React.FC<{ type: "stdio" | "streamable-http" }> = ({
  type,
}) => {
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
      {type === "stdio" ? "stdio" : "http"}
    </span>
  );
};

// 删除确认对话框
const DeleteConfirmDialog: React.FC<{
  open: boolean;
  serverName: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ open, serverName, onConfirm, onCancel }) => {
  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="px-3.5 py-2.5 mb-4 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20"
    >
      <p className="text-sm text-red-600 dark:text-red-400 mb-2">
        确定要删除「{serverName}」吗？此操作无法撤销。
      </p>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors"
        >
          确认删除
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200 text-xs font-medium hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors"
        >
          取消
        </button>
      </div>
    </motion.div>
  );
};

const MCPManagerModal: React.FC<MCPManagerModalProps> = ({ open, onClose }) => {
  const providerStates = useMCPStore((state) => state.providerStates);
  const customServers = useMCPStore((state) => state.customServers);
  const connectionStatus = useMCPStore((state) => state.connectionStatus);
  const connectionErrors = useMCPStore((state) => state.connectionErrors);
  const setProviderEnabled = useMCPStore((state) => state.setProviderEnabled);
  const addCustomServer = useMCPStore((state) => state.addCustomServer);
  const updateCustomServer = useMCPStore((state) => state.updateCustomServer);
  const removeCustomServer = useMCPStore((state) => state.removeCustomServer);
  const setCustomServerEnabled = useMCPStore(
    (state) => state.setCustomServerEnabled,
  );
  const setConnectionStatus = useMCPStore((state) => state.setConnectionStatus);

  const [activeTab, setActiveTab] = useState<TabType>("builtin");
  const [transportType, setTransportType] = useState<TransportType>("stdio");
  const [editingServer, setEditingServer] = useState<CustomMCPServer | null>(null);
  const [deletingServer, setDeletingServer] = useState<CustomMCPServer | null>(null);

  // 表单状态
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCommand, setFormCommand] = useState("");
  const [formArgs, setFormArgs] = useState("");
  const [formEnv, setFormEnv] = useState("");
  const [formCwd, setFormCwd] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formHeaders, setFormHeaders] = useState("");

  // 监听来自主进程的连接状态变化
  useEffect(() => {
    const unsubscribe = onConnectionStatusChange((data) => {
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

      if (editingServer.transport.type === "stdio") {
        setFormCommand(editingServer.transport.command);
        setFormArgs(editingServer.transport.args?.join(", ") || "");
        setFormEnv(
          editingServer.transport.env
            ? JSON.stringify(editingServer.transport.env, null, 2)
            : "",
        );
        setFormCwd(editingServer.transport.cwd || "");
        setFormUrl("");
        setFormHeaders("");
      } else {
        setFormUrl(editingServer.transport.url);
        setFormHeaders(
          editingServer.transport.headers
            ? JSON.stringify(editingServer.transport.headers, null, 2)
            : "",
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
  };

  const buildTransportConfig = (): TransportConfig => {
    if (transportType === "stdio") {
      const config: TransportConfig = {
        type: "stdio",
        command: formCommand.trim(),
      };
      if (formArgs.trim()) {
        config.args = formArgs.split(",").map((s) => s.trim()).filter(Boolean);
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
            error instanceof Error ? error.message : "连接失败",
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
          error instanceof Error ? error.message : "连接失败",
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
          error instanceof Error ? error.message : "连接失败",
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

  const handleDelete = async () => {
    if (!deletingServer) return;
    try {
      await disconnectFromServer(deletingServer.id);
    } catch {
      // ignore
    }
    removeCustomServer(deletingServer.id);
    setDeletingServer(null);
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
        className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="w-full max-w-[720px] m-4 max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="rounded-2xl p-6 shadow-2xl bg-white dark:bg-slate-900/95 border border-gray-200 dark:border-slate-800 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-start gap-3 mb-5 shrink-0">
              <div className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center bg-indigo-50 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30">
                <svg
                  className="w-5 h-5 text-indigo-500"
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
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold m-0 text-gray-800 dark:text-white">
                  MCP 管理中心
                </h2>
                <p className="text-xs mt-0.5 text-gray-500 dark:text-slate-500">
                  管理模型上下文协议服务
                </p>
              </div>
              <button
                onClick={onClose}
                className="shrink-0 w-8 h-8 rounded-lg border-none cursor-pointer flex items-center justify-center transition-all bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-slate-200"
              >
                <MdClose className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 mb-4 rounded-xl bg-gray-100 dark:bg-slate-800 shrink-0">
              <button
                onClick={() => setActiveTab("builtin")}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === "builtin"
                    ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                内置服务
              </button>
              <button
                onClick={() => setActiveTab("custom")}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === "custom"
                    ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                MCP 服务
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto mcp-modal-scroll pr-1 min-h-0">
              {activeTab === "builtin" ? (
                /* 内置服务列表 */
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 dark:text-slate-500 mb-3">
                    选择要启用的内置 MCP 服务，启用后模型即可自动调用相应的工具完成任务。
                  </p>
                  {MCP_PROVIDERS.map((provider) => {
                    const enabled =
                      providerStates[provider.id]?.enabled ??
                      provider.defaultEnabled ??
                      false;
                    return (
                      <div
                        key={provider.id}
                        className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700/50"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-medium text-sm text-gray-800 dark:text-white">
                              {provider.name}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                enabled
                                  ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
                                  : "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-400"
                              }`}
                            >
                              {enabled ? "已启用" : "未启用"}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-slate-500 line-clamp-2">
                            {provider.description}
                          </p>
                        </div>
                        <ToggleSwitch
                          checked={enabled}
                          onChange={(checked) =>
                            setProviderEnabled(provider.id, checked)
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* MCP 服务 */
                <div className="space-y-4">
                  <p className="text-xs text-gray-500 dark:text-slate-500">
                    连接 MCP 服务器以扩展模型能力。支持本地 stdio 和远程 HTTP 两种传输方式。
                  </p>

                  {/* 删除确认 */}
                  <DeleteConfirmDialog
                    open={!!deletingServer}
                    serverName={deletingServer?.name || ""}
                    onConfirm={handleDelete}
                    onCancel={() => setDeletingServer(null)}
                  />

                  {/* 添加/编辑表单 */}
                  <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700/50 space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <MdAdd className="w-4 h-4 text-indigo-500" />
                      <span className="text-sm font-medium text-gray-800 dark:text-white">
                        {editingServer ? "编辑服务" : "添加服务"}
                      </span>
                    </div>

                    {/* 名称 */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                        名称 *
                      </label>
                      <input
                        type="text"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
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
                        onChange={(e) => setFormDescription(e.target.value)}
                        rows={2}
                        className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none"
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
                          className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                            transportType === "stdio"
                              ? "bg-indigo-50 dark:bg-indigo-500/20 border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-400"
                              : "bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800"
                          }`}
                        >
                          Stdio（本地进程）
                        </button>
                        <button
                          onClick={() => setTransportType("streamable-http")}
                          className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                            transportType === "streamable-http"
                              ? "bg-indigo-50 dark:bg-indigo-500/20 border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-400"
                              : "bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800"
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
                            onChange={(e) => setFormCommand(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-mono"
                            placeholder="npx -y @modelcontextprotocol/server-filesystem"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                            参数（逗号分隔）
                          </label>
                          <input
                            type="text"
                            value={formArgs}
                            onChange={(e) => setFormArgs(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-mono"
                            placeholder="/path/to/allowed/directory"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                            环境变量（JSON）
                          </label>
                          <textarea
                            value={formEnv}
                            onChange={(e) => setFormEnv(e.target.value)}
                            rows={2}
                            className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none font-mono"
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
                            onChange={(e) => setFormCwd(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-mono"
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
                            onChange={(e) => setFormUrl(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-mono"
                            placeholder="https://example.com/mcp"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                            自定义请求头（JSON）
                          </label>
                          <textarea
                            value={formHeaders}
                            onChange={(e) => setFormHeaders(e.target.value)}
                            rows={2}
                            className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none font-mono"
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
                          className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-600"
                        >
                          取消编辑
                        </button>
                      )}
                      <button
                        onClick={handleSubmit}
                        disabled={!isFormValid()}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all bg-indigo-500 text-white hover:bg-indigo-600 disabled:bg-gray-200 dark:disabled:bg-slate-700 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed"
                      >
                        {editingServer ? "保存更改" : "添加服务"}
                      </button>
                    </div>
                  </div>

                  {/* 服务列表 */}
                  {customServers.length > 0 && (
                    <div className="space-y-2 mt-4">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2">
                        已添加的服务
                      </div>
                      {customServers.map((server) => {
                        const status = connectionStatus[server.id];
                        const error = connectionErrors[server.id];

                        return (
                          <div
                            key={server.id}
                            className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700/50"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <span className="font-medium text-sm text-gray-800 dark:text-white">
                                  {server.name}
                                </span>
                                {server.enabled ? (
                                  <ConnectionStatusBadge
                                    status={status}
                                    error={error}
                                  />
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-400">
                                    未启用
                                  </span>
                                )}
                                <TransportTypeBadge type={server.transport.type} />
                              </div>
                              <p className="text-xs text-gray-500 dark:text-slate-500 truncate font-mono">
                                {getTransportDescription(server.transport)}
                              </p>
                              {server.description && (
                                <p className="text-xs text-gray-400 dark:text-slate-600 mt-0.5">
                                  {server.description}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => setEditingServer(server)}
                                className="p-2 rounded-lg transition-all text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                                title="编辑"
                              >
                                <MdEdit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setDeletingServer(server)}
                                className="p-2 rounded-lg transition-all text-gray-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                                title="删除"
                              >
                                <MdDelete className="w-4 h-4" />
                              </button>
                              <ToggleSwitch
                                checked={server.enabled}
                                onChange={(checked) =>
                                  handleToggleEnabled(server, checked)
                                }
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {customServers.length === 0 && (
                    <div className="text-center py-8 text-gray-400 dark:text-slate-600">
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
    document.body,
  );
};

export default MCPManagerModal;
