/**
 * Video thumbnail helpers.
 *
 * - `captureFirstFrame` / `captureFirstFrameDataUrl` — legacy small-JPEG helpers
 *   kept for callers that only need an in-memory data URL.
 * - `captureVideoFrameBlob` — captures a 1280x720 cover-fit JPEG blob from a
 *   File or a public URL, suitable for uploading to storage.
 * - `uploadVideoThumbnailFromSource` — captures + uploads to Supabase Storage
 *   and updates `video_assets.thumbnail_url`. Silent-fails to null.
 */
import { supabase } from "@/integrations/supabase/client";

const OG_WIDTH = 1280;
const OG_HEIGHT = 720;
const THUMBNAIL_BUCKET = "landing-page-assets";
const THUMBNAIL_PREFIX = "video-thumbnails";

export async function captureFirstFrameDataUrl(
  file: File,
  opts: { maxWidth?: number; quality?: number } = {},
): Promise<string | null> {
  const blob = await captureFirstFrame(file, opts);
  if (!blob) return null;
  return await new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

export async function captureFirstFrame(
  file: File,
  opts: { maxWidth?: number; quality?: number } = {},
): Promise<Blob | null> {
  const { maxWidth = 480, quality = 0.78 } = opts;
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(null);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    video.src = url;

    const cleanup = () => URL.revokeObjectURL(url);

    video.onloadedmetadata = () => {
      try {
        video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
      } catch {
        cleanup();
        resolve(null);
      }
    };
    video.onseeked = () => {
      try {
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 360;
        const scale = Math.min(1, maxWidth / w);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) { cleanup(); return resolve(null); }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => { cleanup(); resolve(blob); }, "image/jpeg", quality);
      } catch { cleanup(); resolve(null); }
    };
    video.onerror = () => { cleanup(); resolve(null); };
  });
}

/**
 * Capture a 1280x720 cover-fit JPEG frame from a video source (File or URL).
 * Seeks to ~1s or 10% of duration, whichever is smaller.
 * Returns null on any failure (unsupported codec, iOS quirks, CORS on URL).
 */
export async function captureVideoFrameBlob(
  source: File | string,
  opts: { quality?: number } = {},
): Promise<Blob | null> {
  const { quality = 0.8 } = opts;
  if (typeof document === "undefined") return null;

  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    // Needed to draw a remote URL to canvas without tainting.
    if (typeof source === "string") video.crossOrigin = "anonymous";

    const objectUrl = typeof source !== "string" ? URL.createObjectURL(source) : null;
    const src = objectUrl ?? (source as string);
    let done = false;
    const finish = (blob: Blob | null) => {
      if (done) return;
      done = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(blob);
    };
    // Safety timeout — some codecs never fire onseeked on iOS.
    const timer = setTimeout(() => finish(null), 15000);

    video.onloadedmetadata = () => {
      try {
        const target = Math.min(1, (video.duration || 10) * 0.1);
        video.currentTime = Number.isFinite(target) && target > 0 ? target : 0.1;
      } catch { clearTimeout(timer); finish(null); }
    };
    video.onseeked = () => {
      try {
        const vw = video.videoWidth || OG_WIDTH;
        const vh = video.videoHeight || OG_HEIGHT;
        const canvas = document.createElement("canvas");
        canvas.width = OG_WIDTH;
        canvas.height = OG_HEIGHT;
        const ctx = canvas.getContext("2d");
        if (!ctx) { clearTimeout(timer); finish(null); return; }
        // Letterbox with cover-fit: fill entire canvas, crop overflow.
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT);
        const scale = Math.max(OG_WIDTH / vw, OG_HEIGHT / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        const dx = (OG_WIDTH - dw) / 2;
        const dy = (OG_HEIGHT - dh) / 2;
        ctx.drawImage(video, dx, dy, dw, dh);
        canvas.toBlob(
          (blob) => { clearTimeout(timer); finish(blob); },
          "image/jpeg",
          quality,
        );
      } catch { clearTimeout(timer); finish(null); }
    };
    video.onerror = () => { clearTimeout(timer); finish(null); };
    video.src = src;
  });
}

/**
 * Capture a frame from the given source, upload to Supabase Storage under
 * `video-thumbnails/{videoId}.jpg`, and persist `video_assets.thumbnail_url`.
 * Never throws — returns the public URL on success, null on any failure.
 */
export async function uploadVideoThumbnailFromSource(
  videoId: string,
  source: File | string,
): Promise<string | null> {
  try {
    const blob = await captureVideoFrameBlob(source);
    if (!blob) return null;
    const path = `${THUMBNAIL_PREFIX}/${videoId}.jpg`;
    const { error: upErr } = await supabase.storage
      .from(THUMBNAIL_BUCKET)
      .upload(path, blob, {
        cacheControl: "31536000",
        upsert: true,
        contentType: "image/jpeg",
      });
    if (upErr) return null;
    const { data } = supabase.storage.from(THUMBNAIL_BUCKET).getPublicUrl(path);
    const publicUrl = data?.publicUrl || null;
    if (!publicUrl) return null;
    // Cache-bust so refreshed thumbnails show immediately.
    const finalUrl = `${publicUrl}?v=${Date.now()}`;
    const { error: dbErr } = await supabase
      .from("video_assets")
      .update({ thumbnail_url: finalUrl })
      .eq("id", videoId);
    if (dbErr) return null;
    return finalUrl;
  } catch {
    return null;
  }
}
