import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { ImageLike, UINode } from "@surgecast/protocol";
import { Detail } from "../components/Detail/Detail";
import { Form } from "../components/Form/Form";
import { FormValuesContext } from "../components/Form/form-context";
import { serializeFormValues } from "../components/Form/serialize";
import { Grid } from "../components/Grid/Grid";
import { List } from "../components/List/List";
import { ListDropdown } from "../components/List/ListDropdown";
import { mapActionPanel } from "./actions";
import { groupSections, mapDropdownSections, mapGridItem, mapGridLayout, mapListItem, mapMetadata, type MappingContext } from "./mapping";
import { bool, callback, isHandler, isNode, revive, str, type Dispatch } from "./props";

export interface RenderOptions {
  dispatch: Dispatch;
  isLoading: boolean;
  navigationTitle?: string;
  navigationIcon?: ImageLike;
}

const THROTTLE_MS = 300;

/**
 * Search text stays local so typing is instant; the runtime hears about it
 * through onSearchTextChange (debounced when the view sets `throttle`).
 */
function useSearchText(node: UINode, dispatch: Dispatch): [string | undefined, ((text: string) => void) | undefined] {
  const controlled = str(node.props.searchText);
  const [local, setLocal] = useState(controlled ?? "");
  const last = useRef(controlled);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  if (controlled !== undefined && controlled !== last.current) {
    last.current = controlled;
    if (controlled !== local) setLocal(controlled);
  }
  const handler = node.props.onSearchTextChange;
  const throttle = node.props.throttle === true;
  const onChange = (text: string) => {
    setLocal(text);
    if (!isHandler(handler)) return;
    if (timer.current) clearTimeout(timer.current);
    if (throttle) timer.current = setTimeout(() => dispatch(handler, [text]), THROTTLE_MS);
    else dispatch(handler, [text]);
  };
  return [controlled !== undefined || isHandler(handler) ? local : undefined, onChange];
}

function accessoryFor(node: unknown, dispatch: Dispatch): ReactNode {
  if (!isNode(node)) return undefined;
  if (node.type === "List.Dropdown" || node.type === "Grid.Dropdown") {
    const p = node.props;
    return (
      <ListDropdown
        tooltip={str(p.tooltip) ?? "Filter"}
        id={str(p.id)}
        value={str(p.value)}
        defaultValue={str(p.defaultValue)}
        placeholder={str(p.placeholder)}
        storeValue={bool(p.storeValue)}
        filtering={typeof p.filtering === "boolean" ? p.filtering : undefined}
        isLoading={bool(p.isLoading)}
        onChange={callback<[string]>(p.onChange, dispatch)}
        onSearchTextChange={callback<[string]>(p.onSearchTextChange, dispatch)}
      >
        {mapDropdownSections(node).map((section, i) => (
          <ListDropdown.Section key={i} title={section.title}>
            {section.items.map((item) => (
              <ListDropdown.Item key={item.value} value={item.value} title={item.title} icon={item.icon} keywords={item.keywords} />
            ))}
          </ListDropdown.Section>
        ))}
      </ListDropdown>
    );
  }
  if (node.type === "Form.LinkAccessory") return <Form.LinkAccessory text={str(node.props.text) ?? ""} target={str(node.props.target) ?? ""} />;
  return undefined;
}

function emptyViewFor(root: UINode, emptyType: string, context: MappingContext): ReactNode {
  const empty = root.children.find((c) => c.type === emptyType);
  if (!empty) return null;
  return <List.EmptyView title={str(empty.props.title)} description={str(empty.props.description)} icon={empty.props.icon as ImageLike | undefined} actions={mapActionPanel(empty.props.actions, context)} />;
}

