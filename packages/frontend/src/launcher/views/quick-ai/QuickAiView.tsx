import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from "react";
import type { AIMessage, ModelRef } from "@surgecast/protocol";
import { backend } from "../../../bridge/backend";
import { native } from "../../../bridge/native";
import { setSetting, useSetting } from "../../../bridge/settings";
import { IconButton } from "../../../components/Button/Button";
import type { ActionModel, ActionPanelModel } from "../../../components/actions/model";
import { showHUD } from "../../../components/feedback/hud";
import { showFailureToast } from "../../../components/feedback/toast-store";
import { FloatingToastHost } from "../../../components/Toast/InlineToast";
import { useNavigation, useViewController } from "../../../components/View/contexts";
import { ViewFrame } from "../../../components/View/ViewFrame";
import { sc } from "../../../lib/keyboard";
import { AddMenu } from "../../../ai-chat/composer/AddMenu";
import { Composer, EMPTY_DRAFT, type ComposerDraft, type ComposerHandle } from "../../../ai-chat/composer/Composer";
import { ModelPicker } from "../../../ai-chat/components/ModelPicker";
import { copyText } from "../../../ai-chat/lib/clipboard";
import { groupByProvider, modelName, resolveModelRef } from "../../../ai-chat/model/models";
import { draftContent, startSend } from "../../../ai-chat/state/send";
import { useAIResources } from "../../../ai-chat/state/useAIResources";
import { useChatSession, type ChatSession } from "../../../ai-chat/state/useChatSession";
import { Transcript } from "../../../ai-chat/transcript/Transcript";
import { hideLauncher } from "../../launch";
import { useNavigationStore } from "../../navigation";
import type { LauncherViewProps } from "../registry";
import "./quick-ai.css";

export interface QuickAiProps {
  prompt?: string;
  aiCommandId?: string;
  presetId?: string;
  arguments?: Record<string, string>;
}

function latestAnswer(session: ChatSession): AIMessage | undefined {
  for (let i = session.transcript.length - 1; i >= 0; i--) {
    const item = session.transcript[i];
    if (item.kind === "message") return item.message.role === "assistant" && item.message.content ? item.message : undefined;
  }
  return undefined;
}

/** “Ask Anything” welcome shown before the first question. */
function Welcome() {
  return (
    <div className="sc-quick-ai-welcome">
      <div className="sc-quick-ai-welcome__title">Ask Anything</div>
      <div className="sc-quick-ai-welcome__text">The quickest way to ask AI, right in the launcher.</div>
    </div>
  );
}

interface BodyProps {
  session: ChatSession;
  draft: ComposerDraft;
  setDraft: (draft: ComposerDraft) => void;
  send: (draft: ComposerDraft) => void;
  runPrimary: () => boolean;
  composer: RefObject<ComposerHandle | null>;
  resources: ReturnType<typeof useAIResources>;
}

