/**
 * Video thumbnail helpers with smart frame picking.
 *
 * `captureVideoFrameBlob` picks a non-black frame by sampling brightness and
 * seeking forward through candidate timestamps if the first pick is dark.
 * `uploadVideoThumbnailFromSource` captures + uploads to Supabase Storage and
 * updates `video_assets.thumbnail_url`. Silent-fails to null.
 */
import { supabase } from "@/integrations/supabase/client";

const OG_WIDTH = 1280;
const OG_HEIGHT = 720;
const THUMBNAIL_BUCKET = "landing-page-assets";
const THUMBNAIL_PREFIX = "video-thumbnails";
const BRIGHTNESS_MIN = 10; // avg luma below this is "near black"

/** Legacy small-JPEG helper — kept for existing callers. */
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

/** Compute average luma of a canvas (0-255). */
function averageBrightness(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  try {
    // Sample a downscaled slice for speed.
    const step = Math.max(1, Math.floor((w * h) / 20000));
    const data = ctx.getImageData(0, 0, w, h).data;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4 * step) {
      // Rec.601 luma
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      count++;
    }
    return count ? sum / count : 0;
  } catch {
    // Tainted canvas or other read failure — treat as "bright enough" so we
    // don't loop pointlessly.
    return 255;
  }
}

/**
 * Capture a 1280x720 cover-fit JPEG frame from a video source (File or URL).
 * Tries multiple timestamps and returns the first non-black frame; falls back
 * to the brightest attempt if all are dark. Returns null on any failure.
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
    if (typeof source === "string") video.crossOrigin = "anonymous";

    const objectUrl = typeof source !== "string" ? URL.createObjectURL(source) : null;
    const src = objectUrl ?? (source as string);

    let done = false;
    let bestBlob: Blob | null = null;
    let bestBrightness = -1;
    let candidates: number[] = [];
    let idx = 0;

    const finish = (blob: Blob | null) => {
      if (done) return;
      done = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(blob);
    };
    const timer = setTimeout(() => finish(bestBlob), 20000);

    const canvas = document.createElement("canvas");
    canvas.width = OG_WIDTH;
    canvas.height = OG_HEIGHT;
    const ctx = canvas.getContext("2d");

    const tryNext = () => {
      if (done) return;
      if (!ctx || idx >= candidates.length) {
        clearTimeout(timer);
        finish(bestBlob);
        return;
      }
      const t = candidates[idx++];
      try {
        video.currentTime = t;
      } catch {
        clearTimeout(timer);
        finish(bestBlob);
      }
    };

    video.onloadedmetadata = () => {
      const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      // Build up to 5 candidate timestamps.
      const raw = [
        1,
        3,
        5,
        10,
        dur ? dur * 0.1 : 0,
        dur ? dur * 0.25 : 0,
      ]
        .filter((t) => t > 0 && (dur === 0 || t < dur))
        .slice(0, 5);
      candidates = raw.length ? raw : [0.5];
      tryNext();
    };

    video.onseeked = () => {
      if (done || !ctx) return;
      try {
        const vw = video.videoWidth || OG_WIDTH;
        const vh = video.videoHeight || OG_HEIGHT;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT);
        const scale = Math.max(OG_WIDTH / vw, OG_HEIGHT / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        ctx.drawImage(video, (OG_WIDTH - dw) / 2, (OG_HEIGHT - dh) / 2, dw, dh);
        const brightness = averageBrightness(ctx, OG_WIDTH, OG_HEIGHT);
        canvas.toBlob(
          (blob) => {
            if (blob && brightness > bestBrightness) {
              bestBlob = blob;
              bestBrightness = brightness;
            }
            if (brightness >= BRIGHTNESS_MIN) {
              clearTimeout(timer);
              finish(bestBlob);
            } else {
              tryNext();
            }
          },
          "image/jpeg",
          quality,
        );
      } catch {
        tryNext();
      }
    };
    video.onerror = () => { clearTimeout(timer); finish(bestBlob); };
    video.src = src;
  });
}

/**
 * Capture a frame from the given source, upload to Supabase Storage under
 * `video-thumbnails/{videoId}.jpg`, and persist `video_assets.thumbnail_url`
 * with a cache-buster. Never throws — returns the public URL or null.
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
    const finalUrl = `${publicUrl}?t=${Date.now()}`;
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
