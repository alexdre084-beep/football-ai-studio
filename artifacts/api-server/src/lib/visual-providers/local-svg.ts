import type { RenderRequest, RenderScene } from "@workspace/api-zod";
import type { GeneratedSceneVisual, SceneVisualInput, VisualProvider } from "./types";

const width = 1280;
const height = 720;

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
  <text x="64" y="643" fill="#f1f4ef" font-family="Arial,sans-serif" font-size="32" font-weight="700">${visualCue.slice(0, 46)}</text>
  <text x="66" y="680" fill="#cad5cd" font-family="Arial,sans-serif" font-size="17">${promptText}</text>
  <text x="1170" y="72" fill="${palette.accent}" font-family="monospace" font-size="14" text-anchor="end">SCENE 0${scene.index} / 04</text>
  <rect x="66" y="700" width="1148" height="3" rx="2" fill="#ffffff" fill-opacity=".2"/>
  <rect x="66" y="700" width="${Math.round(1148 * (progress + 0.25))}" height="3" rx="2" fill="${palette.accent}"/>
</svg>`;
}

export const localSvgVisualProvider: VisualProvider = {
  kind: "local",
  id: "local-svg-template",
  label: "Local SVG template",
  async generateScene({ request, scene }: SceneVisualInput): Promise<GeneratedSceneVisual> {
    return {
      bytes: Buffer.from(sceneSvg(scene, request), "utf8"),
      mediaType: "image/svg+xml",
    };
  },
};