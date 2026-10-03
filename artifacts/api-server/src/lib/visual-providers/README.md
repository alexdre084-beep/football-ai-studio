# Football scene visual providers

The render pipeline depends on the `VisualProvider` interface, not a vendor SDK. Each provider receives a distinct, story-aware prompt for one scene and returns verified local media bytes. The renderer accepts still images (PNG, JPEG, WebP, and the built-in SVG fallback) or MP4 clips.

## Connect a provider without changing the renderer or web app

Configure a small HTTP adapter/gateway that implements the `football-ai-visual-v1` contract, then set these environment variables on the API server:

- `FOOTBALL_VISUAL_PROVIDER_URL`: HTTPS endpoint that accepts one scene-generation request per POST.
- `FOOTBALL_VISUAL_PROVIDER_NAME`: optional display name shown with successfully returned scene visuals.
- `FOOTBALL_VISUAL_PROVIDER_TOKEN`: optional bearer token; store it as a Replit Secret, never in source code.

When the URL is absent, the local SVG provider is selected automatically. Adding or changing these runtime settings does not require frontend changes. Restart the API service to load changed environment settings.

### Request

The server sends JSON with:

- `contract`: `football-ai-visual-v1`
- `scene`: index, title, narration, cue, and duration for this scene
- `story`: the user's story, creation mode, and selected visual style
- `visualPrompt`: the complete, scene-specific image/video prompt
- `output`: 1280×720, 16:9, target scene duration, and supported media types

The endpoint should generate a unique asset for each POST. Prompts cover story and character continuity, football action, stadium setting, camera angle, lighting, and emotion.

### Response

Return media bytes directly with one of these content types:

- `image/png`
- `image/jpeg`
- `image/webp`
- `video/mp4`

Alternatively return JSON containing `mediaType` and a standard base64-encoded `base64` field. Remote media URLs are intentionally not fetched. The API checks the media signature and rejects unsupported, malformed, empty, oversized, timed-out, or unsuccessful responses. A scene is labeled as provider-generated only after valid bytes are returned and saved; provider errors fail the render rather than being silently relabeled as AI output.

Images are held for their scene duration; MP4 clips are looped or trimmed to fit. The existing FFmpeg audio mix and final MP4 verification remain unchanged.