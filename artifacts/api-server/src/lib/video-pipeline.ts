import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  RenderJob,
  RenderRequest,
  RenderScene,
  RenderStep,
} from "@workspace/api-zod";
import { logger } from "./logger";
import { buildSceneVisualPrompt } from "./visual-providers/prompts";
import {
  createVisualProvider,
  fileExtensionForVisual,
  visualAssetType,
  type VisualMediaType,
} from "./visual-providers";

const renderRoot = join(tmpdir(), "football-ai-creator-renders");
const jobs = new Map<string, RenderJob>();
const fps = 24;
const width = 1280;
const height = 720;

const stepDefinitions: Pick<RenderStep, "id" | "label">[] = [
  { id: "script", label: "Script and scene plan" },
  { id: "visuals", label: "Generate scene visuals" },
  { id: "narration", label: "Synthesize narration" },
  { id: "music", label: "Compose background music" },
  { id: "encoding", label: "Combine and encode with FFmpeg" },
  { id: "export", label: "Verify and export MP4" },
];

const languageMap: Record<RenderRequest["language"], string> = {
  English: "en-us",
  Spanish: "es",
  French: "fr-fr",
  German: "de",
  Italian: "it",
  Portuguese: "pt-br",
};

const localizedScript: Record<
  RenderRequest["language"],
  { scenes: [string, string, string, string]; promptLead: string; details: string[] }
> = {
  English: {
    scenes: [
      "Under the stadium lights, the moment begins.",
      "Every pass brings the turning point closer.",
      "One brave touch opens the path to history.",
      "The shot finds its mark. The whole ground erupts.",
    ],
    promptLead: "Tonight, the story belongs to",
    details: [
      "The crowd rises as the tempo builds.",
      "Every movement carries the weight of the occasion.",
      "For one suspended second, the entire stadium holds its breath.",
    ],
  },
  Spanish: {
    scenes: [
      "Bajo las luces del estadio, comienza el momento.",
      "Cada pase acerca el instante decisivo.",
      "Un toque valiente abre el camino a la historia.",
      "El disparo llega a su destino. El estadio estalla.",
    ],
    promptLead: "Esta noche, la historia pertenece a",
    details: [
      "La grada se levanta mientras crece el ritmo.",
      "Cada movimiento refleja la importancia del momento.",
      "Por un segundo, todo el estadio contiene la respiración.",
    ],
  },
  French: {
    scenes: [
      "Sous les lumières du stade, le moment commence.",
      "Chaque passe rapproche l'instant décisif.",
      "Un geste courageux ouvre la voie à l'histoire.",
      "Le tir trouve sa cible. Le stade explose.",
    ],
    promptLead: "Ce soir, l'histoire appartient à",
    details: [
      "Les tribunes se lèvent, le rythme s'accélère.",
      "Chaque mouvement porte le poids de l'enjeu.",
      "Pendant une seconde, tout le stade retient son souffle.",
    ],
  },
  German: {
    scenes: [
      "Unter den Flutlichtern beginnt dieser Moment.",
      "Jeder Pass bringt den Wendepunkt näher.",
      "Ein mutiger Kontakt öffnet den Weg zur Geschichte.",
      "Der Schuss sitzt. Das ganze Stadion bebt.",
    ],
    promptLead: "Heute Abend gehört die Geschichte",
    details: [
      "Die Ränge erheben sich, das Tempo steigt.",
      "Jede Bewegung trägt das Gewicht des Augenblicks.",
      "Für einen Moment hält das ganze Stadion den Atem an.",
    ],
  },
  Italian: {
    scenes: [
      "Sotto le luci dello stadio, il momento ha inizio.",
      "Ogni passaggio avvicina l'istante decisivo.",
      "Un tocco coraggioso apre la strada alla storia.",
      "Il tiro va a segno. Lo stadio esplode.",
    ],
    promptLead: "Questa sera, la storia appartiene a",
    details: [
      "La curva si alza mentre il ritmo cresce.",
      "Ogni movimento racconta il peso della partita.",
      "Per un istante, tutto lo stadio trattiene il respiro.",
    ],
  },
  Portuguese: {
    scenes: [
      "Sob as luzes do estádio, o momento começa.",
      "Cada passe aproxima o instante decisivo.",
      "Um toque corajoso abre caminho para a história.",
      "O chute encontra o alvo. O estádio explode.",
    ],
    promptLead: "Esta noite, a história pertence a",
    details: [
      "A torcida se levanta enquanto o ritmo aumenta.",
      "Cada movimento carrega o peso da ocasião.",
      "Por um segundo, o estádio inteiro prende a respiração.",
    ],
  },
};

