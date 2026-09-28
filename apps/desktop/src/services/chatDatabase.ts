/** 当前视图所属的库；运行中的会话必须捕获该值，不能在异步回调里重新定位。 */
let databaseName = "";
export const getChatDatabase = () => databaseName;
export const setChatDatabase = (name: string) => {
  databaseName = name.replace(/\.db$/, "");
};
export const chatIdentity = (id: string, database = databaseName) => JSON.stringify([database, id]);
