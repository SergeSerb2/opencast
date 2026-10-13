import { useEffect, useState } from "react";
import type { SettingsValues } from "@surgecast/protocol";
import { backend } from "../../../bridge/backend";
import { useBackend } from "../../../bridge/hooks";
import { Button, IconButton } from "../../../components/Button/Button";
import { TextArea } from "../../../components/TextArea/TextArea";
import { TextField } from "../../../components/TextField/TextField";
import { showFailureToast, showToast } from "../../../components/feedback/toast-store";
import { navigate } from "../../navigation";
import { CommitTextField, SettingSelect, SettingSwitch, useSettingState } from "../../ui/controls";
import { Controls, NavRow, Row, Section } from "../../ui/layout";
import { MenuButton } from "../../ui/MenuButton";
import { BuiltinPage } from "../BuiltinPage";
import { OnboardingCard } from "./onboarding";
import { ModelPicker, useEnabledModels } from "./shared";
import "./ai.css";

type WebSearchProvider = SettingsValues["ai.webSearchProvider"];

const REASONING = [
  { value: "none", title: "None" },
  { value: "low", title: "Low" },
  { value: "medium", title: "Medium" },
  { value: "high", title: "High" },
] as const;

const PRIMARY_ACTION = [
  { value: "continue-in-chat", title: "Continue in Chat" },
  { value: "copy", title: "Copy Response" },
  { value: "paste", title: "Paste Response" },
] as const;

const SEND_MESSAGE = [
  { value: "enter", title: "↵ Return" },
  { value: "cmd-enter", title: "⌘ ↵ Command Return" },
] as const;

const START_NEW_CHAT = [
  { value: "never", title: "Never" },
  { value: "5m", title: "After 5 minutes" },
  { value: "15m", title: "After 15 minutes" },
  { value: "30m", title: "After 30 minutes" },
  { value: "1h", title: "After 1 hour" },
  { value: "immediately", title: "Always" },
] as const;

const HISTORY = [
  { value: "separate", title: "Separate" },
  { value: "combined", title: "Combined" },
] as const;

const AUTO_ARCHIVE = [
  { value: "never", title: "Never" },
  { value: "1d", title: "After 1 day" },
  { value: "7d", title: "After 7 days" },
  { value: "30d", title: "After 30 days" },
  { value: "90d", title: "After 90 days" },
] as const;

const ZOOM = [0.9, 1, 1.1, 1.25, 1.5].map((value) => ({ value, title: `${Math.round(value * 100)}%` }));

const PERMISSIONS = [
  { value: "ask", title: "Ask" },
  { value: "auto-read-only", title: "Auto (read-only tools)" },
  { value: "always-allow", title: "Always Allow" },
] as const;

const WEB_SEARCH: { value: WebSearchProvider; title: string; needsKey: boolean; needsUrl?: boolean }[] = [
  { value: "none", title: "None", needsKey: false },
  { value: "tavily", title: "Tavily", needsKey: true },
  { value: "brave", title: "Brave Search", needsKey: true },
  { value: "exa", title: "Exa", needsKey: true },
  { value: "jina", title: "Jina Reader", needsKey: false },
  { value: "searxng", title: "SearXNG (self-hosted)", needsKey: false, needsUrl: true },
];

function ProfileRow() {
  const [profile, setProfile] = useSettingState("ai.profile");
  const [draft, setDraft] = useState(profile);
  useEffect(() => setDraft(profile), [profile]);
  return (
    <Row title="Profile" description="Context added to every chat and Quick AI conversation (not AI Commands): your role, interests, preferences, or how you like answers." layout="stacked">
      <TextArea
        value={draft}
        onChange={setDraft}
        onBlur={() => draft !== profile && setProfile(draft)}
        placeholder="I'm a designer in Berlin. Keep answers short and use metric units."
        minHeight={72}
        maxHeight={180}
        aria-label="Profile"
      />
    </Row>
  );
}

