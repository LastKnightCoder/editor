import { useState } from "react";
import { Skeleton } from "antd";
import { useAsyncEffect } from "ahooks";
import CalendarHeatmap, { IItem } from '@/components/CalendarHeatmap';
import { getCalendarHeatmap } from "@/commands";

const Statistic = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<IItem[]>([]);

  useAsyncEffect(async () => {
    setLoading(true);
    const data = await getCalendarHeatmap(2025);
    // message.success('获取日历热力图数据成功');
    setData(data.map((item) => ({
      date: item.time,
      count: item.operation_list.length,
      operation_list: item.operation_list,
    })));
    setLoading(false);
  }, []);

  if (loading) return (
    <Skeleton active paragraph={{ rows: 4 }}/>
  )

  return (
    <div style={ {
      padding: 20
    } }>
      <CalendarHeatmap
        data={ data }
        year={ '2025' }
        renderTooltip={ (date, value) => {
          if (value && value.operation_list) {
            const operationList = value.operation_list;
            // 按照 operation_content_type 统计
            const operationTypeMap = new Map<string, number>();
            operationList.forEach((item: any) => {
              const key = item.operation_content_type;
              if (operationTypeMap.has(key)) {
                operationTypeMap.set(key, operationTypeMap.get(key)! + 1);
              } else {
                operationTypeMap.set(key, 1);
              }
            })
            return (
              <div>
                <div>{ date }</div>
                <ul>
                  {
                    Array.from(operationTypeMap).map(([key, value]) => (
                      <li key={ key }>{ key }: { value }</li>
                    ))
                  }
                </ul>
              </div>
            )
          } else {
            return `${ date }: 操作次数0`
          }
        } }
      />
    </div>
  )
}

export default Statistic;