const musicExpressions: Record<Exclude<RenderRequest["music"], "No music">, string> = {
  "Stadium pulse":
    "0.11*sin(2*PI*55*t)*(0.7+0.3*sin(2*PI*1.25*t))+0.045*sin(2*PI*82.41*t)+0.022*sin(2*PI*110*t)+0.014*sin(2*PI*220*t)",
  "Epic orchestral":
    "0.075*sin(2*PI*55*t)+0.045*sin(2*PI*82.41*t)+0.04*sin(2*PI*110*t)+0.028*sin(2*PI*164.81*t)+0.018*sin(2*PI*220*t)+0.012*sin(2*PI*329.63*t)",
  "Electric tension":
    "0.065*sin(2*PI*55*t)+0.054*sin(2*PI*58.27*t)+0.032*sin(2*PI*110*t)+0.024*sin(2*PI*116.54*t)+0.018*sin(2*PI*233.08*t)",
  "Acoustic reflection":
    "0.05*sin(2*PI*130.81*t)+0.035*sin(2*PI*164.81*t)+0.04*sin(2*PI*196*t)+0.024*sin(2*PI*261.63*t)+0.014*sin(2*PI*329.63*t)",
};

function titleFromPrompt(prompt: string): string {
  const clean = prompt.trim().replace(/[.!?]+$/, "");
  const title = clean.length > 54 ? `${clean.slice(0, 51).trimEnd()}…` : clean;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function clipPrompt(prompt: string, maxWords: number): string {
  const words = prompt.trim().replace(/\s+/g, " ").split(" ");
  const clipped = words.slice(0, maxWords).join(" ");
  return words.length > maxWords ? `${clipped}…` : clipped.replace(/[.!?]+$/, "");
}

function makeScenes(request: RenderRequest): { script: string; scenes: RenderScene[] } {
  const localized = localizedScript[request.language];
  const durationPerScene = request.durationSeconds / 4;
  const promptWordLimit = Math.max(6, Math.floor(request.durationSeconds * 0.48));
  const promptSummary = clipPrompt(request.prompt, promptWordLimit);
  const lines = [...localized.scenes];

  if (request.durationSeconds >= 30) {
    lines[1] = `${lines[1]} ${localized.details[0]}`;
  }
  if (request.durationSeconds >= 45) {
    lines[2] = `${lines[2]} ${localized.details[1]}`;
  }
  if (request.durationSeconds >= 60) {
    lines[3] = `${lines[3]} ${localized.details[2]}`;
  }

  const narration = lines.map((line, index) =>
    index === 1 ? `${localized.promptLead} ${promptSummary}. ${line}` : line,
  );
  const visualCues = [
    "Establish the story's venue, teams, and central figures",
    "Build the match action around the story's central players",
    "Show the defining football play described in the story",
    "Show the result and emotional response described in the story",
  ];
  const titles = ["THE OPENING", "THE BUILD-UP", "THE MOMENT", "THE ROAR"];
  const scenes: RenderScene[] = narration.map((line, index) => ({
    index: index + 1,
    title: titles[index],
    narration: line,
    visualCue: visualCues[index],
    visualPrompt: "",
    visualSource: "pending",
    visualProvider: null,
    visualAssetType: null,
    durationSeconds: durationPerScene,
  }));

  return {
    script: narration.join("\n\n"),
    scenes: scenes.map((scene) => ({
      ...scene,
      visualPrompt: buildSceneVisualPrompt(request, scene),
    })),
  };
}

function runCommand(command: string, args: string[], input?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-5000);
    });
    child.once("error", (error) => reject(error));
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${String(code)}: ${stderr.trim()}`));
    });
    child.stdin.end(input);
  });
}

function initialSteps(): RenderStep[] {
  return stepDefinitions.map((definition) => ({
    ...definition,
    state: "queued",
    detail: "Waiting",
  }));
}

function patchJob(id: string, patch: Partial<RenderJob>): void {
  const current = jobs.get(id);
  if (current) jobs.set(id, { ...current, ...patch });
}

function patchStep(id: string, stepId: string, state: RenderStep["state"], detail: string): void {
  const current = jobs.get(id);
  if (!current) return;
  patchJob(id, {
    steps: current.steps.map((step) =>
      step.id === stepId ? { ...step, state, detail } : step,
    ),
  });
}

function beginStep(id: string, stepId: string, progress: number, message: string): void {
  const stage = stepDefinitions.find((step) => step.id === stepId)?.id;
  patchJob(id, {
    status: "processing",
    progress,
    stage: (stage ?? "script") as RenderJob["stage"],
    message,
  });
  patchStep(id, stepId, "processing", message);
}

function finishStep(id: string, stepId: string, detail: string): void {
  patchStep(id, stepId, "complete", detail);
}

function musicSource(music: Exclude<RenderRequest["music"], "No music">, duration: number): string {
  return `aevalsrc=${musicExpressions[music]}:s=44100:d=${duration}`;
}

function narratorSettings(voice: RenderRequest["voice"]): { speed: number; pitch: number } {
  if (voice === "Jordan · Cinematic") return { speed: 146, pitch: 38 };
  if (voice === "Sam · Calm") return { speed: 134, pitch: 46 };
  return { speed: 178, pitch: 58 };
}

interface SceneFile {
  path: string;
  mediaType: VisualMediaType;
}

function buildEncodeArgs(
  request: RenderRequest,
  scenes: RenderScene[],
  sceneFiles: SceneFile[],
  narrationPath: string | null,
  musicPath: string | null,
  outputPath: string,
): string[] {
  const args = ["-hide_banner", "-loglevel", "error", "-y"];

  for (let index = 0; index < scenes.length; index += 1) {
    if (sceneFiles[index].mediaType === "video/mp4") {
      args.push("-stream_loop", "-1", "-i", sceneFiles[index].path);
    } else {
      args.push(
        "-loop",
        "1",
        "-framerate",
        String(fps),
        "-t",
        scenes[index].durationSeconds.toFixed(3),
        "-i",
        sceneFiles[index].path,
      );
    }
  }

  const narrationIndex = narrationPath ? scenes.length : -1;
  if (narrationPath) args.push("-i", narrationPath);
  const musicIndex = musicPath ? scenes.length + (narrationPath ? 1 : 0) : -1;
  if (musicPath) args.push("-i", musicPath);

  const videoFilters = scenes.map((scene, index) => {
    const fadeOutAt = Math.max(0, scene.durationSeconds - 0.22);
    const videoSourceFilters =
      sceneFiles[index].mediaType === "video/mp4"
        ? `fps=${fps},trim=duration=${scene.durationSeconds.toFixed(3)},setpts=PTS-STARTPTS,`
        : "";
    return `[${index}:v]${videoSourceFilters}scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,zoompan=z='min(zoom+0.0007,1.045)':d=1:s=${width}x${height}:fps=${fps},fade=t=in:st=0:d=0.22,fade=t=out:st=${fadeOutAt.toFixed(3)}:d=0.22,format=yuv420p[v${index}]`;
  });
  const videoInputs = scenes.map((_, index) => `[v${index}]`).join("");
  videoFilters.push(`${videoInputs}concat=n=${scenes.length}:v=1:a=0[video]`);

  let audioMap = "";
  if (narrationIndex >= 0 && musicIndex >= 0) {
    videoFilters.push(
      `[${narrationIndex}:a]aresample=44100,volume=0.92,apad,atrim=duration=${request.durationSeconds}[voice]`,
      `[${musicIndex}:a]aresample=44100,volume=0.28,apad,atrim=duration=${request.durationSeconds}[score]`,
      "[voice][score]amix=inputs=2:duration=longest:dropout_transition=1,alimiter=limit=0.92[audio]",
    );
    audioMap = "[audio]";
  } else if (narrationIndex >= 0) {
    videoFilters.push(
      `[${narrationIndex}:a]aresample=44100,apad,atrim=duration=${request.durationSeconds},alimiter=limit=0.92[audio]`,
    );
    audioMap = "[audio]";
  } else if (musicIndex >= 0) {
    videoFilters.push(
      `[${musicIndex}:a]aresample=44100,volume=0.48,apad,atrim=duration=${request.durationSeconds},alimiter=limit=0.92[audio]`,
    );
    audioMap = "[audio]";
  } else {
    const silenceIndex = scenes.length;
    args.push(
      "-f",
      "lavfi",
      "-t",
      String(request.durationSeconds),
      "-i",
      "anullsrc=r=44100:cl=stereo",
    );
    videoFilters.push(`[${silenceIndex}:a]atrim=duration=${request.durationSeconds}[audio]`);
    audioMap = "[audio]";
  }

  args.push(
    "-filter_complex",
    videoFilters.join(";"),
    "-map",
    "[video]",
    "-map",
    audioMap,
    "-t",
    String(request.durationSeconds),
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(fps),
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    outputPath,
  );
  return args;
}

async function render(job: RenderJob, request: RenderRequest): Promise<void> {
  const workDir = join(renderRoot, job.id);
  const sceneFiles: SceneFile[] = [];
  let currentStep = "script";

  try {
    await mkdir(workDir, { recursive: true });
    beginStep(job.id, "script", 5, "Writing the script and dividing it into four scenes.");
    const { script, scenes } = makeScenes(request);
    patchJob(job.id, { script, scenes, title: titleFromPrompt(request.prompt) });
    finishStep(job.id, "script", `${scenes.length} scenes planned in ${request.language}.`);

    currentStep = "visuals";
    const visualProvider = createVisualProvider();
    beginStep(
      job.id,
      "visuals",
      19,
      visualProvider.kind === "ai"
        ? `Requesting a unique visual for each scene from ${visualProvider.label}.`
        : "No AI visual provider is configured. Using the local SVG fallback.",
    );
    for (const scene of scenes) {
      const visual = await visualProvider.generateScene({ request, storyPrompt: request.prompt, scene });
      if (visual.bytes.byteLength === 0) {
        throw new Error(`Visual provider returned an empty asset for scene ${scene.index}.`);
      }
      const scenePath = join(
        workDir,
        `scene-${scene.index}.${fileExtensionForVisual(visual.mediaType)}`,
      );
      await writeFile(scenePath, visual.bytes);
      if (visualProvider.kind === "ai") {
        await runCommand("ffmpeg", [
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          scenePath,
          "-frames:v",
          "1",
          "-f",
          "null",
          "-",
        ]);
      }
      sceneFiles.push({ path: scenePath, mediaType: visual.mediaType });
      const assetType = visualAssetType(visual.mediaType);
      const visualSource = visualProvider.kind === "ai" ? "ai-provider" : "local-template";
      const completedScene: RenderScene = {
        ...scene,
        visualSource,
        visualProvider: visualProvider.kind === "ai" ? visualProvider.label : null,
        visualAssetType: assetType,
      };
      const currentScenes = jobs.get(job.id)?.scenes ?? scenes;
      patchJob(job.id, {
        scenes: currentScenes.map((current) =>
          current.index === completedScene.index ? completedScene : current,
        ),
        progress: 19 + Math.round((scene.index / scenes.length) * 15),
        message:
          visualProvider.kind === "ai"
            ? `Scene ${scene.index} of ${scenes.length} received a verified ${assetType} from ${visualProvider.label}.`
            : `Scene ${scene.index} of ${scenes.length} is ready from the local SVG fallback.`,
      });
      patchStep(
        job.id,
        "visuals",
        "processing",
        visualProvider.kind === "ai"
          ? `Scene ${scene.index}/${scenes.length}: verified ${assetType} from ${visualProvider.label}.`
          : `Scene ${scene.index}/${scenes.length}: local SVG fallback created.`,
      );
    }
    finishStep(
      job.id,
      "visuals",
      visualProvider.kind === "ai"
        ? `${sceneFiles.length} scene visuals returned and verified by ${visualProvider.label}.`
        : `No AI provider configured; ${sceneFiles.length} local SVG fallback visuals created.`,
    );

    let narrationPath: string | null = null;
    currentStep = "narration";
    if (request.voice === "No narration") {
      patchStep(job.id, "narration", "skipped", "No narration selected.");
    } else {
      beginStep(job.id, "narration", 37, "Synthesizing an offline narrator track with eSpeak NG.");
      narrationPath = join(workDir, "narration.wav");
      const speaker = narratorSettings(request.voice);
      await runCommand(
        "espeak-ng",
        [
          "-v",
          languageMap[request.language],
          "-s",
          String(speaker.speed),
          "-p",
          String(speaker.pitch),
          "-w",
          narrationPath,
          "--stdin",
        ],
        script,
      );
      finishStep(job.id, "narration", `Offline ${request.language} narration created.`);
    }

    let musicPath: string | null = null;
    currentStep = "music";
    if (request.music === "No music") {
      patchStep(job.id, "music", "skipped", "No background music selected.");
    } else {
      beginStep(job.id, "music", 54, `Composing a local ${request.music.toLowerCase()} score.`);
      musicPath = join(workDir, "music.wav");
      const musicDuration = request.durationSeconds;
      const fadeOut = Math.max(1, musicDuration - 1.5);
      await runCommand("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        musicSource(request.music, musicDuration),
        "-af",
        `afade=t=in:st=0:d=1,afade=t=out:st=${fadeOut}:d=1.5,alimiter=limit=0.82`,
        "-c:a",
        "pcm_s16le",
        musicPath,
      ]);
      finishStep(job.id, "music", "A generated instrumental track is ready to mix.");
    }

    currentStep = "encoding";
    beginStep(job.id, "encoding", 70, "Combining visuals and audio, then encoding H.264 video with FFmpeg.");
    const outputPath = join(workDir, "football-ai-creator.mp4");
    await runCommand(
      "ffmpeg",
      buildEncodeArgs(request, scenes, sceneFiles, narrationPath, musicPath, outputPath),
    );
    finishStep(job.id, "encoding", "FFmpeg combined the scenes, voice, and soundtrack.");

    currentStep = "export";
    beginStep(job.id, "export", 96, "Checking the finished MP4 before making it available.");
    const outputStat = await stat(outputPath);
    if (outputStat.size < 16_000) {
      throw new Error("FFmpeg completed but the MP4 file is unexpectedly small.");
    }
    await runCommand("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,width,height",
      "-of",
      "csv=p=0",
      outputPath,
    ]);
    finishStep(job.id, "export", `Verified MP4 · ${(outputStat.size / 1_048_576).toFixed(1)} MB.`);
    const completed = jobs.get(job.id);
    patchJob(job.id, {
      status: "complete",
      progress: 100,
      stage: "done",
      message: "The MP4 is rendered and ready to preview or download.",
      videoUrl: `/api/renders/${job.id}/video`,
      error: null,
      steps: (completed?.steps ?? []).map((step) =>
        step.id === "export" ? { ...step, state: "complete", detail: "MP4 file verified." } : step,
      ),
    });
    logger.info(
      {
        renderId: job.id,
        sizeBytes: outputStat.size,
        durationSeconds: request.durationSeconds,
        visualProvider: visualProvider.kind === "ai" ? visualProvider.label : "local-svg-template",
      },
      "Football video render completed",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown render failure.";
    const completed = jobs.get(job.id);
    patchStep(job.id, currentStep, "failed", message.slice(0, 500));
    patchJob(job.id, {
      status: "failed",
      stage: "error",
      progress: 100,
      message: "The video could not be rendered. No MP4 was exported.",
      error: message.slice(0, 1000),
      videoUrl: null,
      steps: (completed?.steps ?? []).map((step) =>
        step.id === currentStep ? { ...step, state: "failed", detail: message.slice(0, 500) } : step,
      ),
    });
    logger.error({ err: error, renderId: job.id, failedStep: currentStep }, "Football video render failed");
  }
}

export function createRenderJob(request: RenderRequest): RenderJob {
  const id = randomUUID();
  const job: RenderJob = {
    id,
    status: "queued",
    progress: 0,
    stage: "script",
    message: "Queued for local rendering.",
    title: titleFromPrompt(request.prompt),
    prompt: request.prompt,
    mode: request.mode,
    script: "",
    scenes: [],
    steps: initialSteps(),
    videoUrl: null,
    error: null,
    durationSeconds: request.durationSeconds,
    language: request.language,
    voice: request.voice,
    music: request.music,
    visualStyle: request.visualStyle,
    createdAt: new Date(),
  };
  jobs.set(id, job);
  void render(job, request);
  return job;
}

export function getRenderJob(id: string): RenderJob | undefined {
  return jobs.get(id);
}

export function activeRenderCount(): number {
  return [...jobs.values()].filter((job) => job.status === "queued" || job.status === "processing").length;
}

export function getRenderVideoPath(id: string): string {
  return join(renderRoot, id, "football-ai-creator.mp4");
}