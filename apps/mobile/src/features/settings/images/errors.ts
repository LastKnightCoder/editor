export class ImageAccountFieldsError extends Error {
  readonly code = "IMAGE_ACCOUNT_FIELDS_REQUIRED";
  constructor() {
    super("请填写账号名称和图片模型 ID");
    this.name = "ImageAccountFieldsError";
  }
}