function WebSearchKeyRow({ provider }: { provider: Exclude<WebSearchProvider, "none"> }) {
  const { data: hasKey, refetch, error } = useBackend("ai.webSearch.hasApiKey", { provider });
  const [replacing, setReplacing] = useState(false);
  const [key, setKey] = useState("");
  const option = WEB_SEARCH.find((o) => o.value === provider);
  const save = async (value: string | null) => {
    try {
      await backend.call("ai.webSearch.setApiKey", { provider, apiKey: value });
      setKey("");
      setReplacing(false);
      refetch();
      showToast({ style: "success", title: value ? "API key saved in Keychain" : "API key removed" });
    } catch (err) {
      showFailureToast("Could not save the API key", err);
    }
  };
  const editing = replacing || !hasKey;
  return (
    <Row
      title="Web Search API Key"
      description={error ? "This backend can't store web search keys." : option?.needsKey ? `Stored in your Keychain. Get one from ${option.title}.` : "Optional — raises rate limits."}
    >
      {editing ? (
        <Controls>
          <span className="sc-s-key-field">
            <TextField
              size="small"
              type="password"
              value={key}
              onChange={setKey}
              placeholder="Paste API key"
              onKeyDown={(event) => event.key === "Enter" && key.trim() && void save(key.trim())}
              aria-label="Web search API key"
            />
          </span>
          <Button size="small" onClick={() => void save(key.trim())} disabled={!key.trim()}>
            Save
          </Button>
          {replacing && <IconButton icon="xmark-16" label="Cancel" onClick={() => setReplacing(false)} />}
        </Controls>
      ) : (
        <Controls>
          <span className="sc-s-badge" data-tone="success">
            Saved in Keychain
          </span>
          <Button size="small" variant="ghost" onClick={() => setReplacing(true)}>
            Replace
          </Button>
          <Button size="small" variant="ghost" onClick={() => void save(null)}>
            Remove
          </Button>
        </Controls>
      )}
    </Row>
  );
}

function AllowedTools() {
  const [allowed, setAllowed] = useSettingState("ai.alwaysAllowedTools");
  const { data: tools } = useBackend("ai.tools.list", undefined);
  const byName = new Map((tools ?? []).map((t) => [t.name, t]));
  const candidates = (tools ?? []).filter((t) => !allowed.includes(t.name));
  const toolsets = [...new Set(candidates.map((t) => t.toolsetTitle))];
  return (
    <Row title="Globally Allowed Tools" description="These tools run without asking in every chat. Approvals you give inside a chat stay with that chat." layout="stacked">
      <div className="sc-s-applist">
        {allowed.length ? (
          allowed.map((name) => {
            const tool = byName.get(name);
            return (
              <div key={name} className="sc-s-applist__item">
                <span className="sc-s-applist__name sc-truncate">{tool?.title ?? name}</span>
                <span className="sc-s-applist__id sc-truncate">{tool ? tool.toolsetTitle : "Unavailable"}</span>
                <IconButton icon="minus-circle-16" label={`Stop allowing ${tool?.title ?? name}`} onClick={() => setAllowed(allowed.filter((n) => n !== name))} />
              </div>
            );
          })
        ) : (
          <div className="sc-s-card-empty sc-s-card-empty--compact">No tools run without asking.</div>
        )}
        <div className="sc-s-applist__footer">
          <MenuButton
            icon="plus-16"
            align="start"
            width={300}
            disabled={!candidates.length}
            searchable
            emptyText="No more tools"
            sections={toolsets.map((title) => ({ title, items: candidates.filter((t) => t.toolsetTitle === title).map((t) => ({ id: t.name, title: t.title, keywords: [t.name, t.description] })) }))}
            onSelect={(item) => setAllowed([...allowed, item.id])}
          >
            Allow Tool…
          </MenuButton>
        </div>
      </div>
    </Row>
  );
}

