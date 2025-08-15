import { memo, useEffect } from "react";
import Titlebar from "@/components/Titlebar";
import { Breadcrumb, Tabs } from "antd";
import styles from "./index.module.less";
import { useNavigate } from "react-router-dom";
import CalendarPanel from "./components/CalendarPanel";
import RecordList from "./components/TimeTabs/RecordList";
import LogList from "./components/TimeTabs/LogList";
import { useLifeViewStore } from "@/stores/useLifeViewStore";
import RecordCharts from "./components/Right/RecordCharts";
import LogEditor from "./components/Right/LogEditor";
import { useShallow } from "zustand/react/shallow";
import useTimeRecordStore from "@/stores/useTimeRecordStore";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSettingStore from "@/stores/useSettingStore";

const LifeView = memo(() => {
  const navigate = useNavigate();
  const { activeTab, setActiveTab } = useLifeViewStore();

  // 初始化时间记录数据（与 TimeRecordView 同步逻辑）
  const { initData } = useTimeRecordStore(
    useShallow((s) => ({ initData: s.init })),
  );
  const isConnected = useDatabaseConnected();
  const active = useSettingStore((state) => state.setting.database.active);

  useEffect(() => {
    if (isConnected && active) {
      initData();
    }
  }, [isConnected, active, initData]);

  const breadcrumbItems = [
    { title: "首页", path: "/" },
    { title: "生活", path: "/life" },
  ];

  return (
    <div className={styles.container}>
      <Titlebar className={styles.titlebar}>
        <Breadcrumb
          className={styles.breadcrumb}
          items={breadcrumbItems.map((item) => ({
            title: (
              <span
                className={styles.breadcrumbItem}
                onClick={() => navigate(item.path)}
              >
                {item.title}
              </span>
            ),
          }))}
        />
      </Titlebar>
      <div className={styles.content}>
        <div className={styles.sidebar}>
          <CalendarPanel />
          <Tabs
            activeKey={activeTab}
            onChange={(k) => setActiveTab(k as any)}
            items={[
              { key: "records", label: "时间记录", children: <RecordList /> },
              { key: "logs", label: "日志", children: <LogList /> },
            ]}
          />
        </div>
        <div className={styles.right}>
          {activeTab === "records" ? <RecordCharts /> : <LogEditor />}
        </div>
      </div>
    </div>
  );
});

export default LifeView;
