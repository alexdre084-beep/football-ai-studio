import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  getGetRenderStatusQueryKey,
  useCreateRenderJob,
  useGetRenderStatus,
  type RenderJob,
  type RenderRequest,
} from "@workspace/api-client-react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import {
  AudioLines,
  Check,
  ChevronDown,
  Clapperboard,
  Clock3,
  Copy,
  Download,
  Film,
  FolderOpen,
  Languages,
  LoaderCircle,
  Mic2,
  Music2,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  Trophy,
  WandSparkles,
  X,
} from "lucide-react";
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from "wouter";

const queryClient = new QueryClient();
type Project = RenderJob;
type Mode = RenderRequest["mode"];

const modes: { name: Mode; detail: string; icon: typeof Trophy }[] = [
  { name: "Football Story", detail: "Build a cinematic narrative from your idea.", icon: Trophy },
  { name: "Match/Action Video", detail: "Turn a match moment into a match film.", icon: Clapperboard },
];
const examplePrompts = [
  "A last-minute winner under the floodlights",
  "The comeback nobody saw coming",
];
const durations: { label: string; seconds: RenderRequest["durationSeconds"] }[] = [
  { label: "15 seconds", seconds: 15 },
  { label: "30 seconds", seconds: 30 },
  { label: "45 seconds", seconds: 45 },
  { label: "60 seconds", seconds: 60 },
];
const languages: RenderRequest["language"][] = [
  "English",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
];
const voices: RenderRequest["voice"][] = [
  "Alex · Energetic",
  "Jordan · Cinematic",
  "Sam · Calm",
  "No narration",
];
const musicOptions: RenderRequest["music"][] = [
  "Stadium pulse",
  "Epic orchestral",
  "Electric tension",
  "Acoustic reflection",
  "No music",
];
const styles: RenderRequest["visualStyle"][] = [
  "Cinematic",
  "Broadcast",
  "Documentary",
  "Anime",
];
const storageKey = "football-ai-creator-rendered-videos";

function isSavedRender(value: unknown): value is Project {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<Project>;
  return (
    project.status === "complete" &&
    typeof project.id === "string" &&
    typeof project.videoUrl === "string" &&
    Array.isArray(project.scenes)
  );
}

function getProjects(): Project[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(value) ? value.filter(isSavedRender) : [];
  } catch {
    return [];
  }
}

