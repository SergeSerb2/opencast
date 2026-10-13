import type { AICommand, AIPreset } from "@surgecast/protocol";
const writing = (instruction: string) =>
  `${instruction} Preserve the language, facts, intent, links, and emoji. Return only the revised text.\n\n{selection}`;
const definitions: [string, string, string][] = [
  [
    "improve-writing",
    "Improve Writing",
    writing(
      "Edit for clearer, more economical wording. Keep the author's voice and meaning. Leave already effective passages alone.",
    ),
  ],
  [
    "fix-spelling-grammar",
    "Fix Spelling and Grammar",
    writing(
      "Repair spelling, punctuation, and grammar while making the smallest necessary changes.",
    ),
  ],
  [
    "explain-this-in-simple-terms",
    "Explain This in Simple Terms",
    "Explain the following word, passage, or idea using everyday language. Define a lone word briefly; use a small example when it clarifies a concept.\n\n{selection}",
  ],
  [
    "change-tone-to-professional",
    "Change Tone to Professional",
    writing(
      "Rewrite in a polished, professional register, retaining approximately the same length.",
    ),
  ],
  [
    "change-tone-to-friendly",
    "Change Tone to Friendly",
    writing(
      "Rewrite in a warm, approachable voice, retaining approximately the same length.",
    ),
  ],
  [
    "find-bugs",
    "Find Bugs in Code",
    "Inspect the supplied code for demonstrable defects. Describe each issue briefly and show a corrected code block. Use only the provided context; if no defect is supported by the code, say so.\n\n{selection | raw}",
  ],
  [
    "summarize-website",
    "Summarize Webpage",
    'Summarize this webpage using a short heading, a two-sentence overview, and three concise takeaway bullets. Preserve the author\'s perspective and use only facts present in the page.\n\n{browser-tab format="markdown" | raw}',
  ],
  [
    "answer-question-about-website",
    "Ask About Webpage",
    'Answer this question using only the supplied webpage. If the answer is absent, explain that briefly. Otherwise give a concise factual answer.\nQuestion: {argument name="Question"}\n\n{browser-tab format="markdown" | raw}',
  ],
  [
    "make-longer",
    "Make Longer",
    writing(
      "Expand the text with useful detail and smoother transitions, without inventing facts.",
    ),
  ],
  [
    "make-shorter",
    "Make Shorter",
    writing("Condense the text while retaining the essential information."),
  ],
  [
    "translate",
    "Translate",
    'Translate the following into {argument name="Language" default="English"}, preserving meaning, formatting, and tone. Return just the translation.\n\n{selection}',
  ],
  [
    "summarize",
    "Summarize",
    "Give a concise summary of the supplied text, emphasizing its central ideas and important facts.\n\n{selection}",
  ],
  [
    "create-action-items",
    "Create Action Items",
    "Extract concrete next actions from this text. Include owners and deadlines when stated; do not invent them. Present a practical checklist.\n\n{selection}",
  ],
  [
    "regex-generator",
    "Regex Generator",
    'Create a regular expression for this requirement. Explain its flags, include matching and nonmatching examples, and identify limitations.\n\n{argument name="Requirement"}',
  ],
  [
    "explain-code",
    "Explain Code",
    "Explain how the code works, its inputs and outputs, and any important edge cases. Use clear language appropriate to the code's complexity.\n\n{selection | raw}",
  ],
  [
    "add-comments",
    "Add Comments",
    "Add helpful comments explaining the intent and non-obvious decisions in this code. Preserve executable behavior. Return the commented code.\n\n{selection | raw}",
  ],
  [
    "write-tests",
    "Write Tests",
    "Write meaningful tests for the provided code, covering normal behavior and edge cases. Follow any visible testing conventions and state assumptions when the framework is unclear.\n\n{selection | raw}",
  ],
  [
    "improve-readability",
    "Improve Readability",
    "Refactor this code to make its intent easier to follow. Preserve its behavior and public interface, then briefly explain the changes.\n\n{selection | raw}",
  ],
  [
    "change-tone",
    "Change Tone",
    writing(
      'Rewrite using a {argument name="Tone" options="Professional,Friendly,Casual,Confident" default="Professional"} tone.',
    ),
  ],
];
export function builtinCommands(now = Date.now()): AICommand[] {
  return definitions.map(([id, name, prompt]) => ({
    id,
    name,
    prompt,
    creativity: "medium",
    output: "quick-ai",
    builtin: true,
    highlightEdits: id === "fix-spelling-grammar",
    createdAt: now,
    updatedAt: now,
  }));
}
export function builtinPresets(now = Date.now()): AIPreset[] {
  return [
    [
      "general",
      "General",
      "Help solve the user's problem clearly. State uncertainty and distinguish supplied facts from assumptions.",
    ],
    [
      "writing",
      "Writing Assistant",
      "Help draft and revise prose. Preserve the author's purpose and voice, use clear language, and explain editorial choices when requested.",
    ],
    [
      "coding",
      "Coding Expert",
      "Help design, debug, and test software. Favor focused changes, explain assumptions, and do not claim code was executed without a tool result.",
    ],
    [
      "research",
      "Deep Research",
      "Investigate questions carefully. Use available search tools for current facts, cite sources, compare evidence, and identify uncertainty.",
    ],
  ].map(([id, name, instructions]) => ({
    id,
    name,
    instructions,
    creativity: "medium",
    webSearch: id === "research",
    tools: id === "research" ? ["web"] : [],
    builtin: true,
    createdAt: now,
    updatedAt: now,
  }));
}