export function ExtensionList({ node, options }: { node: UINode; options: RenderOptions }) {
  const p = node.props;
  const context: MappingContext = { dispatch: options.dispatch };
  const [searchText, onSearchTextChange] = useSearchText(node, options.dispatch);
  const pagination = p.pagination as { hasMore?: boolean; pageSize?: number; onLoadMore?: unknown } | undefined;
  const filtering = typeof p.filtering === "boolean" ? p.filtering : typeof p.filtering === "object" && p.filtering !== null ? { keepSectionOrder: Boolean((p.filtering as { keepSectionOrder?: boolean }).keepSectionOrder) } : isHandler(p.onSearchTextChange) ? false : true;
  return (
    <List
      searchText={searchText}
      onSearchTextChange={onSearchTextChange}
      searchBarPlaceholder={str(p.searchBarPlaceholder)}
      filtering={filtering}
      isLoading={bool(p.isLoading) ?? options.isLoading}
      navigationTitle={str(p.navigationTitle) ?? options.navigationTitle}
      navigationIcon={options.navigationIcon}
      searchBarAccessory={accessoryFor(p.searchBarAccessory, options.dispatch)}
      actions={mapActionPanel(p.actions, context)}
      isShowingDetail={bool(p.isShowingDetail)}
      selectedItemId={str(p.selectedItemId)}
      onSelectionChange={callback<[string | null]>(p.onSelectionChange, options.dispatch)}
      pagination={pagination?.hasMore !== undefined && isHandler(pagination.onLoadMore) ? { hasMore: pagination.hasMore, pageSize: pagination.pageSize, onLoadMore: () => options.dispatch(pagination.onLoadMore as never, []) } : undefined}
    >
      {groupSections(node, "List.Section", "List.Item").map((group, gi) => {
        const items = group.items.map((itemNode) => {
          const { detailProps, ...item } = mapListItem(itemNode, context);
          return <List.Item key={itemNode.id} {...item} detail={detailProps ? <List.Item.Detail markdown={detailProps.markdown} metadata={detailProps.metadata} isLoading={detailProps.isLoading} /> : undefined} />;
        });
        return group.node ? (
          <List.Section key={group.node.id} id={group.node.id} title={str(group.node.props.title)} subtitle={str(group.node.props.subtitle)}>
            {items}
          </List.Section>
        ) : (
          <List.Section key={`loose-${gi}`} id={`loose-${gi}`}>
            {items}
          </List.Section>
        );
      })}
      {emptyViewFor(node, "List.EmptyView", context)}
    </List>
  );
}

export function ExtensionGrid({ node, options }: { node: UINode; options: RenderOptions }) {
  const p = node.props;
  const context: MappingContext = { dispatch: options.dispatch };
  const [searchText, onSearchTextChange] = useSearchText(node, options.dispatch);
  const layout = mapGridLayout(p);
  const pagination = p.pagination as { hasMore?: boolean; pageSize?: number; onLoadMore?: unknown } | undefined;
  return (
    <Grid
      {...layout}
      searchText={searchText}
      onSearchTextChange={onSearchTextChange}
      searchBarPlaceholder={str(p.searchBarPlaceholder)}
      filtering={typeof p.filtering === "boolean" ? p.filtering : !isHandler(p.onSearchTextChange)}
      isLoading={bool(p.isLoading) ?? options.isLoading}
      navigationTitle={str(p.navigationTitle) ?? options.navigationTitle}
      navigationIcon={options.navigationIcon}
      searchBarAccessory={accessoryFor(p.searchBarAccessory, options.dispatch)}
      actions={mapActionPanel(p.actions, context)}
      selectedItemId={str(p.selectedItemId)}
      onSelectionChange={callback<[string | null]>(p.onSelectionChange, options.dispatch)}
      pagination={pagination?.hasMore !== undefined && isHandler(pagination.onLoadMore) ? { hasMore: pagination.hasMore, pageSize: pagination.pageSize, onLoadMore: () => options.dispatch(pagination.onLoadMore as never, []) } : undefined}
    >
      {groupSections(node, "Grid.Section", "Grid.Item").map((group, gi) => {
        const items = group.items.map((itemNode) => <Grid.Item key={itemNode.id} {...mapGridItem(itemNode, context)} />);
        const sectionLayout = group.node ? mapGridLayout(group.node.props) : {};
        return (
          <Grid.Section key={group.node?.id ?? `loose-${gi}`} id={group.node?.id ?? `loose-${gi}`} title={str(group.node?.props.title)} subtitle={str(group.node?.props.subtitle)} {...sectionLayout}>
            {items}
          </Grid.Section>
        );
      })}
      {emptyViewFor(node, "Grid.EmptyView", context)}
    </Grid>
  );
}

