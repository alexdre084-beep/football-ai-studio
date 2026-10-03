import { type ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  AudioLines,
  Check,
  ChevronDown,
  Clapperboard,
  Clock3,
  Copy,
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
} from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

type Mode = 'Football Story' | 'Match/Action Video';
type Project = {
  id: string;
  mode: Mode;
  prompt: string;
  title: string;
  duration: string;
  language: string;
  voice: string;
  music: string;
  style: string;
  createdAt: string;
};

const modes: { name: Mode; detail: string; icon: typeof Trophy }[] = [
  { name: 'Football Story', detail: 'Build a cinematic narrative from your idea.', icon: Trophy },
  { name: 'Match/Action Video', detail: 'Turn a match moment into a highlight concept.', icon: Clapperboard },
];
const examplePrompts = [
  'A last-minute winner under the floodlights',
  'The comeback nobody saw coming',
];
const styles = ['Cinematic', 'Broadcast', 'Documentary', 'Anime'];
const storageKey = 'football-ai-creator-projects';

function getProjects(): Project[] {
  try {
    const value = localStorage.getItem(storageKey);
    return value ? JSON.parse(value) as Project[] : [];
  } catch {
    return [];
  }
}

function makeTitle(prompt: string, mode: Mode) {
  const clean = prompt.trim().replace(/[.!?]+$/, '');
  if (!clean) return mode === 'Football Story' ? 'A Football Story' : 'Matchday Moment';
  const title = clean.length > 49 ? `${clean.slice(0, 46).trimEnd()}…` : clean;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function Home() {
  const [mode, setMode] = useState<Mode>('Match/Action Video');
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState('30 seconds');
  const [language, setLanguage] = useState('English');
  const [voice, setVoice] = useState('Alex · Energetic');
  const [music, setMusic] = useState('Stadium pulse');
  const [style, setStyle] = useState('Cinematic');
  const [projects, setProjects] = useState<Project[]>(getProjects);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [view, setView] = useState<'studio' | 'projects'>('studio');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(projects));
    } catch {
      // The studio remains usable if local storage is unavailable.
    }
  }, [projects]);

  const beginProject = () => {
    if (isGenerating || !prompt.trim()) return;
    setIsGenerating(true);
    setActiveProject(null);
    window.setTimeout(() => {
      const created: Project = {
        id: `${Date.now()}`,
        mode,
        prompt: prompt.trim(),
        title: makeTitle(prompt, mode),
        duration,
        language,
        voice,
        music,
        style,
        createdAt: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      };
      setProjects(current => [created, ...current]);
      setActiveProject(created);
      setIsGenerating(false);
    }, 1650);
  };

  const startNew = () => {
    setActiveProject(null);
    setPrompt('');
    setView('studio');
    setIsGenerating(false);
  };

  const openProject = (project: Project) => {
    setActiveProject(project);
    setMode(project.mode);
    setPrompt(project.prompt);
    setDuration(project.duration);
    setLanguage(project.language);
    setVoice(project.voice);
    setMusic(project.music);
    setStyle(project.style);
    setView('studio');
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

  return (
    <div className="studio-shell">
      <header className="topbar">
        <a href="/" className="brand-lockup" aria-label="Football AI Creator home" data-testid="link-home">
          <span className="brand-mark"><AudioLines size={19} strokeWidth={2.4} /></span>
          <span><span className="brand-word">FOOTBALL AI</span><span className="brand-sub">CREATOR STUDIO</span></span>
        </a>
        <nav className="topnav" aria-label="Main navigation">
          <button className={`nav-button ${view === 'studio' ? 'active' : ''}`} onClick={() => setView('studio')} data-testid="nav-studio">
            <WandSparkles size={16} /> Studio
          </button>
          <button className={`nav-button ${view === 'projects' ? 'active' : ''}`} onClick={() => setView('projects')} data-testid="nav-projects">
            <FolderOpen size={16} /> My Projects <span className="nav-count">{projects.length}</span>
          </button>
          <div className="profile-chip"><div className="profile-avatar">FC</div><span>Fan creator</span></div>
        </nav>
      </header>

      <main className={`workspace ${view === 'projects' ? 'projects-view' : ''}`}>
        {view === 'studio' ? (
          <>
            <div className="eyebrow">Your personal creative control room</div>
            <h1 className="page-heading">MAKE THE MOMENT<br />IMMORTAL.</h1>
            <p className="page-intro">Describe the football moment you can’t stop thinking about. Shape it into a cinematic video concept, your way.</p>

            <div className="stage-layout">
              <section className="panel composer" aria-labelledby="composer-heading">
                <div className="panel-heading">
                  <h2 className="section-title" id="composer-heading">Create a video concept</h2>
                  <span className="step-tag">01 / CONCEPT</span>
                </div>
                <div className="mode-grid" role="group" aria-label="Creation mode">
                  {modes.map(({ name, detail, icon: Icon }) => (
                    <button key={name} type="button" className={`mode-card ${mode === name ? 'selected' : ''}`} onClick={() => setMode(name)} aria-pressed={mode === name} data-testid={`mode-${name === 'Football Story' ? 'football-story' : 'match-action-video'}`}>
                      <span className="mode-icon"><Icon size={17} /></span>
                      <span><strong>{name}</strong><small>{detail}</small></span>
                    </button>
                  ))}
                </div>

                <label className="field-label" htmlFor="moment-prompt">
                  Tell us the moment
                  <span className="label-hint">Be as specific as you like</span>
                </label>
                <div className="prompt-wrap">
                  <textarea
                    id="moment-prompt"
                    className="prompt-field"
                    maxLength={500}
                    placeholder={mode === 'Football Story' ? 'A young supporter travels across the country to watch their first final…' : 'Describe the play, the players, the atmosphere…'}
                    value={prompt}
                    onChange={event => setPrompt(event.target.value)}
                    data-testid="input-video-prompt"
                  />
                  <span className="prompt-count" data-testid="text-prompt-character-count">{prompt.length} / 500</span>
                </div>
                <div className="prompt-examples">
                  <span>Try a starting point</span>
                  {examplePrompts.map(example => (
                    <button type="button" className="example-chip" key={example} onClick={() => setPrompt(example)} data-testid={`example-${example.includes('winner') ? 'winner' : 'comeback'}`}>{example}</button>
                  ))}
                </div>

                <div className="settings-grid">
                  <div>
                    <label className="field-label" htmlFor="duration-select"><Clock3 size={13} /> Duration</label>
                    <div className="select-wrap"><select id="duration-select" className="select-control" value={duration} onChange={event => setDuration(event.target.value)} data-testid="select-duration">
                      <option>15 seconds</option><option>30 seconds</option><option>45 seconds</option><option>60 seconds</option>
                    </select><ChevronDown size={14} /></div>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="language-select"><Languages size={13} /> Language</label>
                    <div className="select-wrap"><select id="language-select" className="select-control" value={language} onChange={event => setLanguage(event.target.value)} data-testid="select-language">
                      <option>English</option><option>Spanish</option><option>French</option><option>German</option><option>Italian</option><option>Portuguese</option>
                    </select><ChevronDown size={14} /></div>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="voice-select"><Mic2 size={13} /> Narrator voice</label>
                    <div className="select-wrap"><select id="voice-select" className="select-control" value={voice} onChange={event => setVoice(event.target.value)} data-testid="select-narrator-voice">
                      <option>Alex · Energetic</option><option>Jordan · Cinematic</option><option>Sam · Calm</option><option>No narration</option>
                    </select><ChevronDown size={14} /></div>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="music-select"><Music2 size={13} /> Music</label>
                    <div className="select-wrap"><select id="music-select" className="select-control" value={music} onChange={event => setMusic(event.target.value)} data-testid="select-music">
                      <option>Stadium pulse</option><option>Epic orchestral</option><option>Electric tension</option><option>Acoustic reflection</option><option>No music</option>
                    </select><ChevronDown size={14} /></div>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div className="field-label"><span>Visual style</span><span className="label-hint">Choose your look</span></div>
                    <div className="style-grid" role="group" aria-label="Visual style">
                      {styles.map(item => <button key={item} type="button" className={`style-option ${style === item ? 'selected' : ''}`} onClick={() => setStyle(item)} aria-pressed={style === item} data-testid={`style-${item.toLowerCase()}`}><span>{item}</span></button>)}
                    </div>
                  </div>
                </div>
                <div className="submit-row">
                  <button className="generate-button" onClick={beginProject} disabled={!prompt.trim() || isGenerating} data-testid="button-generate-video">
                    {isGenerating ? <><LoaderCircle size={16} className="loading-spin" /> Building your concept</> : <><Sparkles size={16} /> Generate Video <span aria-hidden="true">→</span></>}
                  </button>
                  <div className="submit-note"><ShieldCheck size={14} /> Concept preview only. No video is rendered.</div>
                </div>
              </section>

              <section aria-label="Concept preview and project result">
                <div className="panel preview-panel">
                  <div className="preview-top">
                    <div className="preview-kicker"><span className="live-dot" /> {activeProject ? 'Concept ready' : 'Preview stage'}</div>
                    <span className="preview-stamp">FOOTBALL AI / 01</span>
                  </div>
                  {activeProject ? (
                    <div className="visual-stage" data-testid="result-concept-preview">
                      <div className="stadium-visual"><div className="stadium-lights" /><div className="pitch-lines" /><span className="silhouette s1" /><span className="silhouette s2" /><span className="ball" /></div>
                      <div className="stage-overlay" />
                      <div className="stage-content">
                        <div className="stage-meta"><Play size={12} fill="currentColor" /> {activeProject.style} / {activeProject.mode}</div>
                        <h2 className="stage-title">{activeProject.title}</h2>
                        <p className="stage-sub">{activeProject.prompt}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="empty-preview" data-testid="empty-concept-preview">
                      {isGenerating ? (
                        <>
                          <div className="empty-icon"><LoaderCircle className="loading-spin" size={23} /></div>
                          <h2 className="empty-title">Finding the story in your moment</h2>
                          <p className="empty-copy">Structuring the scenes, setting the pace, and composing your concept.</p>
                          <div className="progress-track" style={{ width: 'min(260px, 100%)' }}><div className="progress-fill" /></div>
                          <div className="loading-message" role="status" data-testid="status-generation-progress">Concept in progress · almost there</div>
                        </>
                      ) : (
                        <>
                          <div className="empty-icon"><Film size={23} /></div>
                          <h2 className="empty-title">The next great moment starts here</h2>
                          <p className="empty-copy">Your concept preview will take shape here. Add a moment and make it yours.</p>
                        </>
                      )}
                    </div>
                  )}
                  <div className="preview-footer"><span><span className="live-dot" /> CONCEPT ENGINE READY</span><span>LOCAL STUDIO MODE</span></div>
                </div>

                {activeProject && (
                  <article className="result-card" aria-live="polite" data-testid="result-generated-project">
                    <div className="result-banner">
                      <span className="sample-badge"><Check size={12} /> Sample concept</span>
                      <span className="concept-note">Not a rendered video</span>
                    </div>
                    <h2 className="result-title">{activeProject.title}</h2>
                    <p className="result-description">{activeProject.mode === 'Football Story'
                      ? `A ${activeProject.style.toLowerCase()} football story shaped around your prompt, with a clear narrative arc and a final beat designed to linger.`
                      : `A ${activeProject.style.toLowerCase()} highlight concept built around your match moment, cutting from the build-up into the decisive play and its aftermath.`}</p>
                    <div className="result-metrics">
                      <div className="metric"><div className="metric-label">Format</div><div className="metric-value">{activeProject.mode}</div></div>
                      <div className="metric"><div className="metric-label">Length · Language</div><div className="metric-value">{activeProject.duration} · {activeProject.language}</div></div>
                      <div className="metric"><div className="metric-label">Narrator</div><div className="metric-value">{activeProject.voice}</div></div>
                      <div className="metric"><div className="metric-label">Soundtrack</div><div className="metric-value">{activeProject.music}</div></div>
                    </div>
                    <ul className="shot-list">
                      {(activeProject.mode === 'Football Story'
                        ? [['00:00', 'Set the scene — the ground, the stakes, the feeling before kick-off.'], ['00:08', 'Build the arc — a turning point that draws the audience into the story.'], ['00:20', 'Land the emotion — a final image that makes the moment stay.']]
                        : [['00:00', 'Atmosphere — floodlights, crowd anticipation, the match on a knife edge.'], ['00:07', 'The action — tight cuts follow the play exactly as you described it.'], ['00:20', 'The release — the reaction, the roar, and a cinematic closing frame.']]).map(([time, shot]) => (
                        <li className="shot-row" key={time}><span className="shot-time">{time}</span><span>{shot}</span></li>
                      ))}
                    </ul>
                    <div className="result-actions">
                      <button type="button" className="secondary-button" onClick={copyPrompt} data-testid="button-copy-prompt">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy prompt'}</button>
                      <button type="button" className="secondary-button" onClick={startNew} data-testid="button-create-another"><Plus size={14} /> Create another</button>
                    </div>
                  </article>
                )}
              </section>
            </div>
          </>
        ) : (
          <>
            <div className="eyebrow">Your creative archive</div>
            <h1 className="page-heading">MY PROJECTS.</h1>
            <p className="page-intro">Your football moments, turned into concepts. Everything is saved on this device.</p>
            <div className="projects-toolbar">
              <span className="step-tag" data-testid="text-project-count">{projects.length} {projects.length === 1 ? 'CONCEPT' : 'CONCEPTS'}</span>
              <button className="generate-button" onClick={startNew} data-testid="button-new-project"><Plus size={15} /> New concept</button>
            </div>
            {projects.length ? (
              <div className="project-list">
                {projects.map(project => (
                  <article className="project-row" key={project.id} data-testid={`card-project-${project.id}`}>
                    <div className="project-thumb" aria-hidden="true" />
                    <div>
                      <h3>{project.title}</h3>
                      <p>{project.prompt}</p>
                      <div className="project-meta"><span>{project.mode}</span><span>{project.duration}</span><span>{project.createdAt}</span></div>
                    </div>
                    <button type="button" className="secondary-button" onClick={() => openProject(project)} data-testid={`button-open-project-${project.id}`}>Open concept <span aria-hidden="true">→</span></button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-projects" data-testid="empty-projects">
                <FolderOpen size={25} />
                <h2>No concepts in your archive yet</h2>
                <p>Give your first football moment a cinematic treatment.</p>
                <button className="secondary-button" onClick={startNew} data-testid="button-start-first-project"><Plus size={14} /> Start your first concept</button>
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
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
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
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