function ToolsSection() {
  const [provider] = useSettingState("ai.webSearchProvider");
  const [baseUrl, setBaseUrl] = useSettingState("ai.webSearchBaseUrl");
  const option = WEB_SEARCH.find((o) => o.value === provider);
  return (
    <Section title="Tools">
      <Row title="Web Search Provider" description="Lets AI search the web. Pick a service and add its key; SearXNG uses your own instance.">
        <SettingSelect setting="ai.webSearchProvider" options={WEB_SEARCH.map(({ value, title }) => ({ value, title }))} label="Web Search Provider" />
      </Row>
      {provider !== "none" && <WebSearchKeyRow key={provider} provider={provider} />}
      {provider !== "none" && (
        <Row
          title="Web Search Base URL"
          description={option?.needsUrl ? "Required: the URL of your SearXNG instance with JSON output enabled." : "Optional — override the service URL, e.g. for a proxy."}
        >
          <CommitTextField
            value={baseUrl ?? ""}
            onCommit={(value) => setBaseUrl(value.trim() || null)}
            placeholder={option?.needsUrl ? "https://search.example.com" : "Default"}
            width={220}
            validate={(value) => {
              if (!value.trim()) return option?.needsUrl ? "SearXNG needs a URL" : null;
              try {
                const url = new URL(value.trim());
                return url.protocol === "http:" || url.protocol === "https:" ? null : "Use an http(s) URL";
              } catch {
                return "Enter a valid URL";
              }
            }}
            label="Web Search Base URL"
          />
        </Row>
      )}
      <Row title="Permissions" description="Whether tools ask before running. Ask confirms anything that changes data; Auto runs read-only tools without asking. Each chat can override this.">
        <SettingSelect setting="ai.toolConfirmationMode" options={PERMISSIONS} label="Permissions" />
      </Row>
      <AllowedTools />
      <Row title="Show Agents in Root Search" description="List your agents in root search so you can start a chat with one directly.">
        <SettingSwitch setting="ai.searchAgents" label="Show Agents in Root Search" />
      </Row>
    </Section>
  );
}

function Navigation() {
  const { data: providers } = useBackend("ai.providers.list", undefined);
  const { data: models } = useEnabledModels();
  const { data: commands } = useBackend("ai.commands.list", undefined);
  const { data: presets } = useBackend("ai.presets.list", undefined);
  const { data: mcp } = useBackend("ai.mcp.list", undefined);
  const count = (n: number | undefined, noun: string) => (n === undefined ? undefined : `${n} ${noun}${n === 1 ? "" : "s"}`);
  return (
    <Section anchor="ai-navigation">
      <NavRow
        title="Models & Providers"
        description="Add API keys, local models and OpenAI-compatible endpoints."
        detail={providers ? `${count(providers.length, "provider")} · ${count(models?.length ?? 0, "model")}` : undefined}
        onClick={() => navigate("ai/models")}
      />
      <NavRow title="Agents" description="Reusable chat setups with their own instructions, model and tools." detail={count(presets?.length, "agent")} onClick={() => navigate("ai/presets")} />
      <NavRow title="AI Commands" description="Turn the prompts you use every day into commands." detail={count(commands?.length, "command")} onClick={() => navigate("ai/commands")} />
      <NavRow title="MCP Servers" description="Give AI new tools from Model Context Protocol servers." detail={count(mcp?.length, "server")} onClick={() => navigate("mcp")} />
    </Section>
  );
}

