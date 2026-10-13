import { useState } from "react";
import type { ClipboardItem, ImageLike } from "@surgecast/protocol";
import { ItemDetail, Metadata } from "../../../components";
import { Image } from "../../../icons/Image";
import { localFileUrl } from "../../../icons/image-source";
import { formatBytes, formatTimestamp, tildePath } from "../library/format";
import { entryText, KIND_LABEL, textPreview } from "./clipboard-model";

const IMAGE_FILE = /\.(png|jpe?g|gif|webp|heic|tiff?|bmp|svg|avif)$/i;

function imageUrl(path: string): string {
  return /^(data|https?|blob|surgecast-file):/i.test(path) ? path : localFileUrl(path);
}

/** Bordered monospace text (Raycast's text/link preview), first 15 lines with a remainder note. */
function TextPreview({ text }: { text: string }) {
  const preview = textPreview(text);
  return (
    <div className="sc-clip-preview">
      <pre className="sc-clip-preview__text">{preview.text}</pre>
      {preview.hiddenCharacters > 0 && <div className="sc-clip-preview__more">+ {preview.hiddenCharacters.toLocaleString()} characters</div>}
    </div>
  );
}

function ImagePreview({ src, onSize }: { src: string; onSize?: (size: { width: number; height: number }) => void }) {
  return (
    <div className="sc-clip-image">
      <img src={src} alt="" draggable={false} onLoad={(e) => onSize?.({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} />
    </div>
  );
}

function Preview({ item, onImageSize }: { item: ClipboardItem; onImageSize: (size: { width: number; height: number }) => void }) {
  switch (item.kind) {
    case "image":
      return item.imagePath ? <ImagePreview src={imageUrl(item.imagePath)} /> : null;
    case "file": {
      const path = item.filePaths?.[0];
      if (!path) return null;
      if (IMAGE_FILE.test(path)) return <ImagePreview src={imageUrl(path)} onSize={onImageSize} />;
      return (
        <div className="sc-clip-file">
          <Image source={{ fileIcon: path }} size={96} />
          <span className="sc-clip-file__name sc-truncate">{item.filePaths!.length > 1 ? `${item.filePaths!.length} Files` : item.title}</span>
        </div>
      );
    }
    case "color":
      return (
        <div className="sc-clip-color">
          <span className="sc-clip-color__swatch" style={{ background: item.color }} />
          <span className="sc-clip-color__value">{item.color}</span>
        </div>
      );
    default:
      return <TextPreview text={entryText(item)} />;
  }
}

/** Preview and "Information" metadata for a clipboard entry. */
export function ClipboardDetail({ item }: { item: ClipboardItem }) {
  const [fileImageSize, setFileImageSize] = useState<{ width: number; height: number } | null>(null);
  const source: ImageLike | undefined = item.sourceApp ? { fileIcon: item.sourceApp.path } : undefined;
  const width = item.imageWidth ?? fileImageSize?.width;
  const height = item.imageHeight ?? fileImageSize?.height;
  return (
    <ItemDetail
      preview={<Preview key={item.id} item={item} onImageSize={setFileImageSize} />}
      metadata={
        <Metadata>
          {item.sourceApp && <Metadata.Label title="Source" text={item.sourceApp.name} icon={source} />}
          <Metadata.Label title="Type" text={item.kind === "file" && (item.filePaths?.length ?? 0) > 1 ? "Files" : KIND_LABEL[item.kind]} />
          {item.kind === "text" && item.characters !== undefined && <Metadata.Label title="Characters" text={item.characters.toLocaleString()} />}
          {item.kind === "text" && item.words !== undefined && <Metadata.Label title="Words" text={item.words.toLocaleString()} />}
          {item.kind === "link" && <Metadata.Label title="URL" text={item.url ?? entryText(item)} />}
          {(item.kind === "image" || item.kind === "file") && width && height ? <Metadata.Label title="Dimensions" text={`${width}×${height}`} /> : null}
          {item.kind === "file" && item.filePaths?.length === 1 && <Metadata.Label title="Path" text={tildePath(item.filePaths[0])} />}
          {item.kind === "file" && (item.filePaths?.length ?? 0) > 1 && <Metadata.Label title="Count" text={String(item.filePaths!.length)} />}
          {(item.kind === "image" || item.kind === "file") && item.byteSize ? <Metadata.Label title="Size" text={formatBytes(item.byteSize)} /> : null}
          {item.copyCount > 1 ? (
            <>
              <Metadata.Label title="Times copied" text={item.copyCount.toLocaleString()} />
              <Metadata.Label title="Last copied" text={formatTimestamp(item.lastCopiedAt)} />
              <Metadata.Label title="First copied" text={formatTimestamp(item.createdAt)} />
            </>
          ) : (
            <Metadata.Label title="Copied" text={formatTimestamp(item.lastCopiedAt)} />
          )}
        </Metadata>
      }
    />
  );
}
