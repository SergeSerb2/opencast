import { useEffect, useMemo, useRef, useState } from "react";
import type { ImageLike } from "@surgecast/protocol";
import { useBackend } from "../../../bridge/hooks";
import { native } from "../../../bridge/native";
import { getSetting, useSettings } from "../../../bridge/settings";
import { Action, ActionPanel, Dropdown, EmptyView, IconButton, ScrollArea, showFailureToast, showHUD, showToast, useNavigation, useRegisterActions, useViewController, ViewFrame } from "../../../components";
import { sc } from "../../../lib/keyboard";
import type { LauncherViewProps } from "../registry";
import { initialLanguagePair, readStoredPair, swapLanguagePair, writeStoredPair, type LanguagePair } from "./language-pair";
import { AUTO_LANGUAGE, LANGUAGES, languageName } from "./languages";
import { countLabel, translatorFontSize } from "./text-metrics";
import { useTranslation, type TranslationState } from "./useTranslation";
import "./translator.css";

export interface TranslatorProps {
  /** Fallback text from root search. */
  query?: string;
  arguments?: { text?: string };
  sourceLanguage?: string;
  targetLanguage?: string;
}

const SOURCE_ID = "sc-translator-source";
const TARGET_ID = "sc-translator-target";

const LANGUAGE_ITEMS = LANGUAGES.map((l) => ({ value: l.code, title: l.name, keywords: [l.code] }));

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable));
}

/** `translator` view: two-pane translation through the user's own AI provider. */
export function TranslatorView({ props, title, icon }: LauncherViewProps<TranslatorProps>) {
  const { settings, loaded } = useSettings();
  const defaultSource = settings["translator.defaultSourceLanguage"];
  const defaultTarget = settings["translator.defaultTargetLanguage"];
  const defaults = useMemo(() => ({ source: defaultSource, target: defaultTarget }), [defaultSource, defaultTarget]);
  if (!loaded) return <ViewFrame isLoading navigationTitle={title ?? "Translate"} navigationIcon={icon}>{null}</ViewFrame>;
  const override = { source: props.sourceLanguage, target: props.targetLanguage };
  return (
    <Translator
      title={title ?? "Translate"}
      icon={icon}
      initialText={props.arguments?.text ?? props.query ?? ""}
      initialPair={initialLanguagePair(readStoredPair(localStorage), defaults, override)}
      defaults={defaults}
      remember={!props.sourceLanguage && !props.targetLanguage}
      prefillSelection={settings["translator.prefillFromSelectedText"]}
    />
  );
}

interface TranslatorComponentProps {
  title: string;
  icon?: ImageLike;
  initialText: string;
  initialPair: LanguagePair;
  defaults: LanguagePair;
  /** Store the pair for next time (not when a command chose the languages). */
  remember: boolean;
  prefillSelection: boolean;
}

function Translator({ title, icon, initialText, initialPair, defaults, remember, prefillSelection }: TranslatorComponentProps) {
  const [text, setText] = useState(initialText);
  const [pair, setPair] = useState(initialPair);
  const { data: models, refetch: refreshModels } = useBackend("ai.models.list", {});
  const noModels = models !== undefined && models.length === 0;
  const translation = useTranslation({ text, source: pair.source, target: pair.target, enabled: !noModels });
  const setupProblem = noModels ? "setup" : translation.status === "error" && translation.errorKind !== "other" ? translation.errorKind : undefined;

  useEffect(() => {
    if (remember) writeStoredPair(localStorage, pair, defaults);
  }, [pair, remember, defaults]);

  useEffect(() => {
    if (initialText || !prefillSelection || !native.available) return;
    native.call("input.selectedText").then((selected) => selected?.trim() && setText((current) => current || selected), () => undefined);
  }, [initialText, prefillSelection]);

  const detected = pair.source === AUTO_LANGUAGE ? translation.detected : undefined;
  const sourceSections = useMemo(
    () => [{ items: [{ value: AUTO_LANGUAGE, title: detected ? `${languageName(detected)} (Detected)` : "Detect Language", icon: "wand-16" }] }, { title: "Languages", items: LANGUAGE_ITEMS }],
    [detected],
  );

  return (
    <ViewFrame
      navigationTitle={title}
      navigationIcon={icon}
      isLoading={translation.status === "translating"}
      primaryShortcut={setupProblem ? "enter" : "cmd-enter"}
      headerContent={
        setupProblem ? undefined : (
          <div className="sc-translator__langs">
            <span className="sc-translator__lang">
              <Dropdown id={SOURCE_ID} variant="nav" aria-label="Choose source language" value={pair.source} sections={sourceSections} searchPlaceholder="Search languages…" onChange={(source) => setPair((p) => ({ ...p, source }))} />
            </span>
            <span className="sc-translator__lang sc-translator__lang--target">
              <Dropdown id={TARGET_ID} variant="nav" aria-label="Choose target language" value={pair.target} items={LANGUAGE_ITEMS} searchPlaceholder="Search languages…" onChange={(target) => setPair((p) => ({ ...p, target }))} />
            </span>
          </div>
        )
      }
    >
      <TranslatorBody text={text} setText={setText} pair={pair} setPair={setPair} translation={{ ...translation, retry: () => { refreshModels(); translation.retry(); } }} setupProblem={setupProblem} />
    </ViewFrame>
  );
}