/** Settings → AI: navigation to subpages, default models, chat, personalization, tools. */
export function AIPage() {
  const { data: models, isLoading } = useEnabledModels();
  const [quickAiModel, setQuickAiModel] = useSettingState("ai.quickAiModel");
  const [chatModel, setChatModel] = useSettingState("ai.chatModel");
  const [commandsModel, setCommandsModel] = useSettingState("ai.commandsModel");
  const [titleModel, setTitleModel] = useSettingState("ai.titleModel");
  return (
    <BuiltinPage id="ai">
      {!isLoading && !models?.length && <OnboardingCard />}
      <Navigation />
      <Section title="Default Models" description="Automatic uses the first enabled model.">
        <Row title="Quick AI Model">
          <ModelPicker value={quickAiModel} onChange={setQuickAiModel} label="Quick AI Model" />
        </Row>
        <Row title="AI Chat Model" description="New chats start with this model.">
          <ModelPicker value={chatModel} onChange={setChatModel} label="AI Chat Model" />
        </Row>
        <Row title="AI Commands Model" description="Used by AI Commands that don't choose their own model.">
          <ModelPicker value={commandsModel} onChange={setCommandsModel} label="AI Commands Model" />
        </Row>
        <Row title="Title Generation Model" description="Names your chats. A small, fast model is plenty.">
          <ModelPicker value={titleModel} onChange={setTitleModel} label="Title Generation Model" automaticTitle="Same as Chat" />
        </Row>
        <Row title="Reasoning Effort" description="How long reasoning models think in Quick AI. Ignored by models without reasoning.">
          <SettingSelect setting="ai.quickAiReasoningEffort" options={REASONING} label="Reasoning Effort" />
        </Row>
      </Section>
      <Section title="Quick AI">
        <Row title="Tab to Ask AI" description="Press Tab in root search to ask AI about what you typed.">
          <SettingSwitch setting="ai.tabToAskAi" label="Tab to Ask AI" />
        </Row>
        <Row title="Primary Action" description="What ↵ does after Quick AI answers.">
          <SettingSelect setting="ai.primaryAction" options={PRIMARY_ACTION} label="Primary Action" />
        </Row>
      </Section>
      <Section title="Chat">
        <Row title="Send Message" description="Shortcut for sending messages in Quick AI and AI Chat.">
          <SettingSelect setting="ai.sendMessage" options={SEND_MESSAGE} label="Send Message" />
        </Row>
        <Row title="Start New Chat" description="Start a new chat after this long when you open Quick AI or AI Chat.">
          <SettingSelect setting="ai.startNewChat" options={START_NEW_CHAT} label="Start New Chat" />
        </Row>
        <Row title="Follow-up Behavior" description="Queue follow-ups while AI runs, or steer the current run. The alternate send shortcut does the opposite for one message.">
          <SettingSelect setting="ai.runningSendAction" options={[{ value: "queue", title: "Queue" }, { value: "steer", title: "Steer" }]} label="Follow-up Behavior" />
        </Row>
        <Row title="Conversation History" description="Show Quick AI and AI Chat conversations together or keep them apart.">
          <SettingSelect setting="ai.conversationHistory" options={HISTORY} label="Conversation History" />
        </Row>
        <Row title="Auto-Archive Chats" description="Archive chats after this much inactivity. Pinned chats are never archived.">
          <SettingSelect setting="ai.autoArchiveChats" options={AUTO_ARCHIVE} label="Auto-Archive Chats" />
        </Row>
        <Row title="Zoom" description="Text size of AI conversations.">
          <SettingSelect setting="ai.zoom" options={ZOOM} label="Zoom" />
        </Row>
        <Row title="Background Notifications" description="Show a system notification when a chat finishes in the background.">
          <SettingSwitch setting="ai.backgroundNotifications" label="Background Notifications" />
        </Row>
        <Row title="Prevent Sleep During AI Runs" description="Keep this Mac awake while AI is working.">
          <SettingSwitch setting="ai.preventIdleSleep" label="Prevent Sleep During AI Runs" />
        </Row>
      </Section>
      <Section title="Personalization">
        <ProfileRow />
        <Row title="Memory" description="Keep a short summary of what you tell AI to remember, like “Remember I'm vegetarian”, and use it in new chats.">
          <SettingSwitch setting="ai.memoryEnabled" label="Memory" />
        </Row>
      </Section>
      <ToolsSection />
      <Section title="Warnings">
        <Row title="Show Warning Before Deleting Chats">
          <SettingSwitch setting="ai.deleteChatWarning" label="Show Warning Before Deleting Chats" />
        </Row>
        <Row title="Show Warning Before Editing Messages">
          <SettingSwitch setting="ai.editMessageWarning" label="Show Warning Before Editing Messages" />
        </Row>
        <Row title="Show Warning Before Deleting Agents">
          <SettingSwitch setting="ai.deleteAgentWarning" label="Show Warning Before Deleting Agents" />
        </Row>
        <Row title="Show Warning Before Deleting AI Commands">
          <SettingSwitch setting="ai.deleteAiCommandWarning" label="Show Warning Before Deleting AI Commands" />
        </Row>
      </Section>
    </BuiltinPage>
  );
}
