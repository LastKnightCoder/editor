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
    this.app.use(
      Express.static(appDir, {
        setHeaders: (res) => {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader(
            "Access-Control-Allow-Methods",
            "GET, POST, PUT, DELETE, OPTIONS",
          );
          res.setHeader(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization",
          );
        },
      }),
    );
    this.app.listen(24678, () => {
      console.log("Static server is running on port 24678");
    });
  }
}

export default new StaticServerModule();
