import { ITimeRecord } from "@/types";
import React from "react";
import { Card, Col, Row } from "antd";
import StackColumnStatistic from "../StackColumnStatistic";
// import LineStatistic from "../LineStatistic";

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
        <Col sm={24} md={24} xxl={12}>
          <Card style={{ height: '100%'  }}>
            <StackColumnStatistic timeRecords={timeRecords} category={'timeType'} />
          </Card>
        </Col>
        <Col sm={24} md={24} xxl={12}>
          <Card style={{ height: '100%'  }}>
            <StackColumnStatistic timeRecords={timeRecords} category={'date'} />
          </Card>
        </Col>
        {/*<Col sm={24} md={24} xxl={12}>*/}
        {/*  <Card style={{ height: '100%'  }}>*/}
        {/*    <LineStatistic timeRecords={timeRecords} />*/}
        {/*  </Card>*/}
        {/*</Col>*/}
      </Row>
    </div>
  )
}

export default WeekViewChart;
