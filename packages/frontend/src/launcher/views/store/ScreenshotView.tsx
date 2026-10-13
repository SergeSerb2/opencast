import { useState } from "react";
import type { ImageLike } from "@surgecast/protocol";
import { useRegisterActions, ViewFrame, type ActionModel } from "../../../components";
import { Icon } from "../../../icons/Icon";
import { sc } from "../../../lib/keyboard";
import { openUrl } from "../extensions/actions-common";
import "./store.css";

function ScreenshotBody({ screenshots, index, setIndex }: { screenshots: string[]; index: number; setIndex: (index: number) => void }) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = screenshots[index];
  const actions: ActionModel[] = [];
  if (index < screenshots.length - 1) actions.push({ id: "next", title: "Next Screenshot", icon: "chevron-right-16", shortcut: sc("arrowRight"), onAction: () => setIndex(index + 1) });
  if (index > 0) actions.push({ id: "previous", title: "Previous Screenshot", icon: "chevron-left-16", shortcut: sc("arrowLeft"), onAction: () => setIndex(index - 1) });
  if (/^https?:/i.test(src)) actions.push({ id: "open", title: "Open in Browser", icon: "globe-01-16", shortcut: sc("cmd", "o"), onAction: () => openUrl(src) });
  useRegisterActions({ sections: [{ actions }] });
  return (
    <figure className="sc-store-shot">
      {failed === src ? (
        <Icon name="image-16" size={32} className="sc-store-detail__shot-placeholder" />
      ) : (
        <img key={src} src={src} alt={`Screenshot ${index + 1} of ${screenshots.length}`} draggable={false} onError={() => setFailed(src)} />
      )}
    </figure>
  );
}

/** Full-window screenshot preview from the Store detail; ← / → step through the gallery. */
export function ScreenshotView({ screenshots, initialIndex, title, icon }: { screenshots: string[]; initialIndex: number; title: string; icon: ImageLike }) {
  const [index, setIndex] = useState(initialIndex);
  return (
    <ViewFrame navigationTitle={screenshots.length > 1 ? `${title} · ${index + 1} of ${screenshots.length}` : title} navigationIcon={icon}>
      <ScreenshotBody screenshots={screenshots} index={index} setIndex={setIndex} />
    </ViewFrame>
  );
}