export function ExtensionDetail({ node, options }: { node: UINode; options: RenderOptions }) {
  const p = node.props;
  return (
    <Detail
      markdown={str(p.markdown)}
      metadata={mapMetadata(p.metadata, options.dispatch)}
      actions={mapActionPanel(p.actions, { dispatch: options.dispatch })}
      navigationTitle={str(p.navigationTitle) ?? options.navigationTitle}
      navigationIcon={options.navigationIcon}
      isLoading={bool(p.isLoading) ?? options.isLoading}
    />
  );
}

/** Field props shared by every Form.* node. */
function fieldProps(node: UINode, dispatch: Dispatch) {
  const p = node.props;
  const id = str(p.id) ?? node.id;
  const focus = (type: "focus" | "blur", handler: unknown) =>
    isHandler(handler) ? (event: { target: { id: string; value: unknown } }) => dispatch(handler, [{ target: { id: event.target.id, value: serializeFormValues({ v: event.target.value }).v }, type }]) : undefined;
  return {
    id,
    title: str(p.title),
    info: str(p.info),
    error: str(p.error),
    autoFocus: bool(p.autoFocus),
    storeValue: bool(p.storeValue),
    onFocus: focus("focus", p.onFocus),
    onBlur: focus("blur", p.onBlur),
  };
}

