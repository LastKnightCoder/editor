import { memo, useEffect, useState } from "react";
import Titlebar from "@/components/Titlebar";
import { Breadcrumb } from "antd";
import TabsIndicator from "@/components/TabsIndicator";
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
import { createLog } from "@/commands/log";
import EditRecordModal from "@/components/EditRecordModal";

const LifeView = memo(() => {
  const navigate = useNavigate();
  const { activeTab, setActiveTab, periodType, anchorDate, setActiveLogId } =
    useLifeViewStore();

  // 初始化时间记录数据（与 TimeRecordView 同步逻辑）
  const { initData, createTimeRecord } = useTimeRecordStore(
    useShallow((s) => ({
      initData: s.init,
      createTimeRecord: s.createTimeRecord,
    })),
  );
  const isConnected = useDatabaseConnected();
  const active = useSettingStore((state) => state.setting.database.active);

  // 时间记录模态框状态
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [defaultDate, setDefaultDate] = useState<string>(
    anchorDate.format("YYYY-MM-DD"),
  );

  useEffect(() => {
    if (isConnected && active) {
      initData();
    }
  }, [isConnected, active, initData]);

  // 更新默认日期
  useEffect(() => {
    setDefaultDate(anchorDate.format("YYYY-MM-DD"));
  }, [anchorDate]);

  // 处理添加按钮点击
  const handleAdd = async () => {
    if (activeTab === "logs") {
      // 创建日志
      const start =
        periodType === "day"
          ? anchorDate.startOf("day")
          : periodType === "week"
            ? anchorDate.startOf("week")
            : periodType === "month"
              ? anchorDate.startOf("month")
              : anchorDate.startOf("year");
      const end = start.endOf(periodType).valueOf();
      const res = await createLog({
        periodType,
        startDate: start.valueOf(),
        endDate: end,
        title:
          periodType === "day"
            ? `${start.format("YYYY-MM-DD")} 日记`
            : periodType === "week"
              ? `${start.format("YYYY 第WW周")} 周记`
              : periodType === "month"
                ? `${start.format("YYYY-MM")} 月记`
                : `${start.format("YYYY")} 年记`,
        content: [
          { type: "paragraph", children: [{ type: "formatted", text: "" }] },
        ],
        tags: [],
      });
      setActiveLogId(res.id);
    } else if (activeTab === "records" && periodType === "day") {
      // 创建时间记录（只在日视图下）
      setRecordModalOpen(true);
    }
  };

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
          <div className="flex-shrink-0">
            <CalendarPanel />
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
            <TabsIndicator
              tabs={[
                { key: "logs", label: "日志" },
                { key: "records", label: "时间记录" },
              ]}
              activeTab={activeTab}
              onChange={(k) => setActiveTab(k)}
              className="flex-shrink-0"
              showAddButton
              onAdd={handleAdd}
            />
            <div className="flex-1 overflow-auto min-h-0">
              {activeTab === "logs" ? <LogList /> : <RecordList />}
            </div>
          </div>
        </div>
        <div className={styles.right}>
          {activeTab === "logs" ? <LogEditor /> : <RecordCharts />}
        </div>
      </div>

      <EditRecordModal
        key={recordModalOpen ? defaultDate : ""}
        title={"编辑记录"}
        open={recordModalOpen}
        onCancel={() => setRecordModalOpen(false)}
        timeRecord={{
          id: -1,
          content: [
            {
              type: "paragraph",
              children: [{ text: "", type: "formatted" }],
            },
          ],
          cost: 0,
          date: defaultDate,
          eventType: "",
          timeType: "",
        }}
        onOk={async (record: any) => {
          await createTimeRecord(record);
          setRecordModalOpen(false);
        }}
      />
    </div>
  );
});

export default LifeView;
