import { useEffect } from "react";
import { App } from "antd";
import { useMemoizedFn } from "ahooks";

import { connectDatabaseByName } from "@/commands";
import useSettingStore from "@/stores/useSettingStore";
import useGlobalStateStore, { DatabaseConnectionStatus } from "@/stores/useGlobalStateStore";

const useInitDatabase = () => {
  const { message } = App.useApp();

  const databaseStatus = useGlobalStateStore(state => state.databaseStatus);

  const inited = useSettingStore(state => state.inited);
  const database = useSettingStore(state => state.setting.database);

  const { active } = database;

  const handleDatabaseStatus = useMemoizedFn(
    (databaseName: string, status: DatabaseConnectionStatus) => {
      useGlobalStateStore.setState(state => ({
        databaseStatus: {
          ...state.databaseStatus,
          [databaseName]: status,
        },
      }));
    }
  );

  useEffect(() => {
    if (!inited || !active) return;
    message.open({
      type: "loading",
      content: "正在初始化数据库...",
      key: "initDatabase",
      duration: 0,
    });
    handleDatabaseStatus(active, "connecting");
    connectDatabaseByName(active)
      .then(async () => {
        message.destroy("initDatabase");
        handleDatabaseStatus(active, "ready");
      })
      .catch(e => {
        handleDatabaseStatus(active, "error");
        message.error({
          key: "initDatabase",
          content: e.message,
        });
      });
  }, [inited, active, message, handleDatabaseStatus]);

  return {
    databaseStatus,
    active,
  };
};

export default useInitDatabase;
