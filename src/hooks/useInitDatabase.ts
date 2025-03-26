import { useEffect } from "react";
import { App } from "antd";
import { useMemoizedFn } from "ahooks";
import { produce } from "immer";

import { connectDatabaseByName } from "@/commands";
import useSettingStore from "@/stores/useSettingStore.ts";
import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";

const useInitDatabase = () => {
  const { message } = App.useApp();

  const { databaseStatus } = useGlobalStateStore((state) => ({
    databaseStatus: state.databaseStatus,
  }));

  const { inited, database } = useSettingStore((state) => ({
    inited: state.inited,
    database: state.setting.database,
  }));

  const { active } = database;

  const handleDatabaseStatus = useMemoizedFn(
    (databaseName: string, status: boolean) => {
      const newDatabaseStatus = produce(databaseStatus, (draft) => {
        draft[databaseName] = status;
      });
      useGlobalStateStore.setState({
        databaseStatus: newDatabaseStatus,
      });
    },
  );

  useEffect(() => {
    if (!inited || !active) return;
    message.open({
      type: "loading",
      content: "正在初始化数据库...",
      key: "initDatabase",
      duration: 0,
    });
    handleDatabaseStatus(active, false);
    connectDatabaseByName(active)
      .then(() => {
        message.destroy("initDatabase");
        handleDatabaseStatus(active, true);
      })
      .catch((e) => {
        message.error({
          key: "initDatabase",
          content: e.message,
        });
      });
  }, [inited, active, message, handleDatabaseStatus]);

  return {
    databaseStatus,
  };
};

export default useInitDatabase;
