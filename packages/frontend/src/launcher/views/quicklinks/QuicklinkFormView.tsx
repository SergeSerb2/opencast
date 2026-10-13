import { useEffect, useMemo, useRef, useState } from "react";
import type { AppInfo, ImageLike, Quicklink } from "@surgecast/protocol";
import { backend } from "../../../bridge/backend";
import { errorMessage } from "../../../bridge/errors";
import { native } from "../../../bridge/native";
import { useSetting } from "../../../bridge/settings";
import { Action, ActionPanel, Form, FormRow, showToast, TagInput, TextField, useNavigation } from "../../../components";
import { Icon } from "../../../icons/Icon";
import { sc } from "../../../lib/keyboard";
import { IconPicker } from "../library/IconPicker";
import { DOCS } from "../library/links";
import { TemplateEditor, type TemplateEditorHandle } from "../snippets/TemplateEditor";
import { DEFAULT_ICON, defaultLinkIcon, isPathLink, quicklinkDraft, quicklinkPayload, validateQuicklink, type QuicklinkDraft, type QuicklinkErrors } from "./quicklink-model";
import "./quicklinks.css";

const SYSTEM_DEFAULT = "";

export interface QuicklinkFormViewProps {
  quicklink?: Quicklink;
  /** Prefill a new quicklink (duplicate, "Save as Quicklink", root text). */
  initial?: Partial<Pick<Quicklink, "name" | "link" | "openWith" | "tags" | "icon">>;
  mode?: "create" | "edit" | "duplicate";
  navigationIcon?: ImageLike;
  onSaved?: (quicklink: Quicklink) => void;
}