/** Transcript and footer; lives inside the ViewFrame to reach its action panel and key handling. */
function QuickAiBody({ session, draft, setDraft, send, runPrimary, composer, resources }: BodyProps) {
  const view = useViewController();
  const sendKey = useSetting("ai.sendMessage");
  const zoom = useSetting("general.uiZoom");
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);
  const footer = useRef<HTMLDivElement>(null);
  const [footerHeight, setFooterHeight] = useState(44);

  useEffect(() => {
    const el = footer.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setFooterHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Typing anywhere goes to the composer; it regains focus when panels close.
  useEffect(
    () =>
      view.registerKeyHandler((event) => {
        const target = event.target as HTMLElement | null;
        const editable = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
        if (!editable && event.key.length === 1 && !event.metaKey && !event.ctrlKey) composer.current?.focus();
        return false;
      }),
    [view, composer],
  );
  useEffect(() => {
    if (view.isActive && !view.isActionPanelOpen && !addAnchor) composer.current?.focus();
  }, [view.isActive, view.isActionPanelOpen, addAnchor, composer]);

  const onUnhandledKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // ↵ on an empty draft runs the primary action (stop while generating, else per “Primary Action”).
    if (event.key === "Enter" && !event.metaKey && !event.shiftKey && !event.altKey && !draft.text.trim()) return runPrimary();
    return false;
  };

  const style = { "--ai-top-clearance": "calc(var(--main-window-header-height) + var(--space-16))", "--ai-bottom-clearance": `${footerHeight + 8 + 16}px` } as CSSProperties;
  return (
    <div className="sc-quick-ai" style={style}>
      <Transcript topFade={Math.round(80 * zoom)} session={session} variant="quick-ai" models={resources.models} toolsets={resources.toolsets} empty={<Welcome />} onCopy={(message) => void copyText(message.content)} />
      <div ref={footer} className="sc-quick-ai__footer">
        <IconButton icon="plus-16" iconSize={20} size={36} variant="glass" className="sc-quick-ai__slot" label="Add Context (⇧⌘K)" data-state={addAnchor ? "open" : undefined} onClick={(e) => setAddAnchor(addAnchor ? null : e.currentTarget)} />
        <div className="sc-quick-ai__composer">
          <Composer
            ref={composer}
            variant="quick-ai"
            draft={draft}
            onDraftChange={setDraft}
            onSubmit={send}
            onStop={session.stop}
            isGenerating={session.isGenerating}
            disabled={resources.modelsReady && resources.models.length === 0}
            toolsets={resources.toolsets}
            commands={resources.commands}
            presets={[]}
            sendKey={sendKey}
            onUnhandledKey={onUnhandledKey}
            autoFocus
          />
        </div>
        <IconButton icon="command-symbol-16" iconSize={20} size={36} variant="glass" className="sc-quick-ai__slot" label="Actions (⌘K)" data-state={view.isActionPanelOpen ? "open" : undefined} onClick={() => (view.isActionPanelOpen ? view.closeActions() : view.openActions())} />
      </div>
      <AddMenu open={Boolean(addAnchor)} anchor={addAnchor} onClose={() => setAddAnchor(null)} windowKind="main" includeSelectedText onAdd={(added) => setDraft({ ...draft, attachments: [...draft.attachments, ...added] })} />
      <FloatingToastHost />
    </div>
  );
}

/**
 * Quick AI inside the launcher: Tab from root search (the query is the
 * prompt) or an AI Command with Quick AI output. Answers stream via `ai.ask`
 * into a Quick AI chat that “Open in AI Chat” hands over to the chat window.
 */
