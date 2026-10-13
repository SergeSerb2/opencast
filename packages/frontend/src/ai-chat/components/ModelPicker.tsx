import { useMemo } from "react";
import type { AIModelOption, ModelRef } from "@surgecast/protocol";
import { Menu, type MenuSection } from "../../components/Menu/Menu";
import { Popover, type PopoverAnchor } from "../../components/Popover/Popover";
import { CAPABILITY_BADGES, groupByProvider } from "../model/models";

export interface ModelPickerProps {
  open: boolean;
  onClose: () => void;
  anchor: PopoverAnchor | null;
  models: readonly AIModelOption[];
  value?: ModelRef;
  onPick: (ref: ModelRef) => void;
  side?: "top" | "bottom";
  align?: "start" | "end";
  title?: string;
}

/** Searchable model list grouped by provider, with vision/tools/reasoning badges. */
export function ModelPicker({ open, onClose, anchor, models, value, onPick, side = "bottom", align = "start", title }: ModelPickerProps) {
  const sections = useMemo<MenuSection[]>(
    () =>
      groupByProvider(models).map((group) => ({
        id: group.providerId,
        title: group.providerName,
        items: group.models.map((model) => ({
          id: model.ref,
          title: model.name,
          keywords: [model.modelId, group.providerName],
          checked: model.ref === value,
          badges: CAPABILITY_BADGES.filter((b) => model.capabilities[b.key]).map((b) => ({ icon: b.icon, label: b.label })),
        })),
      })),
    [models, value],
  );
  return (
    <Popover open={open} onClose={onClose} anchor={anchor} side={side} align={align} width={320} className="sc-ai-model-picker" aria-label="Models" role="dialog">
      <Menu
        sections={sections}
        title={title}
        layout={side === "top" ? "up" : "down"}
        searchPlaceholder="Search models…"
        preserveSectionsOnSearch
        initialSelectedId={value}
        emptyText="No Models"
        onSelect={(item) => {
          onPick(item.id);
          onClose();
        }}
        onDismiss={onClose}
        aria-label="Models"
      />
    </Popover>
  );
}