function formatTime(seconds: number): string {
  const wholeSeconds = Math.floor(seconds);
  return `${String(Math.floor(wholeSeconds / 60)).padStart(2, "0")}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Saved video"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function visualSummary(project: Project): string {
  const providerScenes = project.scenes.filter((scene) => scene.visualSource === "ai-provider");
  if (providerScenes.length === 0) {
    return `${project.scenes.length} local SVG template visuals`;
  }
  const providerNames = [...new Set(providerScenes.map((scene) => scene.visualProvider).filter(Boolean))];
  const providerLabel = providerNames.join(", ") || "configured AI provider";
  const providerPart = `${providerScenes.length} AI-provider visual${providerScenes.length === 1 ? "" : "s"} from ${providerLabel}`;
  const fallbackCount = project.scenes.length - providerScenes.length;
  return fallbackCount > 0
    ? `${providerPart} and ${fallbackCount} local SVG fallback visual${fallbackCount === 1 ? "" : "s"}`
    : providerPart;
}

function requestError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "The local render service could not be reached. Check that the API server is running and try again.";
}

function StepIcon({ state }: { state: RenderJob["steps"][number]["state"] }) {
  if (state === "complete" || state === "skipped") return <Check size={13} />;
  if (state === "processing") return <LoaderCircle size={13} className="loading-spin" />;
  if (state === "failed") return <X size={13} />;
  return <span className="step-pending-dot" aria-hidden="true" />;
}

function PipelineSteps({ job }: { job: RenderJob }) {
  return (
    <ol className="render-steps" data-testid="render-pipeline-steps">
      {job.steps.map((step) => (
        <li className={`render-step state-${step.state}`} key={step.id} data-testid={`render-step-${step.id}`}>
          <span className="render-step-icon"><StepIcon state={step.state} /></span>
          <span className="render-step-copy">
            <strong>{step.label}</strong>
            <small>{step.detail}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Home() {
  const [mode, setMode] = useState<Mode>("Match/Action Video");
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState<RenderRequest["durationSeconds"]>(30);
  const [language, setLanguage] = useState<RenderRequest["language"]>("English");
  const [voice, setVoice] = useState<RenderRequest["voice"]>("Alex · Energetic");
  const [music, setMusic] = useState<RenderRequest["music"]>("Stadium pulse");
  const [style, setStyle] = useState<RenderRequest["visualStyle"]>("Cinematic");
  const [projects, setProjects] = useState<Project[]>(getProjects);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [currentJob, setCurrentJob] = useState<RenderJob | null>(null);
  const [renderId, setRenderId] = useState<string | null>(null);
  const [view, setView] = useState<"studio" | "projects">("studio");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const createRender = useCreateRenderJob();
  const renderStatus = useGetRenderStatus(renderId ?? "", {
    query: {
      enabled: Boolean(renderId),
      queryKey: getGetRenderStatusQueryKey(renderId ?? ""),
      refetchInterval: renderId ? 900 : false,
    },
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(projects));
    } catch {
      // Video downloads remain available for the current server session.
    }
  }, [projects]);

  useEffect(() => {
    const job = renderStatus.data;
    if (!job || !renderId) return;

    setCurrentJob(job);
    if (job.status === "complete") {
      if (!job.videoUrl) {
        setErrorMessage("The renderer reported completion without an MP4 file. No video has been added to your projects.");
        setIsGenerating(false);
        setRenderId(null);
        return;
      }
      setProjects((current) => [job, ...current.filter((project) => project.id !== job.id)]);
      setActiveProject(job);
      setVideoUnavailable(false);
      setErrorMessage(null);
      setIsGenerating(false);
      setRenderId(null);
    } else if (job.status === "failed") {
      setActiveProject(job);
      setErrorMessage(job.error ?? job.message);
      setIsGenerating(false);
      setRenderId(null);
    }
  }, [renderId, renderStatus.data]);

  useEffect(() => {
    if (!renderId || !renderStatus.isError) return;
    setErrorMessage(requestError(renderStatus.error));
    setIsGenerating(false);
    setRenderId(null);
  }, [renderId, renderStatus.error, renderStatus.isError]);

  const beginProject = () => {
    if (isGenerating || !prompt.trim()) return;
    setIsGenerating(true);
    setErrorMessage(null);
    setActiveProject(null);
    setCurrentJob(null);
    setVideoUnavailable(false);

    const data: RenderRequest = {
      mode,
      prompt: prompt.trim(),
      durationSeconds: duration,
      language,
      voice,
      music,
      visualStyle: style,
    };
    createRender.mutate(
      { data },
      {
        onSuccess: (job) => {
          setCurrentJob(job);
          setRenderId(job.id);
        },
        onError: (error) => {
          setErrorMessage(requestError(error));
          setIsGenerating(false);
        },
      },
    );
  };

  const startNew = () => {
    setActiveProject(null);
    setCurrentJob(null);
    setPrompt("");
    setView("studio");
    setRenderId(null);
    setIsGenerating(false);
    setErrorMessage(null);
    setVideoUnavailable(false);
  };

  const openProject = (project: Project) => {
    setActiveProject(project);
    setCurrentJob(project);
    setMode(project.mode);
    setPrompt(project.prompt);
    setDuration(project.durationSeconds as RenderRequest["durationSeconds"]);
    setLanguage(project.language as RenderRequest["language"]);
    setVoice(project.voice as RenderRequest["voice"]);
    setMusic(project.music as RenderRequest["music"]);
    setStyle(project.visualStyle as RenderRequest["visualStyle"]);
    setView("studio");
    setVideoUnavailable(false);
    setErrorMessage(null);
  };

  const copyPrompt = async () => {
    if (!activeProject) return;
    try {
      await navigator.clipboard.writeText(activeProject.prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const visibleJob = currentJob;
  return (
    <div className="studio-shell">
      <header className="topbar">
        <a href="/" className="brand-lockup" aria-label="Football AI Creator home" data-testid="link-home">
          <span className="brand-mark"><AudioLines size={19} strokeWidth={2.4} /></span>
          <span><span className="brand-word">FOOTBALL AI</span><span className="brand-sub">CREATOR STUDIO</span></span>
        </a>
        <nav className="topnav" aria-label="Main navigation">
          <button className={`nav-button ${view === "studio" ? "active" : ""}`} onClick={() => setView("studio")} data-testid="nav-studio">
            <WandSparkles size={16} /> Studio
          </button>
          <button className={`nav-button ${view === "projects" ? "active" : ""}`} onClick={() => setView("projects")} data-testid="nav-projects">
            <FolderOpen size={16} /> My Videos <span className="nav-count">{projects.length}</span>
          </button>
          <div className="profile-chip"><div className="profile-avatar">FC</div><span>Local studio</span></div>
        </nav>
      </header>

      <main className={`workspace ${view === "projects" ? "projects-view" : ""}`}>
        {view === "studio" ? (
          <>
            <div className="eyebrow">A local football video studio</div>
            <h1 className="page-heading">MAKE THE MOMENT<br />IMMORTAL.</h1>
            <p className="page-intro">Describe the football moment you can’t stop thinking about. Build a scene script and unique visual prompts, use a configured AI provider when available or the local fallback, then render narration, soundtrack, and a real MP4.</p>

            <div className="stage-layout">
              <section className="panel composer" aria-labelledby="composer-heading">
                <div className="panel-heading">
                  <h2 className="section-title" id="composer-heading">Create a football video</h2>
                  <span className="step-tag">LOCAL MP4 / PROVIDER-READY</span>
                </div>
                <div className="mode-grid" role="group" aria-label="Creation mode">
                  {modes.map(({ name, detail, icon: Icon }) => (
                    <button key={name} type="button" className={`mode-card ${mode === name ? "selected" : ""}`} onClick={() => setMode(name)} aria-pressed={mode === name} data-testid={`mode-${name === "Football Story" ? "football-story" : "match-action-video"}`}>
                      <span className="mode-icon"><Icon size={17} /></span>
                      <span><strong>{name}</strong><small>{detail}</small></span>
                    </button>
                  ))}
                </div>

                <label className="field-label" htmlFor="moment-prompt">
                  Tell us the moment
                  <span className="label-hint">3–500 characters</span>
                </label>
                <div className="prompt-wrap">
                  <textarea
                    id="moment-prompt"
                    className="prompt-field"
                    minLength={3}
                    maxLength={500}
                    placeholder={mode === "Football Story" ? "A young supporter travels across the country to watch their first final…" : "Describe the play, the players, the atmosphere…"}
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    data-testid="input-video-prompt"
                  />
                  <span className="prompt-count" data-testid="text-prompt-character-count">{prompt.length} / 500</span>
                </div>
                <div className="prompt-examples">
                  <span>Try a starting point</span>
                  {examplePrompts.map((example) => (
                    <button type="button" className="example-chip" key={example} onClick={() => setPrompt(example)} data-testid={`example-${example.includes("winner") ? "winner" : "comeback"}`}>{example}</button>
                  ))}
                </div>

                <div className="settings-grid">
                  <div>
                    <label className="field-label" htmlFor="duration-select"><Clock3 size={13} /> Duration</label>
                    <div className="select-wrap"><select id="duration-select" className="select-control" value={duration} onChange={(event) => setDuration(Number(event.target.value) as RenderRequest["durationSeconds"])} data-testid="select-duration">
                      {durations.map((item) => <option key={item.seconds} value={item.seconds}>{item.label}</option>)}
                    </select><ChevronDown size={14} /></div>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="language-select"><Languages size={13} /> Language</label>
                    <div className="select-wrap"><select id="language-select" className="select-control" value={language} onChange={(event) => setLanguage(event.target.value as RenderRequest["language"])} data-testid="select-language">
                      {languages.map((item) => <option key={item}>{item}</option>)}
                    </select><ChevronDown size={14} /></div>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="voice-select"><Mic2 size={13} /> Narrator voice</label>
                    <div className="select-wrap"><select id="voice-select" className="select-control" value={voice} onChange={(event) => setVoice(event.target.value as RenderRequest["voice"])} data-testid="select-narrator-voice">
                      {voices.map((item) => <option key={item}>{item}</option>)}
                    </select><ChevronDown size={14} /></div>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="music-select"><Music2 size={13} /> Music</label>
                    <div className="select-wrap"><select id="music-select" className="select-control" value={music} onChange={(event) => setMusic(event.target.value as RenderRequest["music"])} data-testid="select-music">
                      {musicOptions.map((item) => <option key={item}>{item}</option>)}
                    </select><ChevronDown size={14} /></div>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div className="field-label"><span>Visual style</span><span className="label-hint">Applied to each scene prompt</span></div>
                    <div className="style-grid" role="group" aria-label="Visual style">
                      {styles.map((item) => <button key={item} type="button" className={`style-option ${style === item ? "selected" : ""}`} onClick={() => setStyle(item)} aria-pressed={style === item} data-testid={`style-${item.toLowerCase()}`}><span>{item}</span></button>)}
                    </div>
                  </div>
                </div>
                <div className="submit-row">
                  <button className="generate-button" onClick={beginProject} disabled={prompt.trim().length < 3 || isGenerating || createRender.isPending} data-testid="button-generate-video">
                    {isGenerating ? <><LoaderCircle size={16} className="loading-spin" /> Rendering local MP4</> : <><Sparkles size={16} /> Generate Video <span aria-hidden="true">→</span></>}
                  </button>
                  <div className="submit-note"><ShieldCheck size={14} /> AI provider optional · local visuals fallback</div>
                </div>
                <div className="local-tools-note" data-testid="text-local-render-stack">
                  <strong>Visual provider routing</strong>
                  <span>Detailed prompt per scene · provider image/video assets when configured · eSpeak NG narration · FFmpeg MP4</span>
                  <small>Scenes are labeled AI-provider visuals only after valid media is returned. With no provider configured, the current SVG fallback keeps rendering available.</small>
                </div>
                {errorMessage && (
                  <div className="render-error" role="alert" data-testid="status-render-error">
                    <X size={15} />
                    <span><strong>Render failed</strong><small>{errorMessage}</small></span>
                  </div>
                )}
              </section>

              <section aria-label="Video render and project result">
                <div className="panel preview-panel">
                  <div className="preview-top">
                    <div className="preview-kicker"><span className={`live-dot ${visibleJob?.status === "failed" ? "failed-dot" : ""}`} /> {isGenerating ? "Rendering locally" : activeProject?.status === "complete" ? "MP4 ready" : activeProject?.status === "failed" ? "Render failed" : "Preview stage"}</div>
                    <span className="preview-stamp">FOOTBALL AI / LOCAL</span>
                  </div>
                  {activeProject?.status === "complete" && activeProject.videoUrl ? (
                    <div className="rendered-player" data-testid="result-rendered-video">
                      {videoUnavailable ? (
                        <div className="video-unavailable" role="status">
                          <Film size={24} />
                          <strong>This MP4 is no longer on the local render server.</strong>
                          <span>Download completed videos before restarting or clearing the render server.</span>
                        </div>
                      ) : (
                        <video
                          controls
                          playsInline
                          preload="metadata"
                          src={activeProject.videoUrl}
                          onError={() => setVideoUnavailable(true)}
                          aria-label={`Rendered football video: ${activeProject.title}`}
                          data-testid="video-player"
                        />
                      )}
                      <div className="player-caption">
                        <span><Check size={13} /> Verified MP4 · {activeProject.durationSeconds}s</span>
                        <span>{activeProject.visualStyle} · {activeProject.language}</span>
                      </div>
                    </div>
                  ) : isGenerating ? (
                    <div className="render-progress" data-testid="status-generation-progress">
                      <div className="render-progress-heading">
                        <div className="empty-icon"><LoaderCircle className="loading-spin" size={23} /></div>
                        <div>
                          <h2 className="empty-title">{visibleJob?.message ?? "Starting your local render"}</h2>
                          <p className="empty-copy">The MP4 will appear here after every pipeline step succeeds.</p>
                        </div>
                      </div>
                      <div className="render-progress-track" role="progressbar" aria-label="Video render progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={visibleJob?.progress ?? 2}>
                        <div className="render-progress-fill" style={{ width: `${visibleJob?.progress ?? 2}%` }} />
                      </div>
                      <div className="render-progress-label"><span>{visibleJob?.message ?? "Submitting render job…"}</span><strong>{visibleJob?.progress ?? 2}%</strong></div>
                      {visibleJob && <PipelineSteps job={visibleJob} />}
                    </div>
                  ) : activeProject?.status === "failed" ? (
                    <div className="render-failure" data-testid="status-render-failed">
                      <div className="empty-icon failure-icon"><X size={22} /></div>
                      <h2 className="empty-title">No MP4 was exported</h2>
                      <p className="empty-copy">{activeProject.error ?? activeProject.message}</p>
                      <button type="button" className="secondary-button" onClick={startNew} data-testid="button-retry-render"><Plus size={14} /> Try another render</button>
                      <PipelineSteps job={activeProject} />
                    </div>
                  ) : (
                    <div className="empty-preview" data-testid="empty-video-preview">
                      <div className="empty-icon"><Film size={23} /></div>
                      <h2 className="empty-title">Your rendered match film starts here</h2>
                      <p className="empty-copy">Create the script and scene prompts, then use provider visuals when configured or local SVG fallbacks before adding narration, score, and the playable MP4.</p>
                    </div>
                  )}
                  <div className="preview-footer"><span><span className="live-dot" /> FFmpeg MP4 PIPELINE</span><span>LOCAL RENDER MODE</span></div>
                </div>

                {activeProject?.status === "complete" && activeProject.videoUrl && (
                  <article className="result-card" aria-live="polite" data-testid="result-rendered-project">
                    <div className="result-banner">
                      <span className="sample-badge"><Check size={12} /> MP4 rendered</span>
                      <span className="concept-note">{(activeProject.durationSeconds)} seconds · {(activeProject.script.length > 0 ? "local pipeline" : "script unavailable")}</span>
                    </div>
                    <h2 className="result-title">{activeProject.title}</h2>
                    <p className="result-description">Rendered on this server with {visualSummary(activeProject)}, {activeProject.voice === "No narration" ? "no narrator" : "offline eSpeak NG narration"}, {activeProject.music === "No music" ? "no soundtrack" : "a synthesized soundtrack"}, and FFmpeg.</p>
                    <div className="result-metrics">
                      <div className="metric"><div className="metric-label">Format</div><div className="metric-value">{activeProject.mode}</div></div>
                      <div className="metric"><div className="metric-label">Runtime · Language</div><div className="metric-value">{activeProject.durationSeconds}s · {activeProject.language}</div></div>
                      <div className="metric"><div className="metric-label">Narrator</div><div className="metric-value">{activeProject.voice}</div></div>
                      <div className="metric"><div className="metric-label">Soundtrack</div><div className="metric-value">{activeProject.music}</div></div>
                    </div>
                    <details className="script-details">
                      <summary>View generated script and scene plan</summary>
                      <pre className="generated-script">{activeProject.script}</pre>
                      <ul className="shot-list">
                        {activeProject.scenes.map((scene) => {
                          const start = (scene.index - 1) * scene.durationSeconds;
                          return (
                            <li className="shot-row" key={scene.index}>
                              <span className="shot-time">{formatTime(start)}</span>
                              <div className="shot-copy">
                                <span><strong>{scene.title}</strong> — {scene.visualCue}</span>
                                <span className={`visual-source-badge ${scene.visualSource === "ai-provider" ? "provider-source" : "local-source"}`}>
                                  {scene.visualSource === "ai-provider"
                                    ? `AI provider · ${scene.visualProvider ?? "verified"}`
                                    : "Local SVG fallback"}
                                </span>
                                <details className="scene-prompt-details">
                                  <summary>Scene visual prompt</summary>
                                  <pre>{scene.visualPrompt || scene.visualCue}</pre>
                                </details>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                    <PipelineSteps job={activeProject} />
                    <div className="result-actions">
                      <a className="download-button" href={activeProject.videoUrl} download={`football-ai-${activeProject.id.slice(0, 8)}.mp4`} data-testid="link-download-mp4"><Download size={14} /> Download MP4</a>
                      <button type="button" className="secondary-button" onClick={copyPrompt} data-testid="button-copy-prompt">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy prompt"}</button>
                      <button type="button" className="secondary-button" onClick={startNew} data-testid="button-create-another"><Plus size={14} /> Create another</button>
                    </div>
                  </article>
                )}
              </section>
            </div>
          </>
        ) : (
          <>
            <div className="eyebrow">Your local video archive</div>
            <h1 className="page-heading">MY VIDEOS.</h1>
            <p className="page-intro">Rendered MP4s created in this browser. Download a video to keep a copy outside the local render server.</p>
            <div className="projects-toolbar">
              <span className="step-tag" data-testid="text-project-count">{projects.length} {projects.length === 1 ? "RENDERED VIDEO" : "RENDERED VIDEOS"}</span>
              <button className="generate-button" onClick={startNew} data-testid="button-new-project"><Plus size={15} /> New video</button>
            </div>
            {projects.length ? (
              <div className="project-list">
                {projects.map((project) => (
                  <article className="project-row" key={project.id} data-testid={`card-project-${project.id}`}>
                    <div className="project-thumb" aria-hidden="true"><Film size={19} /></div>
                    <div>
                      <h3>{project.title}</h3>
                      <p>{project.prompt}</p>
                      <div className="project-meta"><span>{project.mode}</span><span>{project.durationSeconds}s</span><span>{formatDate(project.createdAt)}</span></div>
                    </div>
                    <div className="project-row-actions">
                      <button type="button" className="secondary-button" onClick={() => openProject(project)} data-testid={`button-open-project-${project.id}`}><Play size={13} /> Open video</button>
                      <a className="secondary-button" href={project.videoUrl ?? undefined} download={`football-ai-${project.id.slice(0, 8)}.mp4`} data-testid={`link-download-project-${project.id}`}><Download size={13} /> MP4</a>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-projects" data-testid="empty-projects">
                <FolderOpen size={25} />
                <h2>No rendered videos yet</h2>
                <p>Generate and export a real MP4 to start your archive.</p>
                <button className="secondary-button" onClick={startNew} data-testid="button-start-first-project"><Plus size={14} /> Create your first video</button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;