export function QuickAiView({ props, title: entryTitle }: LauncherViewProps<QuickAiProps>) {
  const navigation = useNavigation();
  const resources = useAIResources();
  const { models } = resources;
  const quickAiModel = useSetting("ai.quickAiModel");
  const primaryPreference = useSetting("ai.primaryAction");
  const [chatId, setChatId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ComposerDraft>(EMPTY_DRAFT);
  const [pickedModel, setPickedModel] = useState<ModelRef | undefined>();
  const [modelAnchor, setModelAnchor] = useState<HTMLElement | null>(null);
  const [commandName, setCommandName] = useState<string | undefined>();
  const [previousApp, setPreviousApp] = useState<string | undefined>();
  const composer = useRef<ComposerHandle>(null);
  const session = useChatSession(chatId, setChatId);
  const chat = session.chat;
  const model = resolveModelRef(models, chat?.model, pickedModel, quickAiModel);
  const answer = latestAnswer(session);

  useEffect(() => {
    native
      .call("apps.previous")
      .then((app) => setPreviousApp(app?.name))
      .catch(() => undefined);
  }, []);

  const send = useCallback(
    async (submitted: ComposerDraft) => {
      let content: string;
      try {
        content = await draftContent(submitted);
      } catch (error) {
        showFailureToast("Can’t run command", error);
        return;
      }
      setDraft(EMPTY_DRAFT);
      const started = await session.run({ content, attachments: submitted.attachments }, () => startSend({ content, draft: submitted, chat: session.chat, source: "quick-ai", model, toolsets: resources.toolsets }));
      if (!started) setDraft(submitted);
    },
    [session, model, resources.toolsets],
  );

  // Launch input: an AI Command, or the root search text as the first question.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    if (props.aiCommandId) {
      started.current = true;
      const id = props.aiCommandId;
      setCommandName(entryTitle);
      void (async () => {
        const command = (await backend.call("ai.commands.list").catch(() => [])).find((c) => c.id === id);
        if (command) setCommandName(command.name);
        const run = await session.run(null, async () => {
          const result = await backend.call("ai.commands.run", { id, arguments: props.arguments });
          if (!result.chatId) throw new Error("The AI command did not start a chat");
          return { streamId: result.streamId, chatId: result.chatId };
        });
        if (!run || !command) return;
        if (command.output === "window") {
          void native.call("window.show", { kind: "ai-chat", route: run.chatId }).catch(() => undefined);
          useNavigationStore.getState().popToRoot({ clearSearch: true });
          hideLauncher();
        } else if (command.output === "paste" || command.output === "replace") {
          // The backend pastes into the frontmost app once the answer is complete.
          useNavigationStore.getState().popToRoot({ clearSearch: true });
          hideLauncher();
        }
      })();
      return;
    }
    started.current = true;
    if (props.prompt?.trim()) void send({ text: props.prompt.trim(), attachments: [] });
  }, [props.aiCommandId, props.arguments, props.prompt, entryTitle, send, session]);

  const continueInChat = useCallback(async () => {
    const id = session.chatId;
    if (!id) return;
    try {
      await backend.call("ai.chats.update", { id, patch: { source: "chat" } });
      await native.call("window.show", { kind: "ai-chat", route: id });
      useNavigationStore.getState().popToRoot({ clearSearch: true });
      hideLauncher();
    } catch (error) {
      showFailureToast("Could not open AI Chat", error);
    }
  }, [session.chatId]);

  const copyAnswer = useCallback(async () => {
    if (!answer) return;
    await copyText(answer.content);
    await showHUD("Copied to Clipboard");
  }, [answer]);

  const pasteAnswer = useCallback(async () => {
    if (!answer) return;
    try {
      await native.call("input.paste", { content: { kind: "text", text: answer.content } });
      useNavigationStore.getState().popToRoot({ clearSearch: true });
    } catch (error) {
      showFailureToast("Could not paste", error);
    }
  }, [answer]);

  const regenerate = useCallback(
    (withModel?: ModelRef) => {
      const id = session.chatId;
      if (!answer || !id) return;
      void session.run(null, async () => {
        const result = await backend.call("ai.chats.send", { chatId: id, content: "", regenerateMessageId: answer.id, model: withModel });
        return { streamId: result.streamId, chatId: id, assistantMessageId: result.assistantMessageId };
      });
    },
    [answer, session],
  );

  const changeModel = useCallback(
    (ref: ModelRef) => {
      setPickedModel(ref);
      void setSetting("ai.quickAiModel", ref).catch(() => undefined);
      if (session.chatId) backend.call("ai.chats.update", { id: session.chatId, patch: { model: ref } }).catch((error: unknown) => showFailureToast("Could not change model", error));
    },
    [session.chatId],
  );

  const newQuestion = useCallback(() => {
    setChatId(null);
    setDraft(EMPTY_DRAFT);
    setCommandName(undefined);
    composer.current?.focus();
  }, []);

  const actions = useMemo<ActionPanelModel>(() => {
    const done = Boolean(answer) && !session.isGenerating;
    const byKind: Record<"continue-in-chat" | "copy" | "paste", ActionModel> = {
      "continue-in-chat": { id: "continue", title: "Continue in Chat", icon: "open-in-window-16", shortcut: sc("cmd", "j"), disabled: !session.chatId, onAction: continueInChat },
      copy: { id: "copy", title: "Copy Answer", icon: "copy-clipboard-16", shortcut: sc("shift", "cmd", "c"), disabled: !done, onAction: copyAnswer },
      paste: { id: "paste", title: `Paste to ${previousApp ?? "Active App"}`, icon: "text-cursor-16", shortcut: sc("shift", "cmd", "v"), disabled: !done, onAction: pasteAnswer },
    };
    const order = [primaryPreference, ...(["continue-in-chat", "copy", "paste"] as const).filter((k) => k !== primaryPreference)];
    const answerActions = order.map((k) => byKind[k]);
    const stop: ActionModel[] = session.isGenerating ? [{ id: "stop", title: "Stop Response", icon: "stop-16", shortcut: sc("cmd", "."), onAction: session.stop }] : [];
    return {
      title: chat?.title && chat.title !== "New Chat" ? chat.title : "Quick AI",
      sections: [
        { actions: [...stop, ...answerActions] },
        {
          actions: [
            { id: "regenerate", title: "Regenerate", icon: "arrow-clockwise-16", shortcut: sc("cmd", "r"), disabled: !done, onAction: () => regenerate() },
            {
              id: "model",
              title: "Change Model",
              icon: "stars-16",
              shortcut: sc("shift", "cmd", "m"),
              submenu: {
                searchPlaceholder: "Search models…",
                sections: groupByProvider(models).map((group) => ({
                  title: group.providerName,
                  actions: group.models.map((m) => ({
                    id: `model:${m.ref}`,
                    title: m.name,
                    icon: m.ref === model ? "checkmark-16" : undefined,
                    keywords: [m.modelId],
                    onAction: () => {
                      changeModel(m.ref);
                      if (done) regenerate(m.ref);
                    },
                  })),
                })),
              },
            },
            { id: "new", title: "New Question", icon: "pencil-square-16", shortcut: sc("cmd", "n"), onAction: newQuestion },
          ],
        },
      ],
    };
  }, [answer, session, chat, primaryPreference, previousApp, models, model, continueInChat, copyAnswer, pasteAnswer, regenerate, changeModel, newQuestion]);

  /** ↵ on an empty composer: stop a running answer, otherwise the primary action. */
  const runPrimary = () => {
    const first = actions.sections[0]?.actions.find((a) => !a.disabled);
    if (!first?.onAction) return false;
    Promise.resolve(first.onAction()).catch((error: unknown) => showFailureToast(`${first.title} failed`, error));
    return true;
  };

  const title = chat && chat.title !== "New Chat" ? chat.title : (commandName ?? (props.aiCommandId ? entryTitle : undefined) ?? "New Chat");
  const isNew = title === "New Chat";

  return (
    <ViewFrame
      leading="back"
      hideFooter
      actions={actions}
      navigationTitle={entryTitle ?? "Quick AI"}
      className="sc-quick-ai-view"
      headerContent={
        <div className="sc-quick-ai-title">
          <span className="sc-quick-ai-title__name sc-truncate" data-new={isNew || undefined}>
            {title}
          </span>
          <button type="button" className="sc-quick-ai-title__model sc-truncate" title="Change Model (⇧⌘M)" onMouseDown={(e) => e.preventDefault()} onClick={(e) => setModelAnchor(e.currentTarget)}>
            {models.length ? modelName(models, model) : "No Model"}
          </button>
        </div>
      }
      headerAccessory={<IconButton icon="open-in-window-16" iconSize={20} size={28} label="Open in AI Chat (⌘J)" disabled={!session.chatId} onMouseDown={(e) => e.preventDefault()} onClick={() => void continueInChat()} />}
      onEscape={() => navigation.pop()}
    >
      <QuickAiBody session={session} draft={draft} setDraft={setDraft} send={(d) => void send(d)} runPrimary={runPrimary} composer={composer} resources={resources} />
      <ModelPicker open={Boolean(modelAnchor)} anchor={modelAnchor} onClose={() => setModelAnchor(null)} models={models} value={model} onPick={(ref) => {
          changeModel(ref);
          if (answer && !session.isGenerating) regenerate(ref);
        }}
      />
    </ViewFrame>
  );
}
