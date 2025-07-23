import { Module } from "../types/module";
import Express from "express";
import PathUtil from "../utils/PathUtil";

class StaticServerModule implements Module {
  name: string;
  app: Express.Application;
  constructor() {
    this.name = "static-server";
    this.app = Express();
  }

  async init() {
    const appDir = PathUtil.getAppDir();
    this.app.use(Express.static(appDir));
    this.app.listen(24678, () => {
      console.log("Static server is running on port 24678");
    });
  }
}

export default new StaticServerModule();