/** Create / Update / Duplicate Quicklink: link template with placeholders, name and icon, Open With app, tags. */
export function QuicklinkFormView({ quicklink, initial, mode = quicklink ? "edit" : "create", navigationIcon, onSaved }: QuicklinkFormViewProps) {
  const navigation = useNavigation();
  const faviconProvider = useSetting("advanced.faviconProvider");
  const [draft, setDraft] = useState<QuicklinkDraft>(() => quicklinkDraft(quicklink ?? initial));
  const [errors, setErrors] = useState<QuicklinkErrors>({});
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [defaultApp, setDefaultApp] = useState<AppInfo | null>(null);
  const editorRef = useRef<TemplateEditorHandle>(null);
  const saving = useRef(false);

  useEffect(() => {
    native
      .call("apps.list", {})
      .then((list) => setApps([...list].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setApps([]));
    if (mode !== "create" || initial?.link) return;
    // Like Raycast, start from a link on the clipboard.
    native
      .call("clipboard.read")
      .then((snapshot) => {
        const text = snapshot?.text?.trim();
        if (text && /^https?:\/\/\S+$/i.test(text)) setDraft((d) => (d.link ? d : { ...d, link: text }));
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The app that opens the link by default, shown as the first "Open With" option.
  const probe = draft.link.replace(/\{[^}]*\}/g, "x").trim();
  useEffect(() => {
    if (!probe) {
      setDefaultApp(null);
      return;
    }
    const timer = setTimeout(() => {
      const request = isPathLink(probe) ? native.call("apps.defaultForPath", { path: probe }) : native.call("apps.forUrl", { url: probe }).then((list) => list[0] ?? null);
      request.then(setDefaultApp).catch(() => setDefaultApp(null));
    }, 250);
    return () => clearTimeout(timer);
  }, [probe]);

  const update = <K extends keyof QuicklinkDraft>(key: K, value: QuicklinkDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const chooseFile = async () => {
    try {
      const paths = await native.call("dialog.openFiles", { canChooseFiles: true, canChooseDirectories: true, allowMultipleSelection: false, title: "Choose File or Directory" });
      if (paths?.[0]) update("link", paths[0]);
    } catch (error) {
      showToast({ style: "failure", title: "Could not open the file picker", message: errorMessage(error) });
    }
  };

  const save = async () => {
    if (saving.current) return;
    const found = validateQuicklink(draft);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    saving.current = true;
    const toast = showToast({ style: "animated", title: mode === "edit" ? "Updating quicklink" : "Creating quicklink" });
    try {
      const payload = quicklinkPayload(draft);
      const saved = mode === "edit" && quicklink ? await backend.call("quicklinks.update", { id: quicklink.id, patch: payload }) : await backend.call("quicklinks.create", payload);
      toast.update({ style: "success", title: mode === "edit" ? "Updated quicklink" : "Created quicklink", message: saved.name });
      if (onSaved) onSaved(saved);
      else navigation.pop();
    } catch (error) {
      toast.update({ style: "failure", title: mode === "edit" ? "Failed updating quicklink" : "Failed creating quicklink", message: errorMessage(error) });
    } finally {
      saving.current = false;
    }
  };

  const iconOptions = useMemo(() => [{ id: DEFAULT_ICON, title: "Default", icon: defaultLinkIcon(draft.link, faviconProvider, draft.openWith ? apps.find((a) => a.bundleId === draft.openWith || a.path === draft.openWith) : defaultApp) }], [draft.link, draft.openWith, faviconProvider, apps, defaultApp]);
  const footerTitle = mode === "edit" ? "Update Quicklink" : mode === "duplicate" ? "Duplicate Quicklink" : "Create Quicklink";

  return (
    <Form
      navigationTitle={footerTitle}
      navigationIcon={navigationIcon}
      searchBarAccessory={<Form.LinkAccessory text="Quicklinks Guide" target={DOCS.quicklinks} />}
      actions={
        <ActionPanel>
          <Action title={mode === "edit" ? "Update Quicklink" : "Save Quicklink"} icon="checkmark-16" onAction={save} />
          <Action title="Choose File or Directory" icon="folder-16" shortcut={sc("cmd", "shift", "o")} onAction={chooseFile} />
        </ActionPanel>
      }
    >
      <FormRow title="Link" error={errors.link}>
        <TemplateEditor
          ref={editorRef}
          context="quicklink"
          value={draft.link}
          onChange={(link) => update("link", link)}
          placeholder="https://www.google.com/search?q={argument}"
          invalid={Boolean(errors.link)}
          aria-label="Link"
          toolbar={
            <div className="sc-quicklink-form__tools">
              <button type="button" tabIndex={-1} className="sc-quicklink-form__tool" title="Add Placeholder  {" aria-label="Add Placeholder" onMouseDown={(e) => e.preventDefault()} onClick={() => editorRef.current?.startPlaceholder()}>
                <Icon name="text-input-16" size={16} />
              </button>
              <button type="button" tabIndex={-1} className="sc-quicklink-form__tool" title="Choose File or Directory" aria-label="Choose File or Directory" onMouseDown={(e) => e.preventDefault()} onClick={() => void chooseFile()}>
                <Icon name="folder-16" size={16} />
              </button>
            </div>
          }
        />
        <p className="sc-quicklink-form__help">
          Use{" "}
          <a
            href={DOCS.placeholders}
            onClick={(e) => {
              e.preventDefault();
              void native.call("open.url", { url: DOCS.placeholders }).catch(() => undefined);
            }}
          >
            {"{Dynamic Placeholders}"}
          </a>{" "}
          for arguments, or the selected or copied text
        </p>
      </FormRow>
      <FormRow title="Name & Icon" error={errors.name}>
        <TextField
          value={draft.name}
          onChange={(name) => update("name", name)}
          placeholder="Quicklink name"
          validation={errors.name ? "error" : undefined}
          aria-label="Name"
          accessory={<IconPicker value={draft.icon} onChange={(icon) => update("icon", icon)} leadOptions={iconOptions} aria-label="Quicklink icon" />}
        />
      </FormRow>
      <Form.Dropdown id="openWith" title="Open With" value={draft.openWith} onChange={(openWith) => update("openWith", openWith)}>
        <Form.Dropdown.Section>
          <Form.Dropdown.Item value={SYSTEM_DEFAULT} title={defaultApp ? `${defaultApp.name} (Default)` : "System Default"} icon={defaultApp ? { fileIcon: defaultApp.path } : "app-window-16"} />
        </Form.Dropdown.Section>
        <Form.Dropdown.Section>
          {apps.map((app) => (
            <Form.Dropdown.Item key={app.path} value={app.bundleId ?? app.path} title={app.name} icon={{ fileIcon: app.path }} />
          ))}
        </Form.Dropdown.Section>
      </Form.Dropdown>
      <FormRow title="Tags">
        <TagInput value={draft.tags} onChange={(tags) => update("tags", tags)} placeholder="Tags" aria-label="Tags" />
      </FormRow>
    </Form>
  );
}
