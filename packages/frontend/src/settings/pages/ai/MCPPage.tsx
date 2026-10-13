import { useState } from "react";
import type { BackendResult } from "@opencast/protocol";
import { backend } from "../../../bridge/backend";
import { errorMessage } from "../../../bridge/errors";
import { useBackend } from "../../../bridge/hooks";
import { Button } from "../../../components/Button/Button";
import { SegmentedControl } from "../../../components/SegmentedControl/SegmentedControl";
import { Switch } from "../../../components/Switch/Switch";
import { TextArea } from "../../../components/TextArea/TextArea";
import { TextField } from "../../../components/TextField/TextField";
import { confirmAlert } from "../../../components/feedback/alert-store";
import { showFailureToast, showToast } from "../../../components/feedback/toast-store";
import { Icon } from "../../../icons/Icon";
import { Dialog, DialogField } from "../../ui/Dialog";
import { CardEmpty, Controls, Section } from "../../ui/layout";
import { MenuButton } from "../../ui/MenuButton";
import { promptForm } from "../../ui/prompt";
import { BuiltinPage } from "../BuiltinPage";
import { buildMcpServer, draftFromServer, mentionNameFor, validateClaudeImport, type McpDraft, type McpErrors } from "./mcp-form";
import "./ai.css";

type ServerRow = BackendResult<"ai.mcp.list">[number];

const CLAUDE_EXAMPLE = `{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "~/Projects"]
    }
  }
}`;

function ServerEditor({ server, onClose }: { server: ServerRow | null; onClose: () => void }) {
  const [draft, setDraft] = useState<McpDraft>(() => draftFromServer(server));
  const [errors, setErrors] = useState<McpErrors & { save?: string }>({});
  const [busy, setBusy] = useState(false);
  const update = (patch: Partial<McpDraft>) => {
    setDraft({ ...draft, ...patch });
    setErrors({});
  };
  const save = async () => {
    const built = buildMcpServer(draft);
    if ("errors" in built) return setErrors(built.errors);
    setBusy(true);
    try {
      const saved = await backend.call("ai.mcp.upsert", built.server);
      onClose();
      const test = await backend.call("ai.mcp.test", { id: saved.id }).catch((error: unknown) => ({ ok: false, message: errorMessage(error), tools: [] }));
      showToast(
        test.ok
          ? { style: "success", title: `${saved.name} connected`, message: `${test.tools.length} tools available` }
          : { style: "failure", title: `Saved ${saved.name}, but it didn't connect`, message: test.message },
      );
    } catch (error) {
      setErrors({ save: errorMessage(error) });
      setBusy(false);
    }
  };
  const secretHint = server ? "Values saved earlier show as $keychain and stay in your Keychain; type a new value to replace one." : "Values are stored in your Keychain, not in synced settings.";
  return (
    <Dialog
      title={server ? `Edit ${server.name}` : "Add MCP Server"}
      onClose={onClose}
      width={500}
      footer={
        <>
          {errors.save && <span className="sc-s-missing sc-s-dialog__footer-start">{errors.save}</span>}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : server ? "Save" : "Add Server"}
          </Button>
        </>
      }
    >
      <div className="sc-s-editor-grid">
        <DialogField label="Name" error={errors.name}>
          <TextField
            value={draft.name}
            onChange={(name) => update({ name, mentionName: draft.mentionName && draft.mentionName !== mentionNameFor(draft.name) ? draft.mentionName : mentionNameFor(name) })}
            placeholder="GitHub"
          />
        </DialogField>
        <DialogField label="Mention As" hint="Type @ in AI Chat to use its tools." error={errors.mentionName}>
          <TextField value={draft.mentionName} onChange={(mentionName) => update({ mentionName })} leadingIcon="at-symbol-16" placeholder="github" />
        </DialogField>
      </div>
      <DialogField label="Description">
        <TextField value={draft.description} onChange={(description) => update({ description })} placeholder="Optional" />
      </DialogField>
      <DialogField label="Transport">
        <SegmentedControl
          size="medium"
          value={draft.transport}
          onChange={(transport) => update({ transport })}
          segments={[
            { value: "stdio", title: "Local Command (stdio)" },
            { value: "http", title: "Remote URL (HTTP)" },
          ]}
          label="Transport"
        />
      </DialogField>
      {draft.transport === "stdio" ? (
        <>
          <DialogField label="Command" error={errors.command}>
            <TextField value={draft.command} onChange={(command) => update({ command })} placeholder="npx" />
          </DialogField>
          <DialogField label="Arguments" hint="One per line.">
            <TextArea value={draft.args} onChange={(args) => update({ args })} placeholder={"-y\n@modelcontextprotocol/server-github"} minHeight={64} maxHeight={140} />
          </DialogField>
          <DialogField label="Environment Variables" hint={`KEY=value, one per line. ${secretHint}`} error={errors.env}>
            <TextArea value={draft.env} onChange={(env) => update({ env })} placeholder="GITHUB_TOKEN=ghp_…" minHeight={64} maxHeight={140} validation={errors.env ? "error" : undefined} />
          </DialogField>
        </>
      ) : (
        <>
          <DialogField label="URL" hint="Streamable HTTP endpoint." error={errors.url}>
            <TextField value={draft.url} onChange={(url) => update({ url })} placeholder="https://mcp.example.com/mcp" validation={errors.url ? "error" : undefined} />
          </DialogField>
          <DialogField label="Headers" hint={`Name: value, one per line. ${secretHint}`} error={errors.headers}>
            <TextArea
              value={draft.headers}
              onChange={(headers) => update({ headers })}
              placeholder="Authorization: Bearer …"
              minHeight={64}
              maxHeight={140}
              validation={errors.headers ? "error" : undefined}
            />
          </DialogField>
        </>
      )}
    </Dialog>
  );
}

