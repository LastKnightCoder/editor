import { useState, useRef, useMemo } from "react";
import { App } from "antd";
import { produce } from "immer";
import {
  IoCaretDownOutline,
  IoAddCircleOutline,
  IoCheckmarkCircleOutline,
  IoCubeOutline,
} from "react-icons/io5";
import { FiTrash2 } from "react-icons/fi";
import classNames from "classnames";

import useSettingStore from "@/stores/useSettingStore.ts";
import { closeDatabase, getDatabasePath, removeFile } from "@/commands";
import { SelectDropDown } from "@tau/shared";
import CustomModal from "@/components/CustomModal";
import useThemeColors from "@/hooks/useThemeColors";

const SelectDatabase = () => {
  const { database } = useSettingStore(state => ({
    database: state.setting.database,
  }));

  const [createDatabaseModalOpen, setCreateDatabaseModalOpen] = useState(false);
  const [databaseDropdownOpen, setDatabaseDropdownOpen] = useState(false);
  const [newDatabaseName, setNewDatabaseName] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const { message, modal } = App.useApp();
  const themeColors = useThemeColors();

  const { active, databases } = database;

  const handleCreateDatabase = (databaseName: string) => {
    useSettingStore.setState(
      produce(state => {
        state.setting.database.databases.push({
          name: databaseName,
          version: 1,
        });
        state.setting.database.active = databaseName;
      })
    );
    setCreateDatabaseModalOpen(false);
    setDatabaseDropdownOpen(false);
    setNewDatabaseName("");
  };

  type DatabaseDropdownOption =
    | { type: "database"; database: (typeof databases)[number] }
    | { type: "action"; action: "create" };

  const dropdownOptions = useMemo<DatabaseDropdownOption[]>(
    () => [
      ...databases.map(item => ({
        type: "database" as const,
        database: item,
      })),
      { type: "action", action: "create" } as const,
    ],
    [databases]
  );

  const handleDeleteDatabase = (databaseName: string) => {
    if (databaseName === active) {
      message.warning("当前数据库无法删除");
      return;
    }

    modal.confirm({
      title: "确定要删除此数据库吗？",
      content: "删除后，数据库文件将被删除，数据无法恢复！",
      okButtonProps: { danger: true },
      onOk: async () => {
        useSettingStore.setState(
          produce(state => {
            state.setting.database.databases = state.setting.database.databases.filter(
              (item: { name: string }) => item.name !== databaseName
            );
          })
        );
        await closeDatabase(databaseName);
        const databasePath = await getDatabasePath(databaseName);
        await removeFile(databasePath);
      },
    });
  };

  const handleSelectOption = (option: DatabaseDropdownOption) => {
    if (option.type === "action") {
      setCreateDatabaseModalOpen(true);
      setDatabaseDropdownOpen(false);
      return;
    }

    useSettingStore.setState(
      produce(state => {
        state.setting.database.active = option.database.name;
      })
    );
    setDatabaseDropdownOpen(false);
  };

  const handleCreateModalCancel = () => {
    setCreateDatabaseModalOpen(false);
    setNewDatabaseName("");
  };

  const handleCreateModalConfirm = () => {
    const trimmed = newDatabaseName.trim();
    if (!trimmed) {
      message.error("请输入数据库名称");
      return;
    }
    if (databases.some(dbItem => dbItem.name.toLowerCase() === trimmed.toLowerCase())) {
      message.error("同名数据库已存在");
      return;
    }

    const normalizedName = trimmed.endsWith(".db") ? trimmed : `${trimmed}.db`;
    handleCreateDatabase(normalizedName);
  };

  const activeLabel = active.replace(/\.db$/i, "");

  return (
    <div className="cursor-pointer">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setDatabaseDropdownOpen(open => !open)}
        className={classNames(
          "inline-flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 transition-all md:w-auto",
          themeColors.cardBgClass,
          themeColors.borderClass,
          themeColors.hoverBorderClass
        )}
      >
        <div className="flex flex-col text-left">
          <span className={`text-sm font-semibold ${themeColors.textClass}`}>{activeLabel}</span>
          <span className={`text-xs ${themeColors.secondaryTextClass}`}>当前数据库</span>
        </div>
        <IoCaretDownOutline className={`text-lg ${themeColors.textClass}`} />
      </button>

      <SelectDropDown<DatabaseDropdownOption>
        items={dropdownOptions}
        selectedKey={active}
        show={databaseDropdownOpen}
        onClose={() => setDatabaseDropdownOpen(false)}
        onSelect={handleSelectOption}
        triggerElement={triggerRef.current}
        width={360}
        maxHeight={400}
        preferredPlacement="bottom"
        getKey={item => (item.type === "database" ? item.database.name : "create-action")}
        renderItem={item => {
          if (item.type === "database") {
            const isActive = item.database.name === active;
            const displayName = item.database.name.replace(/\.db$/i, "");
            return (
              <div className="flex w-full items-center gap-3">
                {/* 左侧数据库图标 */}
                <div
                  className={classNames(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all",
                    themeColors.inputBgClass
                  )}
                >
                  <IoCubeOutline
                    className={classNames(
                      "text-base",
                      isActive ? themeColors.textClass : themeColors.secondaryTextClass
                    )}
                  />
                </div>

                {/* 数据库名称 */}
                <div className="min-w-0 flex-1">
                  <p
                    className={classNames(
                      "truncate text-sm transition-all",
                      isActive
                        ? `font-semibold ${themeColors.textClass}`
                        : `font-medium ${themeColors.textClass}`
                    )}
                  >
                    {displayName}
                  </p>
                </div>

                {/* 右侧图标 */}
                <div className="flex shrink-0 items-center gap-1">
                  {isActive ? (
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg transition-all">
                      <IoCheckmarkCircleOutline className="text-base text-[var(--th-accent)]" />
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-red-500 transition-all hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                      onClick={e => {
                        e.stopPropagation();
                        handleDeleteDatabase(item.database.name);
                      }}
                    >
                      <FiTrash2 className="text-sm" />
                    </button>
                  )}
                </div>
              </div>
            );
          }

          // "创建新的数据库" - 分隔线在外层，避免被 hover 背景覆盖
          return (
            <div className="flex w-full items-center gap-3 pt-2">
              <div
                className={classNames(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  themeColors.inputBgClass,
                  themeColors.secondaryTextClass
                )}
              >
                <IoAddCircleOutline className="text-base" />
              </div>
              <div className="flex min-w-0 flex-col">
                <span className={`text-sm font-medium ${themeColors.textClass}`}>
                  创建新的数据库
                </span>
                <span className={`text-xs ${themeColors.secondaryTextClass}`}>
                  为不同工作区维护独立数据
                </span>
              </div>
            </div>
          );
        }}
      />

      <CustomModal
        title="创建新的数据库"
        open={createDatabaseModalOpen}
        onCancel={handleCreateModalCancel}
        footer={null}
        width={600}
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-3">
            <div
              className={classNames(
                "flex h-12 w-12 items-center justify-center rounded-2xl border",
                "border-[var(--th-border)] bg-[var(--th-bg-hover)] text-[var(--th-text-secondary)]"
              )}
            >
              <IoCubeOutline className="text-xl" />
            </div>
            <div className="flex-1">
              <p className={`text-base font-semibold ${themeColors.textClass}`}>新建数据库</p>
              <p className={`text-sm ${themeColors.secondaryTextClass}`}>
                为不同用途创建独立的数据空间，名称会自动保存为 .db 文件
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className={`text-sm font-medium ${themeColors.textClass}`}>数据库名称</label>
            <input
              type="text"
              value={newDatabaseName}
              onChange={e => setNewDatabaseName(e.target.value)}
              placeholder="例如：work-notes"
              className={classNames(
                "my-4 w-full rounded-xl border px-4 py-3 outline-none transition-all",
                themeColors.inputBgClass,
                themeColors.borderClass,
                themeColors.textClass,
                themeColors.focusBorderClass,
                themeColors.focusRingClass
              )}
            />
            <p className={`text-xs ${themeColors.secondaryTextClass}`}>
              系统会自动追加 .db 后缀，如已输入则保持不变
            </p>
          </div>

          <div
            className={classNames(
              "flex items-center justify-end gap-4 border-t pt-4",
              themeColors.borderClass
            )}
          >
            <button
              type="button"
              className={classNames(
                "rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                themeColors.textClass,
                themeColors.borderClass,
                themeColors.hoverClass
              )}
              onClick={handleCreateModalCancel}
            >
              取消
            </button>
            <button
              type="button"
              className="rounded-xl bg-[var(--th-btn-bg)] px-4 py-3 text-sm font-semibold text-[var(--th-btn-text)] shadow-sm transition-colors hover:bg-[var(--th-btn-hover)]"
              onClick={handleCreateModalConfirm}
            >
              创建数据库
            </button>
          </div>
        </div>
      </CustomModal>
    </div>
  );
};

export default SelectDatabase;