interface TranslatorBodyProps {
  text: string;
  setText: (text: string) => void;
  pair: LanguagePair;
  setPair: (pair: LanguagePair) => void;
  translation: TranslationState & { retry: () => void };
  setupProblem?: "setup" | "auth";
}

const openAiSettings = () => native.call("window.show", { kind: "settings", route: "ai" }).catch((error: unknown) => showFailureToast("Failed to open Settings", error));

async function speak(text: string) {
  if (!text.trim()) return;
  try {
    await native.call("speech.say", { text });
  } catch (error) {
    showFailureToast("Speech isn't available", error);
  }
}

async function copy(text: string, what: string) {
  if (!text.trim()) {
    showToast({ style: "failure", title: `No ${what} to copy yet` });
    return;
  }
  try {
    await native.call("clipboard.write", { content: { kind: "text", text } });
    await showHUD("Copied to Clipboard");
  } catch (error) {
    showFailureToast("Failed to copy", error);
  }
}

async function paste(text: string) {
  if (!text.trim()) {
    showToast({ style: "failure", title: "No translation to paste yet" });
    return;
  }
  try {
    await native.call("input.paste", { content: { kind: "text", text } });
  } catch (error) {
    showFailureToast("Failed to paste", error);
  }
}

function TranslatorBody({ text, setText, pair, setPair, translation, setupProblem }: TranslatorBodyProps) {
  const navigation = useNavigation();
  const view = useViewController();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const primary = getSetting("translator.primaryAction");
  const output = translation.text;
  const fresh = translation.forText === text && translation.forSource === pair.source && translation.forTarget === pair.target;
  const ready = fresh && translation.status === "done" && Boolean(output.trim());
  const swapped = swapLanguagePair(pair, fresh ? translation.detected : undefined);
  const fontSize = translatorFontSize(text, output);

  // Keep typing in the source field: after the action panel or a language menu closes, and for stray keys.
  useEffect(() => {
    if (view.isActive && !view.isActionPanelOpen) inputRef.current?.focus({ preventScroll: true });
  }, [view.isActive, view.isActionPanelOpen, setupProblem]);
  useEffect(
    () =>
      view.registerKeyHandler((event) => {
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !isEditable(event.target)) inputRef.current?.focus();
        return false;
      }),
    [view],
  );

  useEffect(() => {
    if (translation.status === "error" && translation.errorKind === "other" && translation.error) showToast({ style: "failure", title: "Translation failed", message: translation.error });
  }, [translation.status, translation.errorKind, translation.error]);

  const focusInput = () => requestAnimationFrame(() => inputRef.current?.focus());
  const swap = () => {
    if (!swapped) return;
    setPair(swapped);
    if (fresh && output.trim()) setText(output);
    focusInput();
  };

  const actions = setupProblem ? (
    <ActionPanel>
      <Action title="Open AI Settings" icon="cog-16" onAction={openAiSettings} />
      <Action title="Try Again" icon="arrow-clockwise-16" shortcut={sc("cmd", "r")} onAction={translation.retry} />
    </ActionPanel>
  ) : (
    <ActionPanel title="Translator">
      {primary === "paste" ? [
        <Action key="paste" title="Paste to Active App" icon="clipboard-16" disabled={!ready} onAction={() => paste(output)} />,
        <Action key="copy" title="Copy Translation" icon="copy-clipboard-16" shortcut={sc("cmd", "return")} disabled={!ready} onAction={() => copy(output, "translation")} />,
      ] : [
        <Action key="copy" title="Copy Translation" icon="copy-clipboard-16" shortcut={sc("cmd", "return")} disabled={!ready} onAction={() => copy(output, "translation")} />,
        <Action key="paste" title="Paste to Active App" icon="clipboard-16" shortcut={sc("opt", "cmd", "return")} disabled={!ready} onAction={() => paste(output)} />,
      ]}
      <Action title="Copy Source Text" icon="copy-clipboard-16" shortcut={sc("opt", "return")} onAction={() => copy(text, "text")} />
      <ActionPanel.Section>
        <Action title="Swap Languages" icon="arrow-left-right-16" shortcut={sc("cmd", "s")} disabled={!swapped} onAction={swap} />
        <Action title="Change Source Language" icon="flag-16" shortcut={sc("cmd", "shift", "p")} onAction={() => document.getElementById(SOURCE_ID)?.click()} />
        <Action title="Change Target Language" icon="flag-16" shortcut={sc("cmd", "p")} onAction={() => document.getElementById(TARGET_ID)?.click()} />
      </ActionPanel.Section>
      <ActionPanel.Section>
        <Action title="Listen to Translation" icon="speaker-on-16" shortcut={sc("cmd", "l")} disabled={!ready} onAction={() => speak(output)} />
        <Action title="Listen to Source Text" icon="speaker-on-16" shortcut={sc("cmd", "shift", "l")} disabled={!text.trim()} onAction={() => speak(text)} />
        <Action title="Translate Again" icon="arrow-clockwise-16" shortcut={sc("cmd", "r")} disabled={!text.trim()} onAction={translation.retry} />
        <Action
          title="Clear Text"
          icon="eraser-16"
          shortcut={sc("cmd", "delete")}
          disabled={!text}
          onAction={() => {
            setText("");
            focusInput();
          }}
        />
      </ActionPanel.Section>
    </ActionPanel>
  );
  useRegisterActions(actions);

  if (setupProblem) {
    return (
      <div className="sc-translator__empty">
        <EmptyView
          title={setupProblem === "auth" ? "Your AI Provider Rejected the Request" : "No AI Model Set Up"}
          description={
            setupProblem === "auth"
              ? "Translator couldn't sign in to your AI provider. Check its API key in Settings › AI, then try again."
              : "Translator uses your own AI provider. Add a provider and enable a model in Settings › AI to start translating."
          }
          action={{ title: "Open AI Settings", onAction: openAiSettings }}
        />
      </div>
    );
  }

  const status = translation.status;
  const showError = status === "error" && translation.error;
  const style = { fontSize, lineHeight: `${Math.round(fontSize * 1.25)}px` };

  return (
    <div className="sc-translator">
      <section className="sc-translator__pane">
        <textarea
          ref={inputRef}
          className="sc-translator__input"
          style={style}
          value={text}
          placeholder="Enter text…"
          aria-label="Text to translate"
          spellCheck={false}
          onChange={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !e.repeat && !e.metaKey && !e.altKey && e.currentTarget.value === "") {
              e.preventDefault();
              navigation.pop();
            }
          }}
        />
        <div className="sc-translator__pane-footer">
          <IconButton icon="speaker-on-16" label="Listen to Source Text" size={28} disabled={!text.trim()} onClick={() => speak(text)} />
          {text && <span className="sc-translator__count">{countLabel(text)}</span>}
        </div>
      </section>
      <IconButton className="sc-translator__swap" icon="arrow-left-right-16" label="Swap Languages (⌘S)" size={28} disabled={!swapped} onClick={swap} />
      <section className="sc-translator__pane sc-translator__pane--target" aria-live="polite">
        <ScrollArea className="sc-translator__output" fade={{ top: 24, bottom: 24 }}>
          <div className="sc-translator__output-text" style={style} lang={pair.target} data-stale={(status === "translating" && !fresh) || undefined}>
            {showError ? (
              <span className="sc-translator__error">{translation.error}</span>
            ) : output && text.trim() ? (
              output
            ) : (
              <span className="sc-translator__placeholder">{status === "translating" ? "Translating…" : "Translation"}</span>
            )}
          </div>
        </ScrollArea>
        <div className="sc-translator__pane-footer">
          <IconButton icon="speaker-on-16" label="Listen to Translation" size={28} disabled={!ready} onClick={() => speak(output)} />
          {showError && <span className="sc-translator__count">⌘R to try again</span>}
        </div>
      </section>
    </div>
  );
}
