export type VideoFileAcceptance = {
  ok: boolean;
  message?: string;
  detail?: string;
};

const VIDEO_EXTENSIONS = new Set([
  "mp4", "m4v", "mov", "webm", "mkv", "avi", "mpeg", "mpg", "3gp", "3g2", "ogg", "ogv",
]);

// Formats that MAY not play in every browser (HEVC-in-MOV, MKV containers,
// AVI legacy codecs). MP4/H.264/WEBM play everywhere so they're never flagged.
const RISKY_EXTENSIONS = new Set(["mov", "m4v", "mkv", "avi", "3gp", "3g2"]);
const RISKY_MIME_HINTS = ["quicktime", "matroska", "x-msvideo", "hevc", "h265"];

const looksLikeVideo = (file: File) => {
  if (file.type?.toLowerCase().startsWith("video/")) return true;
  const ext = file.name.toLowerCase().split(".").pop() || "";
  return VIDEO_EXTENSIONS.has(ext);
};

export const validatePlayableUploadFile = async (file: File): Promise<VideoFileAcceptance> => {
  if (!looksLikeVideo(file)) {
    return {
      ok: false,
      message: "Please upload a video file.",
      detail: "Choose a standard video file from your device.",
    };
  }

  return { ok: true };
};

export const VIDEO_UPLOAD_ACCEPT = "video/*,.mp4,.m4v,.mov,.webm,.mkv,.avi,.mpeg,.mpg,.3gp,.3g2,.ogg,.ogv";

export const VIDEO_UPLOAD_HELP_TEXT = "Video files supported · Max 2 GB";

export const FORMAT_ADVISORY_MESSAGE =
  "Some devices may not play this format. MP4 (H.264) plays everywhere.";

/**
 * Advisory-only check: returns a warning string if the file's container/codec
 * is not universally supported. Never blocks — upload proceeds regardless.
 * Pass either a File (before upload) or a URL/filename (after upload).
 */
export const getVideoFormatWarning = (
  input: File | string | null | undefined,
): string | null => {
  if (!input) return null;
  let name = "";
  let mime = "";
  if (typeof input === "string") {
    name = input.toLowerCase();
  } else {
    name = (input.name || "").toLowerCase();
    mime = (input.type || "").toLowerCase();
  }
  const ext = name.split("?")[0].split("#")[0].split(".").pop() || "";
  if (RISKY_EXTENSIONS.has(ext)) return FORMAT_ADVISORY_MESSAGE;
  if (mime && RISKY_MIME_HINTS.some((h) => mime.includes(h))) return FORMAT_ADVISORY_MESSAGE;
  return null;
};
