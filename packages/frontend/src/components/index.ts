/**
 * Surgecast design system. Import from "src/components" in every window.
 * See packages/frontend/README.md for usage.
 */

// Views (Raycast-style API)
export { List } from "./List/List";
export type { ListProps } from "./List/List";
export type { ListAccessory, ListItemProps, ListSectionProps } from "./List/model";
export { Grid } from "./Grid/Grid";
export type { GridProps, GridItemProps, GridSectionProps } from "./Grid/Grid";
export { Detail, ItemDetail } from "./Detail/Detail";
export type { DetailProps, ItemDetailProps } from "./Detail/Detail";
export { Metadata, MetadataView } from "./Detail/Metadata";
export type { MetadataEntry } from "./Detail/Metadata";
export { Form } from "./Form/Form";
export type { FormProps } from "./Form/Form";
export { FormRow } from "./Form/fields";
export { serializeFormValues, deserializeValue } from "./Form/serialize";

// Actions
export { ActionPanel } from "./actions/ActionPanel";
export type { ActionsProp, ActionContext } from "./actions/ActionPanel";
export { Action } from "./actions/Action";
export type { ActionModel, ActionPanelModel, ActionSectionModel, ActionSubmenuModel } from "./actions/model";

// View chrome and building blocks
export { ViewFrame } from "./View/ViewFrame";
export type { ViewFrameProps, ViewSearchBar } from "./View/ViewFrame";
export { useNavigation, useViewController, useOptionalViewController, NavigationContext } from "./View/contexts";
export type { NavigationApi, ViewController } from "./View/contexts";
export { useRegisterActions, useActionContext } from "./View/useRegisterActions";
export { SearchBar, QuickAiHint } from "./SearchBar/SearchBar";
export { ProgressiveBlur } from "./SearchBar/ProgressiveBlur";
export { ListBox } from "./List/ListBox";
export { ListItemRow } from "./List/ListItemRow";
export { ListDropdown } from "./List/ListDropdown";
export { Footer } from "./Footer/Footer";
export { ActionButton } from "./Footer/ActionButton";
export { ActionPanelPopover } from "./ActionPanel/ActionPanelPopover";
export { Menu } from "./Menu/Menu";
export type { MenuItem, MenuSection } from "./Menu/Menu";
export { Popover, OverlayRoot, usePresence } from "./Popover/Popover";
export { ScrollArea } from "./ScrollArea/ScrollArea";
export { VirtualList } from "./ScrollArea/VirtualList";

// Controls
export { Button, IconButton } from "./Button/Button";
export { Keycap, Shortcut } from "./Keycap/Keycap";
export { Switch } from "./Switch/Switch";
export { Checkbox } from "./Checkbox/Checkbox";
export { SegmentedControl } from "./SegmentedControl/SegmentedControl";
export { TextField } from "./TextField/TextField";
export { TextArea } from "./TextArea/TextArea";
export { TagInput } from "./TagInput/TagInput";
export { Dropdown } from "./Dropdown/Dropdown";
export { Tooltip } from "./Tooltip/Tooltip";
export { Tag, Badge, NumberBadge, AliasBadge } from "./Badge/Badge";
export { Spinner, ActivityIndicator, LoadingBar } from "./Spinner/Spinner";
export { EmptyView, EmptyIllustration } from "./EmptyView/EmptyView";
export { Markdown } from "./Markdown/Markdown";
export { HighlightedText } from "./HighlightedText/HighlightedText";

// Feedback
export { showToast, hideToast, showFailureToast, useToastStore } from "./feedback/toast-store";
export type { ToastOptions, ToastHandle } from "./feedback/toast-store";
export { showHUD } from "./feedback/hud";
export { confirmAlert } from "./feedback/alert-store";
export { AlertDialog, AlertHost } from "./AlertDialog/AlertDialog";
export { InlineToast, FloatingToastHost } from "./Toast/InlineToast";
