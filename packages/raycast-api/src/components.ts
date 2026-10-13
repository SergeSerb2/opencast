import React, { useId as reactUseId, useImperativeHandle, useContext, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { request, revive, initialization } from "./bridge";
import { Cache } from "./cache";
import { environment } from "./environment";
import { NavigationContext } from "./navigation";
import { Clipboard, closeMainWindow, showHUD, showInFinder, trash, open, showToast, Toast, confirmAlert, getApplications } from "./services";
import { Icon, Keyboard, allowedShortcut } from "./values";

// These props contain live React subtrees. Rendering them as children lets React
// preserve hooks, effects and context instead of attempting to serialize functions.
const elementProps = ["actions", "detail", "metadata", "searchBarAccessory", "accessory", "alternate"];
type Component = React.FC<any> & Record<string, any>;
const QuickLookContext = React.createContext<any>(undefined);
interface Selection { selected?: string | null; register(id: string): () => void; select(id: string | null): void; }
const SelectionContext = React.createContext<Selection | undefined>(undefined);
function component(type: string, defaults: Record<string, unknown> = {}): Component {
  const Comp = ((props: any) => {
    const id = reactUseId();
    const itemId = String(props.id ?? id);
    const parentSelection = useContext(SelectionContext);
    const isCollection = type === "List" || type === "Grid";
    const isCollectionItem = type === "List.Item" || type === "Grid.Item";
    const [selected, setSelected] = useState<string | null | undefined>(props.selectedItemId);
    const registeredItems = useRef(new Set<string>());
    const selectionCallback = useRef(props.onSelectionChange); selectionCallback.current = props.onSelectionChange;
    const selectedRef = useRef(selected); selectedRef.current = props.selectedItemId ?? selected;
    const select = useCallback((value: string | null) => { selectedRef.current = value; setSelected(value); selectionCallback.current?.(value); }, []);
    const register = useCallback((value: string) => {
      registeredItems.current.add(value);
      if (selectedRef.current === undefined) select(value);
      return () => { registeredItems.current.delete(value); if (selectedRef.current === value) select(registeredItems.current.values().next().value ?? null); };
    }, [select]);
    useEffect(() => isCollectionItem ? parentSelection?.register(itemId) : undefined, [itemId, parentSelection?.register]);
    const hostProps = { ...defaults, ...props, id: props.id ?? id };
    if (type === "ActionPanel.Submenu") hostProps.onAction ??= props.onOpen;
    if (type === "Grid" || type === "Grid.Section") if (props.columns !== undefined) hostProps.columns = Math.max(1, Math.min(8, Math.trunc(Number(props.columns) || 1)));
    const isDropdown = /(?:List|Grid|Form)\.Dropdown$/.test(type);
    const isInput = type.startsWith("Form.") && !["Form.Description", "Form.Separator", "Form.LinkAccessory"].includes(type) && !type.endsWith(".Item") && !type.endsWith(".Section");
    const storeValue = props.storeValue ?? (isDropdown && !type.startsWith("Form."));
    const isPassword = type === "Form.PasswordField";
    const [secretValue, setSecretValue] = useState<string | undefined>();
    const cache = useMemo(() => storeValue && !isPassword && environment.supportPath ? new Cache({ namespace: `ui:${environment.commandName}` }) : undefined, [storeValue]);
    const cacheKey = props.id ?? props.tooltip ?? type;
    useEffect(() => {
      if (!isPassword || !storeValue || props.value !== undefined) return;
      let mounted = true;
      request("getFormPassword", { itemId: itemId }).then((value) => { if (mounted && value !== null) setSecretValue(value); }).catch(() => { if (mounted) void showToast({ style: Toast.Style.Failure, title: "Could not read remembered password" }); });
      return () => { mounted = false; };
    }, [isPassword, storeValue, itemId]);
    const [initialValue] = useState(() => {
      const stored = cache?.get(cacheKey);
      if (stored !== undefined) { try { return revive(JSON.parse(stored)); } catch { /* Discard invalid local field state. */ } }
      const draft = (initialization.launchProps.draftValues as any)?.[props.id];
      return draft ?? props.defaultValue;
    });
    const firstDropdownValue = (children: React.ReactNode): unknown => {
      for (const child of React.Children.toArray(children)) {
        if (React.isValidElement(child)) { const childProps = child.props as Record<string, any>; if (childProps.value !== undefined) return childProps.value; const nested = firstDropdownValue(childProps.children); if (nested !== undefined) return nested; }
      }
      return undefined;
    };
    const dropdownInitial = initialValue ?? firstDropdownValue(props.children);
    const latestChange = useRef(props.onChange); latestChange.current = props.onChange;
    useEffect(() => { if (isDropdown && props.value === undefined && dropdownInitial !== undefined) latestChange.current?.(dropdownInitial); }, []);
    if (props.value === undefined && (isDropdown || isInput)) hostProps.defaultValue = isDropdown ? dropdownInitial : initialValue;
    if (isPassword && storeValue && props.value === undefined) hostProps.value = secretValue ?? initialValue ?? "";
    if ((isDropdown || isInput) && (props.onChange || cache || (isPassword && storeValue))) hostProps.onChange = (value: any) => {
      const actual = type === "Form.DatePicker" && value != null && !(value instanceof Date) ? new Date(value) : value;
      if (isPassword && storeValue) { setSecretValue(actual); void request("setFormPassword", { itemId, value: String(actual) }).catch(() => showToast({ style: Toast.Style.Failure, title: "Could not remember password" })); }
      if (cache) cache.set(cacheKey, JSON.stringify(actual instanceof Date ? { $date: actual.toISOString() } : actual));
      return props.onChange?.(actual);
    };
    if (type === "Form.DatePicker") for (const name of ["onBlur", "onFocus"]) if (props[name]) hostProps[name] = (event: any) => props[name]({ ...event, target: { ...event.target, value: event.target?.value == null ? event.target?.value : new Date(event.target.value) } });
    if (isCollection) { hostProps.onSelectionChange = select; hostProps.selectedItemId = props.selectedItemId ?? selected; }
    const children = React.Children.toArray(props.children);
    for (const name of elementProps) {
      if (isCollectionItem && ["actions", "detail"].includes(name) && parentSelection?.selected !== itemId) { delete hostProps[name]; continue; }
      if (React.isValidElement(props[name])) { delete hostProps[name]; children.push(React.createElement("__prop", { key: `prop:${name}`, name }, props[name])); }
    }
    delete hostProps.children; delete hostProps.ref;
    useImperativeHandle(props.ref, () => ({ focus: () => request("formSetFocus", { itemId: hostProps.id }), reset: () => request("formReset", { itemId: hostProps.id }) }), [hostProps.id]);
    let tree: React.ReactElement = React.createElement(type, hostProps, ...children);
    if (isCollection) tree = React.createElement(SelectionContext.Provider, { value: { selected: props.selectedItemId ?? selected, register, select } }, tree);
    return props.quickLook ? React.createElement(QuickLookContext.Provider, { value: props.quickLook }, tree) : tree;
  }) as Component;
  Comp.displayName = type;
  return Comp;
}
function metadata(prefix: string) {
  const Metadata = component(prefix);
  for (const name of ["Label", "Link", "Separator", "TagList"]) Metadata[name] = component(`${prefix}.${name}`);
  Metadata.TagList.Item = component(`${prefix}.TagList.Item`);
  return Metadata;
}
function dropdown(prefix: string) { const Dropdown = component(prefix); Dropdown.Item = component(`${prefix}.Item`); Dropdown.Section = component(`${prefix}.Section`); return Dropdown; }
export const List = component("List");
List.Item = component("List.Item"); List.Section = component("List.Section"); List.EmptyView = component("List.EmptyView");
List.Item.Detail = component("List.Item.Detail"); List.Item.Detail.Metadata = metadata("List.Item.Detail.Metadata"); List.Dropdown = dropdown("List.Dropdown");
export const Detail = component("Detail", { markdown: "" }); Detail.Metadata = metadata("Detail.Metadata");
export const Grid = component("Grid"); Grid.Item = component("Grid.Item"); Grid.Section = component("Grid.Section"); Grid.EmptyView = component("Grid.EmptyView"); Grid.Dropdown = dropdown("Grid.Dropdown");
Grid.ItemSize = { Small: "small", Medium: "medium", Large: "large" }; Grid.Fit = { Contain: "contain", Fill: "fill" }; Grid.Inset = { Zero: "zero", Small: "sm", Medium: "md", Large: "lg" };
export const Form = component("Form", { enableDrafts: false });
for (const name of ["TextField", "PasswordField", "TextArea", "Checkbox", "DatePicker", "TagPicker", "FilePicker", "Description", "Separator", "LinkAccessory"]) Form[name] = component(`Form.${name}`);
Form.Dropdown = dropdown("Form.Dropdown"); Form.TagPicker.Item = component("Form.TagPicker.Item");
Form.DropdownItem = Form.Dropdown.Item; Form.DropdownSection = Form.Dropdown.Section; Form.TagPickerItem = Form.TagPicker.Item;
Form.FilePicker = component("Form.FilePicker", { canChooseFiles: true, canChooseDirectories: false, showHiddenFiles: false, allowMultipleSelection: true });
Form.DatePicker.Type = { Date: "date", DateTime: "date_time" }; Form.DatePicker.isFullDay = (date: Date) => date.getMilliseconds() === 1;
export const MenuBarExtra = component("MenuBarExtra");
for (const name of ["Item", "Section", "Submenu", "Separator"]) MenuBarExtra[name] = component(`MenuBarExtra.${name}`);
export const ActionPanel = component("ActionPanel"); ActionPanel.Section = component("ActionPanel.Section"); ActionPanel.Submenu = component("ActionPanel.Submenu");
const titles: Record<string, string> = { CopyToClipboard: "Copy to Clipboard", Paste: "Paste in Active App", OpenInBrowser: "Open in Browser", OpenWith: "Open With", ShowInFinder: "Show in Finder", Trash: "Move to Trash", SubmitForm: "Submit Form", CreateSnippet: "Save as Snippet", CreateQuicklink: "Save as Quicklink", InstallMCPServer: "Install MCP Server", ToggleQuickLook: "Quick Look" };
function action(variant: string): Component {
  const Host = component(variant ? `Action.${variant}` : "Action");
  const ActionComponent = ((props: any) => {
    const nav = useContext(NavigationContext);
    const [applications, setApplications] = useState<any[]>([]);
    const [loadingApplications, setLoadingApplications] = useState(false);
    const loadApplications = async () => {
      setLoadingApplications(true);
      try { setApplications(await getApplications(props.path)); }
      catch (error) { await showToast({ style: Toast.Style.Failure, title: "Could not list applications", message: error instanceof Error ? error.message : String(error) }); }
      finally { setLoadingApplications(false); }
    };
    const quickLook = useContext(QuickLookContext);
    const onAction = async (event: any = {}) => {
      try {
        switch (variant) {
          case "CopyToClipboard": await Clipboard.copy(props.content, props); await props.onCopy?.(props.content); await closeMainWindow(); await showHUD("Copied to clipboard"); break;
          case "Paste": await Clipboard.paste(props.content); await props.onPaste?.(props.content); await closeMainWindow(); break;
          case "Open": await open(props.target, props.application); await props.onOpen?.(props.target); break;
          case "OpenInBrowser": await open(props.url); await props.onOpen?.(props.url); break;
          case "OpenWith": await loadApplications(); break;
          case "ShowInFinder": await showInFinder(props.path); await props.onShow?.(props.path); await closeMainWindow(); break;
          case "Trash": if (await confirmAlert({ title: "Move selected items to Trash?", primaryAction: { title: "Move to Trash", style: "destructive" } })) { await trash(props.paths); await props.onTrash?.(props.paths); } break;
          case "Push": if (!nav) throw new Error("Navigation unavailable"); nav.push(props.target, props.onPop); await props.onPush?.(); break;
          case "SubmitForm": if (await props.onSubmit?.(event.formValues ?? {}) === false) await request("shakeMainRaycastWindow"); break;
          case "PickDate": { const chosen = event instanceof Date ? event : new Date(event.date ?? event.value); if (!Number.isFinite(chosen.getTime())) throw new Error("Choose a date before invoking this action"); await props.onChange?.(chosen); break; }
          case "CreateSnippet": await request("createSnippet", { snippet: props.snippet.text, name: props.snippet.name, keyword: props.snippet.keyword }); break;
          case "CreateQuicklink": await request("createQuicklink", props.quicklink); break;
          case "InstallMCPServer": await request("installMCPServer", props.server); break;
          case "ToggleQuickLook": if (quickLook?.path) await request("toggleQuickLook", quickLook); break;
          default: await props.onAction?.();
        }
      } catch (error) { await showToast({ style: Toast.Style.Failure, title: "Action failed", message: error instanceof Error ? error.message : String(error) }); }
    };
    if (variant === "OpenWith") return React.createElement(ActionPanel.Submenu, { ...props, title: props.title ?? titles.OpenWith, isLoading: loadingApplications, onOpen: loadApplications, onAction }, applications.map((application) => React.createElement(Action.Open, { key: application.path, title: application.name, icon: { fileIcon: application.path }, target: props.path, application, onOpen: props.onOpen })));
    const target = props.target;
    return React.createElement(Host, { ...props, target, title: props.title ?? titles[variant], onAction, shortcut: allowedShortcut(props.shortcut ?? (variant === "ToggleQuickLook" ? Keyboard.Shortcut.Common.ToggleQuickLook : undefined)), icon: props.icon ?? (variant === "CopyToClipboard" ? Icon.Clipboard : undefined) });
  }) as Component;
  ActionComponent.displayName = variant ? `Action.${variant}` : "Action";
  return ActionComponent;
}
export const Action = action("");
for (const name of ["CopyToClipboard", "Paste", "Open", "OpenInBrowser", "OpenWith", "ShowInFinder", "Trash", "Push", "SubmitForm", "PickDate", "CreateSnippet", "CreateQuicklink", "InstallMCPServer", "ToggleQuickLook"]) Action[name] = action(name);
Action.Style = { Regular: "regular", Destructive: "destructive" }; Action.PickDate.Type = Form.DatePicker.Type; Action.PickDate.isFullDay = Form.DatePicker.isFullDay; ActionPanel.Item = Action;
