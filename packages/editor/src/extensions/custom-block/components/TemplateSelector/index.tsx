import { useEffect, useMemo, useState } from "react";
import { Spin, Input } from "antd";
import { MdWidgets, MdSearch } from "react-icons/md";
import { useMemoizedFn } from "ahooks";
import { CustomModal } from "@tau/shared";
import type { Editor } from "slate";
import { ICustomBlockService } from "../../../../services";
import styles from "./index.module.less";
import type { CustomBlockTemplate } from "../../../types";

interface TemplateSelectorProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (source: string) => void;
  editor: Editor;
}

const TemplateSelector = ({ visible, onClose, onSelect, editor }: TemplateSelectorProps) => {
  const [searchText, setSearchText] = useState("");
  const [templates, setTemplates] = useState<CustomBlockTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!visible) {
      return () => {
        cancelled = true;
      };
    }

    const service = editor.tryGetService(ICustomBlockService);
    if (!service) {
      setTemplates([]);
      setLoading(false);
      setError("当前环境暂未提供模板能力");
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError(null);
    service
      .listEnabledTemplates()
      .then(list => {
        if (!cancelled) {
          setTemplates(list);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载模板失败，请稍后重试");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [visible, editor]);

  useEffect(() => {
    if (!visible) {
      setSearchText("");
    }
  }, [visible]);

  const filteredBlocks = useMemo(() => {
    if (!searchText.trim()) {
      return templates;
    }
    const lower = searchText.toLowerCase().trim();
    return templates.filter(block => block.manifest.name.toLowerCase().includes(lower));
  }, [templates, searchText]);

  const handleSelect = useMemoizedFn((source: string) => {
    onSelect(source);
    onClose();
  });

  const renderBlockCard = (block: CustomBlockTemplate) => (
    <button
      key={block.id}
      type="button"
      className="flex h-[220px] flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:border-indigo-400 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-zinc-900/40"
      onClick={() => handleSelect(block.source)}
    >
      <div>
        <p className="mb-1 truncate text-base font-semibold text-gray-900 dark:text-gray-100">
          {block.manifest.name}
        </p>
        <p className="line-clamp-2 min-h-[32px] text-xs text-gray-500 dark:text-gray-400">
          {block.manifest.description || "暂无描述"}
        </p>
      </div>
      <div className="mt-auto flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
        <span>{block.manifest.author || "未知作者"}</span>
        {block.isLocal && <span>本地</span>}
      </div>
    </button>
  );

  const renderEmpty = (message: string) => (
    <div className="min-h-75 flex flex-col items-center justify-center text-center">
      <MdWidgets className="text-text-2 mb-4 h-12 w-12 opacity-50" />
      <h3 className="text-text-1 mb-2 text-base font-semibold">{message}</h3>
      <p className="text-text-2 text-sm">请先在桌面端启用或创建模板</p>
    </div>
  );

  return (
    <CustomModal
      title="选择组件模板"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={1200}
      contentClassName={styles.modalContent}
      centered
      maskClosable={false}
    >
      {loading ? (
        <div className="min-h-75 flex flex-col items-center justify-center">
          <Spin size="large" />
        </div>
      ) : error ? (
        renderEmpty(error)
      ) : templates.length === 0 ? (
        renderEmpty("暂无可用的组件模板")
      ) : (
        <>
          <div className="mb-6">
            <Input
              placeholder="搜索组件名称..."
              prefix={<MdSearch className="text-text-2" />}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              allowClear
              size="large"
              className="bg-bg-input dark:bg-bg-input border-border-1 dark:border-border-1 text-text-1 dark:text-text-1 hover:border-brand focus:border-brand h-10 rounded-lg"
            />
          </div>

          {filteredBlocks.length === 0 ? (
            renderEmpty("未找到匹配的组件")
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {filteredBlocks.map(renderBlockCard)}
            </div>
          )}
        </>
      )}
    </CustomModal>
  );
};

export default TemplateSelector;
