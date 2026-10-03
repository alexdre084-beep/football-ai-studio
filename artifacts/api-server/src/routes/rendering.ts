import { access } from "node:fs/promises";
import { Router, type IRouter } from "express";
import {
  CreateRenderJobBody,
  CreateRenderJobResponse,
  GetRenderStatusParams,
  GetRenderStatusResponse,
} from "@workspace/api-zod";
import {
  activeRenderCount,
  createRenderJob,
  getRenderJob,
  getRenderVideoPath,
} from "../lib/video-pipeline";

const router: IRouter = Router();
const maxActiveRenders = 2;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.post("/renders", (req, res): void => {
  const parsed = CreateRenderJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (activeRenderCount() >= maxActiveRenders) {
    res.status(429).json({ error: "Two local renders are already in progress. Try again shortly." });
    return;
  }

  const job = createRenderJob(parsed.data);
  req.log.info({ renderId: job.id, mode: job.mode, durationSeconds: job.durationSeconds }, "Started local football video render");
  res.status(202).json(CreateRenderJobResponse.parse(job));
});

router.get("/renders/:renderId", (req, res): void => {
  const params = GetRenderStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const job = getRenderJob(params.data.renderId);
  if (!job) {
    res.status(404).json({ error: "Render job not found. Start a new render to create another video." });
    return;
  }

  res.json(GetRenderStatusResponse.parse(job));
});

router.get("/renders/:renderId/video", async (req, res): Promise<void> => {
  const params = GetRenderStatusParams.safeParse(req.params);
  if (!params.success || !uuidPattern.test(String(req.params.renderId))) {
    res.status(400).json({ error: "Invalid render ID." });
    return;
  }

  const job = getRenderJob(params.data.renderId);
  if (!job || job.status !== "complete" || !job.videoUrl) {
    res.status(404).json({ error: "No verified MP4 is available for this render." });
    return;
  }

  const videoPath = getRenderVideoPath(params.data.renderId);
  try {
    await access(videoPath);
  } catch {
    res.status(404).json({ error: "The rendered MP4 is no longer available on this server." });
    return;
  }

  res.type("video/mp4");
  res.setHeader("Content-Disposition", `inline; filename="football-ai-${params.data.renderId.slice(0, 8)}.mp4"`);
  res.sendFile(videoPath, (error) => {
    if (error && !res.headersSent) {
      req.log.error({ err: error, renderId: params.data.renderId }, "Failed to serve rendered football video");
      res.status(500).json({ error: "The rendered MP4 could not be served." });
    }
  });
});

export default router;