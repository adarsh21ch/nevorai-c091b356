export type VideoFileAcceptance = {
  ok: boolean;
  message?: string;
  detail?: string;
};

const VIDEO_EXTENSIONS = new Set([
  "mp4", "m4v", "mov", "webm", "mkv", "avi", "mpeg", "mpg", "3gp", "3g2", "ogg", "ogv",
]);

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