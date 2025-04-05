import { ITimeRecord } from "@/types";
import React from "react";
import { Card, Row } from "antd";
import StackColumnStatistic from "../StackColumnStatistic";
import ContainerCol from "@/components/ContainerCol";

interface WeekViewChartProps {
  timeRecords: ITimeRecord[];
  className?: string;
  style?: React.CSSProperties;
}

const WeekViewChart = (props: WeekViewChartProps) => {
  const { timeRecords, className, style } = props;

  return (
    <div className={className} style={style}>
      <Row gutter={[16, 16]}>
        <ContainerCol forceRefresh md={24} xl={12}>
          <Card style={{ height: "100%" }}>
            <StackColumnStatistic
              timeRecords={timeRecords}
              category={"timeType"}
            />
          </Card>
        </ContainerCol>
        <ContainerCol forceRefresh md={24} xl={12}>
          <Card style={{ height: "100%" }}>
            <StackColumnStatistic timeRecords={timeRecords} category={"date"} />
          </Card>
        </ContainerCol>
      </Row>
    </div>
  );
};

export default WeekViewChart;
