import { memo, useEffect, useMemo, useState } from "react";
import { Button, Flex, List, Typography } from "antd";
import { useLifeViewStore } from "@/stores/useLifeViewStore";
import { createLog, getLogsByRange, LogEntry } from "@/commands/log";
import Editor from "@/components/Editor";

const LogList = memo(() => {
  const { periodType, anchorDate, setActiveLogId } = useLifeViewStore();
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const range = useMemo(() => {
    if (periodType === "day") {
      const s = anchorDate.startOf("day");
      return {
        start: s.valueOf(),
        end: s.endOf("day").valueOf(),
        types: ["day"] as const,
      };
    } else if (periodType === "week") {
      const s = anchorDate.startOf("week");
      const e = anchorDate.endOf("week");
      return {
        start: s.valueOf(),
        end: e.valueOf(),
        types: ["day", "week"] as const,
      };
    } else if (periodType === "month") {
      const s = anchorDate.startOf("month");
      const e = anchorDate.endOf("month");
      return {
        start: s.valueOf(),
        end: e.valueOf(),
        types: ["week", "month"] as const,
      };
    } else {
      const s = anchorDate.startOf("year");
      const e = anchorDate.endOf("year");
      return {
        start: s.valueOf(),
        end: e.valueOf(),
        types: ["month", "year"] as const,
      };
    }
  }, [periodType, anchorDate]);

  useEffect(() => {
    getLogsByRange({
      startDate: range.start,
      endDate: range.end,
      periodTypes: range.types as any,
    }).then(setLogs);
  }, [range.start, range.end, periodType]);

  const onCreate = async () => {
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
    // 刷新
    const newLogs = await getLogsByRange({
      startDate: range.start,
      endDate: range.end,
      periodTypes: range.types as any,
    });
    setLogs(newLogs);
  };

  return (
    <Flex
      vertical
      gap={8}
      style={{ width: "100%", height: "100%", overflow: "hidden" }}
    >
      <Button type="primary" onClick={onCreate}>
        新建
        {periodType === "day"
          ? "日记"
          : periodType === "week"
            ? "周记"
            : periodType === "month"
              ? "月记"
              : "年记"}
      </Button>
      <div style={{ flex: 1, overflow: "auto" }}>
        <List
          dataSource={logs}
          renderItem={(item) => (
            <List.Item
              style={{ cursor: "pointer" }}
              onClick={() => setActiveLogId(item.id)}
            >
              <List.Item.Meta
                title={
                  <Typography.Text strong ellipsis>
                    {item.title || "未命名"}
                  </Typography.Text>
                }
                description={
                  <div style={{ maxWidth: 480 }}>
                    <Editor readonly initValue={item.content.slice(0, 1)} />
                  </div>
                }
              />
            </List.Item>
          )}
        />
      </div>
    </Flex>
  );
});

export default LogList;
