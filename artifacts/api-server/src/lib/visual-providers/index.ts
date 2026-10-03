import { HttpVisualProvider } from "./http";
import { localSvgVisualProvider } from "./local-svg";
import type { VisualProvider } from "./types";

export function createVisualProvider(): VisualProvider {
  const endpoint = process.env.FOOTBALL_VISUAL_PROVIDER_URL?.trim();
  if (!endpoint) return localSvgVisualProvider;

  return new HttpVisualProvider({
    endpoint,
    name: process.env.FOOTBALL_VISUAL_PROVIDER_NAME ?? "Configured AI visual provider",
    token: process.env.FOOTBALL_VISUAL_PROVIDER_TOKEN,
  });
}

export type {
  GeneratedSceneVisual,
  SceneVisualInput,
  VisualAssetType,
  VisualMediaType,
  VisualProvider,
} from "./types";
export { fileExtensionForVisual, visualAssetType } from "./types";