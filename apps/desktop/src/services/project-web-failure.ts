import diagnostics from "./project-web-diagnostics.json";
export class ProjectWebFailure extends Error {
  constructor(readonly code: keyof typeof diagnostics) {
    super(diagnostics[code]);
  }
}
