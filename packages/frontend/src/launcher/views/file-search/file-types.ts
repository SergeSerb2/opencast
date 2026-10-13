import type { FileResult } from "@opencast/protocol";

export type FileTypeFilter = "allTypes" | "directory" | "file" | "archive" | "document" | "image" | "video" | "audio" | "text" | "other";

/** "Filter by Type" options in Raycast's order. */
export const FILE_TYPE_FILTERS: { value: FileTypeFilter; title: string; icon: string }[] = [
  { value: "allTypes", title: "All Types", icon: "bullet-points-16" },
  { value: "directory", title: "Directory", icon: "folder-16" },
  { value: "file", title: "File", icon: "blank-document-16" },
  { value: "archive", title: "Archive", icon: "box-16" },
  { value: "document", title: "Document", icon: "paragraph-16" },
  { value: "image", title: "Image", icon: "image-16" },
  { value: "video", title: "Video", icon: "video-16" },
  { value: "audio", title: "Audio", icon: "music-16" },
  { value: "text", title: "Text", icon: "text-16" },
  { value: "other", title: "Other", icon: "square-ellipsis-16" },
];

type Category = Exclude<FileTypeFilter, "allTypes" | "directory" | "file" | "other">;

const EXTENSIONS: Record<Category, string[]> = {
  archive: ["zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar", "dmg", "pkg", "iso"],
  document: ["pdf", "doc", "docx", "pages", "key", "numbers", "xls", "xlsx", "ppt", "pptx", "rtf", "odt", "ods", "odp", "epub"],
  image: ["png", "jpg", "jpeg", "gif", "heic", "heif", "webp", "tif", "tiff", "bmp", "svg", "avif", "ico", "icns", "raw", "psd"],
  video: ["mp4", "mov", "m4v", "avi", "mkv", "webm", "wmv"],
  audio: ["mp3", "m4a", "wav", "aif", "aiff", "flac", "aac", "ogg", "opus"],
  text: ["txt", "md", "markdown", "json", "csv", "log", "yaml", "yml", "xml", "html", "css", "js", "mjs", "ts", "tsx", "jsx", "swift", "py", "rb", "go", "rs", "sh", "zsh", "c", "h", "cpp", "m", "java", "kt", "toml", "ini", "sql"],
};

const TYPE_NAMES: Record<string, string> = {
  png: "PNG", jpg: "JPEG", jpeg: "JPEG", gif: "GIF", heic: "HEIC", webp: "WebP", svg: "SVG", tiff: "TIFF", pdf: "PDF",
  md: "Markdown", markdown: "Markdown", txt: "Plain Text", json: "JSON", csv: "CSV", yaml: "YAML", yml: "YAML", xml: "XML", html: "HTML", css: "CSS",
  js: "JavaScript", jsx: "JavaScript React", ts: "TypeScript", tsx: "TypeScript React", swift: "Swift", py: "Python", rb: "Ruby", go: "Go", rs: "Rust", sh: "Shell Script",
  key: "Keynote", pages: "Pages", numbers: "Numbers", doc: "Word", docx: "Word", xls: "Excel", xlsx: "Excel", ppt: "PowerPoint", pptx: "PowerPoint",
  zip: "ZIP Archive", dmg: "Disk Image", pkg: "Installer Package", app: "Application",
  mp4: "MPEG-4 Movie", mov: "QuickTime Movie", mp3: "MP3 Audio", m4a: "MPEG-4 Audio", wav: "WAV Audio",
};

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export const isFolder = (file: Pick<FileResult, "kind" | "path">) => file.kind === "Folder" || file.path.endsWith("/");

function category(file: FileResult): Category | null {
  const ext = extensionOf(file.name);
  for (const [name, list] of Object.entries(EXTENSIONS) as [Category, string[]][]) if (list.includes(ext)) return name;
  return null;
}

export function matchesFileType(file: FileResult, filter: FileTypeFilter): boolean {
  if (filter === "allTypes") return true;
  if (filter === "directory") return isFolder(file);
  if (isFolder(file)) return false;
  if (filter === "file") return true;
  const found = category(file);
  return filter === "other" ? found === null : found === filter;
}

/** "Folder", a known type name ("PNG", "TypeScript React"), the extension, or "File". */
export function fileTypeName(file: FileResult): string {
  if (isFolder(file)) return /\.app$/i.test(file.name) ? "Application" : "Folder";
  const ext = extensionOf(file.name);
  return TYPE_NAMES[ext] ?? (ext ? ext.toUpperCase() : "File");
}

export const isImageFile = (file: FileResult) => !isFolder(file) && EXTENSIONS.image.includes(extensionOf(file.name)) && extensionOf(file.name) !== "psd";
export const isTextFile = (file: FileResult) => !isFolder(file) && EXTENSIONS.text.includes(extensionOf(file.name));
