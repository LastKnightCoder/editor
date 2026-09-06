// 真实 DatabaseModule 在模块顶层实例化，会反向加载全部表模块形成循环依赖，
// 且依赖 electron 运行时；测试只需这些模块可被加载，不需要真实单例。
const databaseModule: any = new Proxy(
  {},
  {
    get: () => () => {
      throw new Error("databaseModule 在测试环境中不可用");
    },
  }
);

export default databaseModule;