function renderField(node: UINode, dispatch: Dispatch): ReactNode {
  const p = revive(node.props);
  const base = fieldProps(node, dispatch);
  const onChange = <T,>(map: (value: T) => unknown = (v) => v) => (isHandler(p.onChange) ? (value: T) => dispatch(p.onChange as never, [map(value)]) : undefined);
  const has = (key: string) => key in node.props;
  switch (node.type) {
    case "Form.TextField":
      return <Form.TextField key={node.id} {...base} placeholder={str(p.placeholder)} value={has("value") ? (str(p.value) ?? "") : undefined} defaultValue={str(p.defaultValue)} onChange={onChange<string>()} />;
    case "Form.PasswordField":
      return <Form.PasswordField key={node.id} {...base} placeholder={str(p.placeholder)} value={has("value") ? (str(p.value) ?? "") : undefined} defaultValue={str(p.defaultValue)} onChange={onChange<string>()} />;
    case "Form.TextArea":
      return <Form.TextArea key={node.id} {...base} placeholder={str(p.placeholder)} value={has("value") ? (str(p.value) ?? "") : undefined} defaultValue={str(p.defaultValue)} onChange={onChange<string>()} />;
    case "Form.Checkbox":
      return <Form.Checkbox key={node.id} {...base} label={str(p.label)} value={has("value") ? Boolean(p.value) : undefined} defaultValue={bool(p.defaultValue)} onChange={onChange<boolean>()} />;
    case "Form.DatePicker":
      return (
        <Form.DatePicker
          key={node.id}
          {...base}
          type={p.type === "date" ? "date" : "datetime"}
          value={has("value") ? ((p.value as Date | null) ?? null) : undefined}
          defaultValue={(p.defaultValue as Date | null | undefined) ?? undefined}
          onChange={onChange<Date | null>((d) => (d ? { $date: d.toISOString() } : null))}
        />
      );
    case "Form.Dropdown":
      return (
        <Form.Dropdown key={node.id} {...base} placeholder={str(p.placeholder)} value={has("value") ? str(p.value) : undefined} defaultValue={str(p.defaultValue)} isLoading={bool(p.isLoading)} filtering={typeof p.filtering === "boolean" ? p.filtering : undefined} onSearchTextChange={callback<[string]>(p.onSearchTextChange, dispatch)} onChange={onChange<string>()}>
          {mapDropdownSections(node).map((section, i) => (
            <Form.Dropdown.Section key={i} title={section.title}>
              {section.items.map((item) => (
                <Form.Dropdown.Item key={item.value} value={item.value} title={item.title} icon={item.icon} keywords={item.keywords} />
              ))}
            </Form.Dropdown.Section>
          ))}
        </Form.Dropdown>
      );
    case "Form.TagPicker":
      return (
        <Form.TagPicker key={node.id} {...base} placeholder={str(p.placeholder)} value={has("value") ? ((p.value as string[]) ?? []) : undefined} defaultValue={Array.isArray(p.defaultValue) ? (p.defaultValue as string[]) : undefined} onChange={onChange<string[]>()}>
          {node.children
            .filter((c) => c.type === "Form.TagPicker.Item")
            .map((c) => (
              <Form.TagPicker.Item key={c.id} value={str(c.props.value) ?? ""} title={str(c.props.title) ?? str(c.props.value) ?? ""} icon={c.props.icon as ImageLike | undefined} />
            ))}
        </Form.TagPicker>
      );
    case "Form.FilePicker":
      return (
        <Form.FilePicker
          key={node.id}
          {...base}
          allowMultipleSelection={bool(p.allowMultipleSelection) ?? true}
          canChooseDirectories={bool(p.canChooseDirectories)}
          canChooseFiles={bool(p.canChooseFiles) ?? true}
          value={has("value") ? ((p.value as string[]) ?? []) : undefined}
          defaultValue={Array.isArray(p.defaultValue) ? (p.defaultValue as string[]) : undefined}
          onChange={onChange<string[]>()}
        />
      );
    case "Form.Separator":
      return <Form.Separator key={node.id} />;
    case "Form.Description":
      return <Form.Description key={node.id} title={str(p.title)} text={str(p.text) ?? ""} />;
    default:
      return null;
  }
}

export function ExtensionForm({ node, options }: { node: UINode; options: RenderOptions }) {
  const p = node.props;
  const valuesRef = useRef<() => Record<string, unknown>>(() => ({}));
  const actions = mapActionPanel(p.actions, { dispatch: options.dispatch, getFormValues: () => valuesRef.current() });
  return (
    <Form
      navigationTitle={str(p.navigationTitle) ?? options.navigationTitle}
      navigationIcon={options.navigationIcon}
      isLoading={bool(p.isLoading) ?? options.isLoading}
      searchBarAccessory={accessoryFor(p.searchBarAccessory, options.dispatch)}
      actions={actions}
    >
      <FormValuesBridge valuesRef={valuesRef} />
      {node.children.map((child) => renderField(child, options.dispatch))}
    </Form>
  );
}

/** Actions inside a Form send the current values (`formValues`): exposes the form's getter to the mapping. */
function FormValuesBridge({ valuesRef }: { valuesRef: { current: () => Record<string, unknown> } }) {
  const api = useContext(FormValuesContext);
  useEffect(() => {
    if (api) valuesRef.current = api.getValues;
  }, [api, valuesRef]);
  return null;
}

/** Render the top of an extension's navigation stack with the shared components. */
export function renderExtensionRoot(node: UINode, options: RenderOptions): ReactNode {
  switch (node.type) {
    case "List":
      return <ExtensionList node={node} options={options} />;
    case "Grid":
      return <ExtensionGrid node={node} options={options} />;
    case "Detail":
      return <ExtensionDetail node={node} options={options} />;
    case "Form":
      return <ExtensionForm node={node} options={options} />;
    default:
      return <Detail navigationTitle={options.navigationTitle} markdown={`Unsupported view \`${node.type}\`.`} />;
  }
}
