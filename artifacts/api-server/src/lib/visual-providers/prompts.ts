import type { RenderRequest, RenderScene } from "@workspace/api-zod";

const shotPlans = [
  {
    action:
      "Establish the match and its stakes before play accelerates; show the teams taking shape and the focal player entering the story.",
    camera: "Very wide elevated stadium establishing shot, with the pitch geometry leading toward the focal players.",
    lighting: "Cool white floodlights, luminous haze above the pitch, deep but readable stands.",
    emotion: "Anticipation and scale; the crowd is waiting for something important.",
  },
  {
    action:
      "Show the developing build-up: the focal player receives or moves into space while teammates and opponents create clear passing lanes.",
    camera: "Dynamic sideline tracking shot at player height, medium-wide framing with a strong diagonal through the action.",
    lighting: "Directional stadium lights catch the players and turf; keep faces and the ball readable without flattening the night atmosphere.",
    emotion: "Rising urgency, teamwork, and concentration.",
  },
  {
    action:
      "Capture the decisive football action implied by the story: a shot, final pass, save, tackle, or other turning point. Make the ball and body movement physically plausible.",
    camera: "Low grass-level telephoto action frame, close enough to feel the impact while retaining the goal and keeper as context.",
    lighting: "High-contrast floodlight highlights, controlled motion blur in the background, crisp focal action.",
    emotion: "Suspense and commitment at the instant the outcome is uncertain.",
  },
  {
    action:
      "Show the story's consequence: celebration, relief, heartbreak, or the crowd's reaction, matching what the supplied story actually describes.",
    camera: "Wide behind-goal view opening into a slightly elevated celebration shot; include players and supporters in one coherent composition.",
    lighting: "Brighter stadium glow around the focal group, with atmospheric light in the stands and natural shadows on the pitch.",
    emotion: "A strong emotional release that follows the supplied story rather than adding a different result.",
  },
];

const styleDirections: Record<RenderRequest["visualStyle"], string> = {
  Cinematic:
    "Cinematic sports-film photography, rich tonal depth, realistic skin and fabric, restrained film grain, dramatic but natural color grading.",
  Broadcast:
    "Premium live football broadcast look, clear readable action, realistic sports photography, balanced exposure, clean natural colors.",
  Documentary:
    "Observational sports documentary photography, candid framing, tactile natural detail, subtle grain, honest available-light feeling.",
  Anime:
    "High-detail cinematic sports anime illustration, expressive poses, energetic perspective, hand-painted light and atmosphere, polished feature-film finish.",
};

function cleanStory(prompt: string): string {
  return prompt.trim().replace(/\s+/g, " ").slice(0, 700);
}

export function buildSceneVisualPrompt(
  request: RenderRequest,
  scene: Pick<RenderScene, "index" | "title" | "narration" | "visualCue">,
): string {
  const shot = shotPlans[scene.index - 1];
  const story = cleanStory(request.prompt);

  return [
    "Create one original 16:9 football-film scene image for a real video edit. This scene must be visually distinct from the other shots in the sequence.",
    `STYLE: ${styleDirections[request.visualStyle]}`,
    `STORY CONTEXT: ${story}`,
    `SCENE ${scene.index} — ${scene.title}.`,
    `SCENE BEAT: ${scene.narration}`,
    `SUBJECT AND CHARACTERS: Follow the football roles, people, team colors, and character details explicitly present in the story. Keep any recurring protagonist visually consistent across scenes. If the story does not specify a person, use original fictional adult players in unbranded kits; do not invent a named real athlete or a recognizable likeness.`,
    `ACTION: ${shot.action} Scene cue: ${scene.visualCue}`,
    "STADIUM AND SETTING: Preserve any venue, weather, competition, time, and atmosphere explicitly named in the story. If absent, use a large night-time football stadium with a full crowd, a natural grass pitch, and no team logos or readable signage.",
    `CAMERA: ${shot.camera}`,
    `LIGHTING: ${shot.lighting}`,
    `EMOTION: ${shot.emotion}`,
    "COMPOSITION: Landscape 16:9, clear visual focal point, anatomically plausible adult athletes, accurate football equipment and pitch markings, natural ball scale. Leave no captions, typography, watermarks, brand marks, UI, or borders.",
  ].join("\n");
}