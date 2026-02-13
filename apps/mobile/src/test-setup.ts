// React 组件测试需要声明 act 环境，避免测试输出噪声告警。
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
