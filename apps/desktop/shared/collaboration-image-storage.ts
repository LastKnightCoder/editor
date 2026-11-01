export interface CollaborationImageFile {
  name: string;
  mime: string;
  bytes: Uint8Array;
}

export interface OwnerImageRequest {
  requestId: string;
  hostSession: string;
  file: CollaborationImageFile;
}

export interface OwnerImageReply {
  requestId: string;
  hostSession: string;
  reference?: string;
  error?: string;
}