function StatusDot({ status }: { status: ServerRow["status"] }) {
  return <span className="sc-s-status-dot" data-status={status} title={status === "connected" ? "Connected" : status === "error" ? "Error" : "Not connected"} />;
}

function ServerRowView({ server, onEdit }: { server: ServerRow; onEdit: () => void }) {
  const [testing, setTesting] = useState(false);
  const toggle = async (enabled: boolean) => {
    try {
      await backend.call("ai.mcp.upsert", { id: server.id, name: server.name, transport: server.transport, enabled });
    } catch (error) {
      showFailureToast("Could not update server", error);
    }
  };
  const test = async () => {
    setTesting(true);
    try {
      const result = await backend.call("ai.mcp.test", { id: server.id });
      showToast(
        result.ok
          ? { style: "success", title: `${server.name} connected`, message: result.tools.length ? result.tools.slice(0, 6).join(", ") + (result.tools.length > 6 ? "…" : "") : "No tools" }
          : { style: "failure", title: `${server.name} didn't connect`, message: result.message },
      );
    } catch (error) {
      showFailureToast("Could not test server", error);
    } finally {
      setTesting(false);
    }
  };
  const remove = async () => {
    if (
      !(await confirmAlert({
        title: `Delete ${server.name}?`,
        message: "Its tools disappear from AI Chat, and its stored secrets are removed from your Keychain.",
        primaryAction: { title: "Delete", style: "destructive" },
      }))
    )
      return;
    try {
      await backend.call("ai.mcp.delete", { id: server.id });
    } catch (error) {
      showFailureToast("Could not delete server", error);
    }
  };
  const detail = server.transport === "stdio" ? [server.command, ...(server.args ?? [])].join(" ") : server.url;
  return (
    <div className="sc-s-item sc-s-mcp-row" data-setting-id={`mcp-${server.mentionName}`}>
      <StatusDot status={server.enabled ? server.status : "disconnected"} />
      <button type="button" className="sc-s-mcp-row__main" onClick={onEdit}>
        <span className="sc-s-row__title">
          {server.name}
          <span className="sc-s-mcp-row__mention">@{server.mentionName}</span>
        </span>
        <span className="sc-s-navrow__description sc-truncate">{detail}</span>
        {server.enabled && server.status === "error" && server.error && <span className="sc-s-missing sc-s-mcp-row__error sc-truncate">{server.error}</span>}
      </button>
      <span className="sc-s-value">{server.toolCount} tool{server.toolCount === 1 ? "" : "s"}</span>
      <MenuButton
        icon="ellipsis-16"
        label={`${server.name} actions`}
        width={200}
        sections={[
          {
            items: [
              { id: "test", title: testing ? "Testing…" : "Test Connection", icon: "bolt-16", disabled: testing },
              { id: "edit", title: "Edit…", icon: "pencil-16" },
            ],
          },
          { items: [{ id: "delete", title: "Delete…", icon: "trash-16", style: "destructive" }] },
        ]}
        onSelect={(item) => {
          if (item.id === "test") void test();
          if (item.id === "edit") onEdit();
          if (item.id === "delete") void remove();
        }}
      />
      <Switch checked={server.enabled} onChange={(enabled) => void toggle(enabled)} label={`Use ${server.name}`} />
    </div>
  );
}

async function importClaudeDesktop() {
  const values = await promptForm({
    title: "Import from Claude Desktop",
    message: (
      <>
        Paste the contents of <code>claude_desktop_config.json</code> (in ~/Library/Application Support/Claude), or any JSON with an <code>mcpServers</code> object.
      </>
    ),
    fields: [{ id: "json", label: "Configuration", type: "textarea", placeholder: CLAUDE_EXAMPLE, required: true }],
    primaryTitle: "Import",
    validate: ({ json }) => {
      const error = validateClaudeImport(json);
      return error ? { json: error } : null;
    },
  });
  if (!values) return;
  try {
    const { imported } = await backend.call("ai.mcp.import", { json: values.json });
    showToast({ style: "success", title: `Imported ${imported} server${imported === 1 ? "" : "s"}` });
  } catch (error) {
    showFailureToast("Could not import servers", error);
  }
}

/** Settings → MCP: Model Context Protocol servers that give AI extra tools. */
export function MCPPage() {
  const { data: servers, isLoading, error, refetch } = useBackend("ai.mcp.list", undefined);
  const [editing, setEditing] = useState<ServerRow | null | "new">(null);
  return (
    <BuiltinPage id="mcp">
      <Section
        title="MCP Servers"
        description="Each server adds tools AI can use. Mention one with @ in AI Chat."
        actions={
          <Controls>
            <Button size="small" variant="ghost" onClick={() => void importClaudeDesktop()}>
              Import…
            </Button>
            <Button size="small" icon="plus-16" onClick={() => setEditing("new")}>
              Add Server
            </Button>
          </Controls>
        }
      >
        {servers?.length ? (
          servers.map((server) => <ServerRowView key={server.id} server={server} onEdit={() => setEditing(server)} />)
        ) : (
          <CardEmpty
            title={error ? "Couldn't Load MCP Servers" : isLoading ? "Loading…" : "No MCP Servers"}
            description={error ? errorMessage(error) : isLoading ? undefined : "Add a server by command or URL, or import the servers you already use in Claude Desktop."}
            action={Boolean(error) && <Button size="small" onClick={refetch}>Try Again</Button>}
          />
        )}
      </Section>
      <div className="sc-s-mcp-note">
        <Icon name="info-01-16" size={14} />
        Tool permissions are set in AI → Tools. Servers sync between your Macs; their secrets don't.
      </div>
      {editing && <ServerEditor server={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </BuiltinPage>
  );
}
