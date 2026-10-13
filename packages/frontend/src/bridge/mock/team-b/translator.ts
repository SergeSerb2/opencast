import type { AIChat, AIStreamEvent, BackendParams } from "@opencast/protocol";
import type { MockArea, MockContext } from "./types";

/**
 * Mock backend for the Translator: `ai.ask` streams a fake reply (a small
 * phrase table, otherwise the text marked with the target code), `ai.stop`
 * cancels it, and the throwaway chats Translator creates are accepted.
 * `?mockAi=none` simulates an OpenCast without any AI provider.
 */

const MODEL = "openai/gpt-5.1-mini";

/** Target language names used in the translation prompt → codes. */
const CODES: Record<string, string> = {
  english: "en",
  spanish: "es",
  french: "fr",
  german: "de",
  italian: "it",
  japanese: "ja",
  portuguese: "pt",
  dutch: "nl",
  korean: "ko",
  russian: "ru",
  "chinese (simplified)": "zh",
  "chinese (traditional)": "zh-TW",
};

const PHRASES: Record<string, string>[] = [
  {
    en: "Good morning! The design review moved to 3 pm. Could you send me the latest mockups before then?",
    es: "¡Buenos días! La revisión de diseño se movió a las 3 p. m. ¿Podrías enviarme las últimas maquetas antes?",
    fr: "Bonjour ! La revue de design a été déplacée à 15 h. Pourrais-tu m’envoyer les dernières maquettes d’ici là ?",
    de: "Guten Morgen! Das Design-Review wurde auf 15 Uhr verschoben. Kannst du mir vorher die neuesten Mockups schicken?",
    it: "Buongiorno! La revisione del design è stata spostata alle 15. Potresti mandarmi gli ultimi mockup prima di allora?",
    ja: "おはようございます！デザインレビューは午後3時に変更になりました。それまでに最新のモックアップを送っていただけますか？",
  },
  {
    en: "Where is the nearest train station?",
    es: "¿Dónde está la estación de tren más cercana?",
    fr: "Où se trouve la gare la plus proche ?",
    de: "Wo ist der nächste Bahnhof?",
    it: "Dov’è la stazione ferroviaria più vicina?",
    ja: "一番近い駅はどこですか？",
  },
  {
    en: "Thank you so much for your help!",
    es: "¡Muchas gracias por tu ayuda!",
    fr: "Merci beaucoup pour ton aide !",
    de: "Vielen Dank für deine Hilfe!",
    it: "Grazie mille per il tuo aiuto!",
    ja: "手伝ってくれて本当にありがとう！",
  },
  { en: "Hello", es: "Hola", fr: "Bonjour", de: "Hallo", it: "Ciao", ja: "こんにちは" },
];

const normalize = (text: string) => text.toLowerCase().replace(/[\s\p{P}]+/gu, " ").trim();

function findPhrase(text: string): { row: Record<string, string>; language: string } | null {
  const key = normalize(text);
  for (const row of PHRASES) for (const [language, phrase] of Object.entries(row)) if (normalize(phrase) === key) return { row, language };
  return null;
}

const TRANSLATION_PROMPT = /^Translate the following text(?: from (.+?))? to (.+?)\.\n\n<text>\n([\s\S]*)\n<\/text>$/;

export function isTranslationPrompt({ prompt }: BackendParams<"ai.ask">): boolean {
  return TRANSLATION_PROMPT.test(prompt);
}

function translationReply({ prompt, system }: BackendParams<"ai.ask">): string | null {
  const match = TRANSLATION_PROMPT.exec(prompt);
  if (!match) return null;
  const [, , targetName, text] = match;
  const target = CODES[targetName.toLowerCase()] ?? targetName.slice(0, 2).toLowerCase();
  const found = findPhrase(text);
  const body = found?.row[target] ?? (found?.language === target ? text : `[${target}] ${text}`);
  return system?.includes("[[lang:") ? `[[lang:${found?.language ?? "en"}]]\n${body}` : body;
}

/** Splits a reply into small chunks, the way providers stream tokens. */
function chunks(text: string): string[] {
  return text.match(/\S+\s*|\s+/g)?.flatMap((word) => (word.length > 8 ? [word.slice(0, 4), word.slice(4)] : [word])) ?? [];
}

export function createTranslatorMock(ctx: MockContext): MockArea {
  const noProvider = typeof location !== "undefined" && new URLSearchParams(location.search).get("mockAi") === "none";
  const timers = new Map<string, ReturnType<typeof setTimeout>[]>();
  let counter = 0;
  const emit = (event: AIStreamEvent) => ctx.events.emit("ai.stream", event);

  const stream = (streamId: string, reply: string) => {
    const scheduled: ReturnType<typeof setTimeout>[] = [];
    let at = 120;
    scheduled.push(setTimeout(() => emit({ type: "start", streamId, model: MODEL }), at));
    for (const delta of chunks(reply)) {
      at += 45;
      scheduled.push(setTimeout(() => emit({ type: "text", streamId, delta }), at));
    }
    scheduled.push(
      setTimeout(() => {
        timers.delete(streamId);
        emit({ type: "done", streamId, finishReason: "stop", usage: { inputTokens: 180, outputTokens: Math.ceil(reply.length / 4) } });
      }, at + 60),
    );
    timers.set(streamId, scheduled);
  };

  return {
    handlers: {
      ...(noProvider ? { "ai.models.list": () => [] } : {}),
      "ai.chats.create": (params): AIChat => ({ id: `mock-chat-${++counter}`, title: params.title ?? "New Chat", titleSource: params.title ? "user" : "automatic", source: params.source ?? "chat", model: params.model, createdAt: Date.now(), updatedAt: Date.now() }),
      "ai.chats.delete": () => undefined,
      "ai.ask": (params) => {
        const streamId = `mock-stream-${++counter}`;
        if (noProvider) {
          setTimeout(() => emit({ type: "error", streamId, message: "Configure an AI provider and enable a model in Settings → AI before asking AI." }), 80);
        } else {
          stream(streamId, translationReply(params) ?? "This reply comes from the in-browser mock backend. Connect OpenCast to a real backend to talk to your AI provider.");
        }
        return { streamId, chatId: params.chatId };
      },
      "ai.stop": ({ streamId }) => {
        const scheduled = timers.get(streamId);
        if (!scheduled) return;
        scheduled.forEach(clearTimeout);
        timers.delete(streamId);
        emit({ type: "done", streamId, finishReason: "stopped" });
      },
    },
  };
}
