import type { RenderRequest, RenderScene } from "@workspace/api-zod";

export type VisualMediaType =
  | "image/svg+xml"
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "video/mp4";

export type VisualAssetType = "image" | "video";

export interface SceneVisualInput {
  request: RenderRequest;
  storyPrompt: string;
  scene: RenderScene;
}

export interface GeneratedSceneVisual {
  bytes: Uint8Array;
  mediaType: VisualMediaType;
}

export interface VisualProvider {
  readonly kind: "local" | "ai";
  readonly id: string;
  readonly label: string;
  generateScene(input: SceneVisualInput): Promise<GeneratedSceneVisual>;
}

export function visualAssetType(mediaType: VisualMediaType): VisualAssetType {
  return mediaType === "video/mp4" ? "video" : "image";
}

export function fileExtensionForVisual(mediaType: VisualMediaType): string {
  switch (mediaType) {
    case "image/svg+xml":
      return "svg";
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "video/mp4":
      return "mp4";
  }
}