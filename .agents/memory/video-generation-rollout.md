---
name: Video generation rollout
description: The product's intended transition from a frontend sample generator to real AI video rendering.
---

The baseline must render a real downloadable MP4 locally; a sample-only concept flow is not sufficient. Keep local SVG visuals, Spanish/offline narration, synthesized soundtrack, and FFmpeg encoding usable without a provider. Visual providers belong behind a modular server-side interface and should be switchable through runtime configuration without frontend changes. Each scene needs its own detailed story-aware prompt. Label visuals as provider-generated only after a configured provider returns valid, decodable media; configured-provider failures must remain explicit rather than being mislabeled as AI output.

**Why:** the user wants unique provider-generated football visuals when a provider is connected, while retaining the current local fallback and avoiding unsupported claims about AI output.

**How to apply:** Keep visual prompts, provider adapters, local fallback, audio, and FFmpeg encoding independent. Identify the actual source per scene, preserve Spanish narration and music options, and mark a job complete only after FFmpeg succeeds and the exported MP4 is checked; otherwise show an explicit failure and no download link.