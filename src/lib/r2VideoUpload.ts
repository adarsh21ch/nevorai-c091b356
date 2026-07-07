import { supabase } from "@/integrations/supabase/client";
import { sanitizeFilename, hasDoubleExtension } from "@/lib/sanitize";
import { validatePlayableUploadFile } from "@/lib/videoFileAcceptance";

type UploadPurpose = "video-asset" | "academy-video" | "academy-thumbnail";

interface UploadVideoToR2Options {
  file: File;
  title?: string;
  timeoutMs?: number;
  onProgress?: (
    percent: number,
    meta?: { loaded: number; total: number }
  ) => void;
}

interface UploadVideoToR2Result {
  publicUrl: string;
  videoId: string;
}

interface UploadFileToR2Options {
  file: File;
  purpose: UploadPurpose;
  title?: string;
  timeoutMs?: number;
  onProgress?: (
    percent: number,
    meta?: { loaded: number; total: number }
  ) => void;
}

interface UploadFileToR2Result {
  publicUrl: string;
  r2Key?: string;
  videoId?: string;
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Upload failed";
};

const resolveContentType = (file: File): string => {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".mp4")) return "video/mp4";
  if (name.endsWith(".m4v")) return "video/x-m4v";
  if (name.endsWith(".mov")) return "video/quicktime";
  if (name.endsWith(".webm")) return "video/webm";
  if (name.endsWith(".mkv")) return "video/x-matroska";
  if (name.endsWith(".avi")) return "video/x-msvideo";
  if (name.endsWith(".mpeg") || name.endsWith(".mpg")) return "video/mpeg";
  if (name.endsWith(".3gp")) return "video/3gpp";
  if (name.endsWith(".3g2")) return "video/3gpp2";
  if (name.endsWith(".ogg") || name.endsWith(".ogv")) return "video/ogg";
  return "application/octet-stream";
};

const isVideoPurpose = (purpose: UploadPurpose) => purpose === "video-asset" || purpose === "academy-video";

export const uploadVideoToR2 = async ({
  file,
  title,
  timeoutMs = 30 * 60 * 1000,
  onProgress,
}: UploadVideoToR2Options): Promise<UploadVideoToR2Result> => {
  const result = await uploadFileToR2({
    file,
    title,
    timeoutMs,
    onProgress,
    purpose: "video-asset",
  });

  if (!result.videoId) {
    throw new Error("Upload finished but video record was not created");
  }

  return {
    publicUrl: result.publicUrl,
    videoId: result.videoId,
  };
};

export const uploadFileToR2 = async ({
  file,
  purpose,
  title,
  timeoutMs = 30 * 60 * 1000,
  onProgress,
}: UploadFileToR2Options): Promise<UploadFileToR2Result> => {
  let videoId: string | null = null;

  try {
    // Block double-extension tricks like video.mp4.exe
    if (hasDoubleExtension(file.name)) {
      throw new Error("This filename looks unsafe — please rename and try again.");
    }
    if (isVideoPurpose(purpose)) {
      const acceptance = await validatePlayableUploadFile(file);
      if (!acceptance.ok) {
        throw new Error(acceptance.detail ? `${acceptance.message} ${acceptance.detail}` : acceptance.message || "Please upload a video file.");
      }
    }
    const safeName = sanitizeFilename(file.name);
    const contentType = resolveContentType(file);

    const { data, error } = await supabase.functions.invoke("get-r2-upload-url", {
      body: {
        filename: safeName,
        contentType,
        title: title || safeName,
        fileSize: file.size,
        purpose,
      },
    });

    if (error || !data?.uploadUrl) {
      throw new Error(data?.error || error?.message || "Failed to start upload");
    }

    videoId = data.videoId || null;

    // PUT to R2 with a silent one-time retry on transient network failure.
    // Many "network hiccup" reports were a single dropped TLS handshake or
    // a CORS-preflight race that succeeds immediately on the second try.
    const putOnce = () =>
      new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", data.uploadUrl);
        xhr.timeout = timeoutMs;
        xhr.setRequestHeader("Content-Type", contentType);

        xhr.upload.addEventListener("progress", (event) => {
          if (!event.lengthComputable) return;
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress?.(percent, { loaded: event.loaded, total: event.total });
        });

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            onProgress?.(100, { loaded: file.size, total: file.size });
            resolve();
            return;
          }
          const err: any = new Error(`Upload failed (HTTP ${xhr.status})`);
          err.retryable = xhr.status >= 500 || xhr.status === 0;
          reject(err);
        };
        xhr.onerror = () => {
          const err: any = new Error("Network error while uploading video");
          err.retryable = true;
          reject(err);
        };
        xhr.ontimeout = () => {
          const err: any = new Error("Upload timed out. Try a smaller file or a faster connection.");
          err.retryable = false;
          reject(err);
        };
        xhr.send(file);
      });

    try {
      await putOnce();
    } catch (firstErr: any) {
      if (!firstErr?.retryable) throw firstErr;
      // Reset progress UI and try once more silently.
      onProgress?.(0, { loaded: 0, total: file.size });
      await new Promise((r) => setTimeout(r, 800));
      await putOnce();
    }

    if (data.confirmRequired === false) {
      if (!data.publicUrl) {
        throw new Error("Upload finished but no public URL was returned");
      }

      return {
        publicUrl: data.publicUrl,
        r2Key: data.r2Key,
      };
    }

    const { data: confirmData, error: confirmError } = await supabase.functions.invoke("confirm-r2-upload", {
      body: {
        videoId,
        fileSizeBytes: file.size,
      },
    });

    if (confirmError || !confirmData?.publicUrl) {
      throw new Error(confirmData?.error || confirmError?.message || "Upload finished but confirmation failed");
    }

    return {
      videoId: videoId || undefined,
      publicUrl: confirmData.publicUrl,
      r2Key: data.r2Key,
    };
  } catch (error) {
    if (videoId && purpose === "video-asset") {
      try {
        await supabase.functions.invoke("confirm-r2-upload", {
          body: {
            videoId,
            failed: true,
            errorMessage: getErrorMessage(error),
          },
        });
      } catch {
        // best effort cleanup
      }
    }

    throw error;
  }
};
