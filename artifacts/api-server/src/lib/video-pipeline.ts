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

const visualPalettes: Record<
  RenderRequest["visualStyle"],
  { accent: string; secondary: string; atmosphere: string }
> = {
  Cinematic: {
    accent: "#c5ed55",
    secondary: "#45d1bd",
    atmosphere: "#132419",
  },
  Broadcast: {
    accent: "#52dcff",
    secondary: "#f5d348",
    atmosphere: "#0d2433",
  },
  Documentary: {
    accent: "#f0b56c",
    secondary: "#e7e0c0",
    atmosphere: "#2c211a",
  },
  Anime: {
    accent: "#fb77d2",
    secondary: "#a68cff",
    atmosphere: "#21183b",
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
    "Aerial view of the floodlit stadium before the opening whistle",
    "Tactical midfield build-up, players moving into space",
    "Close action shot with a bright ball trail toward goal",
    "Celebration at the goalmouth with the crowd in the stands",
  ];
  const titles = ["THE OPENING", "THE BUILD-UP", "THE MOMENT", "THE ROAR"];
  const scenes: RenderScene[] = narration.map((line, index) => ({
    index: index + 1,
    title: titles[index],
    narration: line,
    visualCue: visualCues[index],
    durationSeconds: durationPerScene,
  }));

  return { script: narration.join("\n\n"), scenes };
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function sceneSvg(scene: RenderScene, request: RenderRequest): string {
  const palette = visualPalettes[request.visualStyle];
  const progress = (scene.index - 1) / 3;
  const ballX = 340 + scene.index * 150;
  const ballY = 508 - scene.index * 28;
  const playerX = 455 + scene.index * 86;
  const angle = scene.index * 9 - 22;
  const promptText = escapeXml(request.prompt.trim().replace(/\s+/g, " ").slice(0, 88));
  const sceneTitle = escapeXml(scene.title);
  const visualCue = escapeXml(scene.visualCue);
  const playerPositions = [
    [235, 464],
    [380, 430],
    [565, 475],
    [790, 424],
    [980, 480],
  ];
  const playerMarks = playerPositions
    .map(([x, y], index) => {
      const active = index === scene.index % playerPositions.length;
      const color = active ? palette.accent : "#dae1dd";
      return `<g transform="translate(${x + scene.index * 10},${y - scene.index * 3})" opacity=".94"><circle cy="-30" r="9" fill="${color}"/><path d="M-10 -18 Q0 -25 10 -18 L14 12 L8 17 L6 39 L-6 39 L-8 17 L-14 12Z" fill="${color}"/><path d="M-6 38 L-12 59 M6 38 L13 59" stroke="${color}" stroke-width="7" stroke-linecap="round"/></g>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="sky" x2="0" y2="1"><stop stop-color="#091018"/><stop offset=".55" stop-color="${palette.atmosphere}"/><stop offset="1" stop-color="#172a22"/></linearGradient>
    <linearGradient id="field" x2="0" y2="1"><stop stop-color="#284b32"/><stop offset="1" stop-color="#101e19"/></linearGradient>
    <radialGradient id="glow"><stop stop-color="${palette.accent}" stop-opacity=".55"/><stop offset="1" stop-color="${palette.accent}" stop-opacity="0"/></radialGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="26"/></filter>
    <filter id="ballGlow"><feGaussianBlur stdDeviation="8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="1280" height="720" fill="url(#sky)"/>
  <ellipse cx="640" cy="260" rx="510" ry="170" fill="url(#glow)" filter="url(#soft)" opacity=".6"/>
  <path d="M0 168 Q160 135 320 165 T640 160 T960 155 T1280 170 V275 H0Z" fill="#0a1118" opacity=".92"/>
  <g fill="#dfe5dc" opacity=".58">
    ${Array.from({ length: 45 }, (_, i) => {
      const x = (i * 97) % 1280;
      const y = 185 + ((i * 47) % 83);
      return `<circle cx="${x}" cy="${y}" r="${2 + (i % 3)}"/>`;
    }).join("")}
  </g>
  <path d="M95 220 L1185 220" stroke="${palette.accent}" stroke-opacity=".45" stroke-width="3"/>
  <path d="M90 242 L1190 242" stroke="${palette.secondary}" stroke-opacity=".26" stroke-width="1"/>
  <g fill="#f7ffe0" opacity=".92" filter="url(#ballGlow)">
    <path d="M100 122 L492 158 L480 169 L100 132Z"/>
    <path d="M1180 122 L788 158 L800 169 L1180 132Z"/>
  </g>
  <path d="M-80 720 L220 275 L1060 275 L1360 720Z" fill="url(#field)"/>
  <path d="M-80 720 L220 275 L1060 275 L1360 720Z" fill="none" stroke="#d3e8c0" stroke-opacity=".55" stroke-width="3"/>
  <path d="M88 720 L330 275 M320 720 L440 275 M960 720 L840 275 M1192 720 L950 275" stroke="#d3e8c0" stroke-opacity=".16" stroke-width="2"/>
  <path d="M640 720 L640 275" stroke="#d3e8c0" stroke-opacity=".35" stroke-width="3"/>
  <ellipse cx="640" cy="512" rx="130" ry="49" fill="none" stroke="#d3e8c0" stroke-opacity=".42" stroke-width="3"/>
  <path d="M495 275 L495 345 Q640 395 785 345 L785 275 M405 275 L405 320 Q640 430 875 320 L875 275" fill="none" stroke="#d3e8c0" stroke-opacity=".36" stroke-width="3"/>
  <path d="M70 720 L310 275 M1210 720 L970 275" stroke="#d3e8c0" stroke-opacity=".26" stroke-width="3"/>
  <g>${playerMarks}</g>
  <path d="M${ballX - 250} ${ballY + 80} Q${ballX - 85} ${ballY - 120} ${ballX} ${ballY}" fill="none" stroke="${palette.accent}" stroke-width="5" stroke-dasharray="12 15" opacity=".76"/>
  <circle cx="${ballX}" cy="${ballY}" r="18" fill="${palette.accent}" opacity=".25" filter="url(#ballGlow)"/>
  <circle cx="${ballX}" cy="${ballY}" r="10" fill="#f6f4df" stroke="#1a221b" stroke-width="2"/>
  <path d="M${playerX} 430 L${playerX + 48} 458" stroke="${palette.secondary}" stroke-width="4" stroke-dasharray="7 8" opacity=".8"/>
  <rect x="54" y="54" width="240" height="34" rx="17" fill="#050b10" fill-opacity=".72" stroke="${palette.accent}" stroke-opacity=".5"/>
  <circle cx="75" cy="71" r="5" fill="${palette.accent}"/>
  <text x="91" y="76" fill="#eef3eb" font-family="Arial,sans-serif" font-size="15" font-weight="700" letter-spacing="2">LOCAL MATCH FILM</text>
  <text x="65" y="596" fill="${palette.accent}" font-family="Arial,sans-serif" font-size="17" font-weight="700" letter-spacing="5">${sceneTitle}</text>
  <text x="64" y="643" fill="#f1f4ef" font-family="Arial,sans-serif" font-size="32" font-weight="700">${escapeXml(visualCue.slice(0, 46))}</text>
  <text x="66" y="680" fill="#cad5cd" font-family="Arial,sans-serif" font-size="17">${promptText}</text>
  <text x="1170" y="72" fill="${palette.accent}" font-family="monospace" font-size="14" text-anchor="end">SCENE 0${scene.index} / 04</text>
  <rect x="66" y="700" width="1148" height="3" rx="2" fill="#ffffff" fill-opacity=".2"/>
  <rect x="66" y="700" width="${Math.round(1148 * (progress + 0.25))}" height="3" rx="2" fill="${palette.accent}"/>
</svg>`;
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

function buildEncodeArgs(
  request: RenderRequest,
  scenes: RenderScene[],
  sceneFiles: string[],
  narrationPath: string | null,
  musicPath: string | null,
  outputPath: string,
): string[] {
  const args = ["-hide_banner", "-loglevel", "error", "-y"];

  for (let index = 0; index < scenes.length; index += 1) {
    args.push(
      "-loop",
      "1",
      "-framerate",
      String(fps),
      "-t",
      scenes[index].durationSeconds.toFixed(3),
      "-i",
      sceneFiles[index],
    );
  }

  const narrationIndex = narrationPath ? scenes.length : -1;
  if (narrationPath) args.push("-i", narrationPath);
  const musicIndex = musicPath ? scenes.length + (narrationPath ? 1 : 0) : -1;
  if (musicPath) args.push("-i", musicPath);

  const videoFilters = scenes.map((scene, index) => {
    const fadeOutAt = Math.max(0, scene.durationSeconds - 0.22);
    return `[${index}:v]scale=${width}:${height},zoompan=z='min(zoom+0.0007,1.045)':d=1:s=${width}x${height}:fps=${fps},setsar=1,fade=t=in:st=0:d=0.22,fade=t=out:st=${fadeOutAt.toFixed(3)}:d=0.22,format=yuv420p[v${index}]`;
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
  const sceneFiles: string[] = [];
  let currentStep = "script";

  try {
    await mkdir(workDir, { recursive: true });
    beginStep(job.id, "script", 5, "Writing the script and dividing it into four scenes.");
    const { script, scenes } = makeScenes(request);
    patchJob(job.id, { script, scenes, title: titleFromPrompt(request.prompt) });
    finishStep(job.id, "script", `${scenes.length} scenes planned in ${request.language}.`);

    currentStep = "visuals";
    beginStep(job.id, "visuals", 19, "Drawing original stadium and match visuals for each scene.");
    for (const scene of scenes) {
      const scenePath = join(workDir, `scene-${scene.index}.svg`);
      await writeFile(scenePath, sceneSvg(scene, request), "utf8");
      sceneFiles.push(scenePath);
    }
    finishStep(job.id, "visuals", `${sceneFiles.length} original scene images created locally.`);

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
      { renderId: job.id, sizeBytes: outputStat.size, durationSeconds: request.durationSeconds },
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