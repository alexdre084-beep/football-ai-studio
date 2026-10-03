import type { VisualProvider, SceneVisualInput, GeneratedSceneVisual, VisualMediaType } from "./types";

const imageLimitBytes = 32 * 1024 * 1024;
const videoLimitBytes = 120 * 1024 * 1024;
const jsonLimitBytes = 44 * 1024 * 1024;
const supportedMediaTypes = new Set<VisualMediaType>([
  "image/png",
  "image/jpeg",
  "image/webp",
  "video/mp4",
]);

interface HttpVisualProviderOptions {
  endpoint: string;
  name: string;
  token?: string;
}

async function readBoundedBody(response: Response, limitBytes: number): Promise<Buffer> {
  if (!response.body) throw new Error("Visual provider returned an empty response.");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > limitBytes) {
      await reader.cancel();
      throw new Error("Visual provider response exceeded the configured size limit.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, totalBytes);
}

function mediaTypeFrom(value: string | null): VisualMediaType | undefined {
  const normalized = value?.split(";")[0]?.trim().toLowerCase();
  return normalized && supportedMediaTypes.has(normalized as VisualMediaType)
    ? (normalized as VisualMediaType)
    : undefined;
}

function verifyMediaSignature(bytes: Buffer, mediaType: VisualMediaType): void {
  const isPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp =
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP";
  const isMp4 = bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp";
  const valid =
    (mediaType === "image/png" && isPng) ||
    (mediaType === "image/jpeg" && isJpeg) ||
    (mediaType === "image/webp" && isWebp) ||
    (mediaType === "video/mp4" && isMp4);
  if (!valid) throw new Error(`Visual provider returned invalid ${mediaType} data.`);
}

function parseJsonVisual(bytes: Buffer): GeneratedSceneVisual {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Visual provider returned malformed JSON.");
  }
  if (!value || typeof value !== "object") {
    throw new Error("Visual provider JSON response must be an object.");
  }

  const response = value as { mediaType?: unknown; base64?: unknown };
  const mediaType = mediaTypeFrom(
    typeof response.mediaType === "string" ? response.mediaType : null,
  );
  if (!mediaType || typeof response.base64 !== "string") {
    throw new Error("Visual provider JSON must include a supported mediaType and base64 field.");
  }
  if (
    response.base64.length === 0 ||
    response.base64.length > Math.ceil(videoLimitBytes * 4 / 3) ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(response.base64)
  ) {
    throw new Error("Visual provider returned invalid base64 media data.");
  }

  const output = Buffer.from(response.base64, "base64");
  verifyMediaSignature(output, mediaType);
  return { bytes: output, mediaType };
}

export class HttpVisualProvider implements VisualProvider {
  readonly kind = "ai" as const;
  readonly id = "http-visual-provider";
  readonly label: string;

  constructor(private readonly options: HttpVisualProviderOptions) {
    this.label = options.name.trim() || "Configured AI visual provider";
    const parsed = new URL(options.endpoint);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      throw new Error("Visual provider URL must use HTTPS, except for a local development endpoint.");
    }
  }

  async generateScene(input: SceneVisualInput): Promise<GeneratedSceneVisual> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const headers: Record<string, string> = {
        Accept: "image/png, image/jpeg, image/webp, video/mp4, application/json",
        "Content-Type": "application/json",
      };
      if (this.options.token) headers.Authorization = `Bearer ${this.options.token}`;

      const response = await fetch(this.options.endpoint, {
        method: "POST",
        headers,
        signal: controller.signal,
        cache: "no-store",
        body: JSON.stringify({
          contract: "football-ai-visual-v1",
          scene: {
            index: input.scene.index,
            title: input.scene.title,
            narration: input.scene.narration,
            visualCue: input.scene.visualCue,
            durationSeconds: input.scene.durationSeconds,
          },
          story: {
            prompt: input.storyPrompt,
            mode: input.request.mode,
            visualStyle: input.request.visualStyle,
          },
          visualPrompt: input.scene.visualPrompt,
          output: {
            width: 1280,
            height: 720,
            aspectRatio: "16:9",
            durationSeconds: input.scene.durationSeconds,
            supportedMediaTypes: [...supportedMediaTypes],
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Visual provider request failed with HTTP ${response.status}.`);
      }

      const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
      if (contentType === "application/json") {
        const bytes = await readBoundedBody(response, jsonLimitBytes);
        return parseJsonVisual(bytes);
      }

      const mediaType = mediaTypeFrom(contentType ?? null);
      if (!mediaType) {
        throw new Error(`Visual provider returned unsupported media type: ${contentType ?? "unknown"}.`);
      }
      const limit = mediaType === "video/mp4" ? videoLimitBytes : imageLimitBytes;
      const bytes = await readBoundedBody(response, limit);
      verifyMediaSignature(bytes, mediaType);
      return { bytes, mediaType };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error("Visual provider timed out while generating a scene.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}