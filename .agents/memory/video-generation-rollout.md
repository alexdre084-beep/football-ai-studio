---
name: Video generation rollout
description: The product's intended transition from a frontend sample generator to real AI video rendering.
---

The baseline must render a real downloadable MP4 locally; a sample-only concept flow is not sufficient. Keep the script and four-scene plan, original SVG scene artwork, offline narration, synthesized soundtrack, and FFmpeg encoding usable without a paid provider or API key. Clearly label these local templates rather than implying they are AI image/video-provider output. Paid or hosted generation providers remain a separate future integration.

**Why:** the user asked to replace the simulated concept flow with a working local/free render pipeline and to separate any later paid services or API keys.

**How to apply:** Keep progress tied to actual script, visual, audio, encode, and verification work. Mark a job complete only after FFmpeg succeeds and the exported MP4 is checked; otherwise show an explicit failure and no download link.