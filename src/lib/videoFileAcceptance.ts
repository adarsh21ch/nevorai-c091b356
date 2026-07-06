const MAX_HEADER_SCAN_BYTES = 8 * 1024 * 1024;

export type VideoFileAcceptance = {
  ok: boolean;
  message?: string;
  detail?: string;
};

const SAFE_MP4_VIDEO_CODECS = new Set(["avc1", "avc3"]);
const UNSAFE_MP4_VIDEO_CODECS = new Set([
  "hvc1", "hev1", "av01", "vp09", "vp08", "mp4v", "dvhe", "dvh1",
  "apch", "apcn", "apcs", "apco", "ap4h", "ap4x", "jpeg", "mjpa", "mjpg",
]);
const NON_VIDEO_MP4_SAMPLE_ENTRIES = new Set([
  "mp4a", "enca", "ac-3", "ec-3", "alac", "flac", "opus",
  "text", "tx3g", "sbtl", "subt", "stpp", "wvtt", "c608", "c708", "meta",
]);

const readSlice = (blob: Blob) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    if (typeof FileReader === "undefined") {
      blob.arrayBuffer().then(resolve, reject);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error || new Error("Could not read video file"));
    reader.readAsArrayBuffer(blob);
  });

const readMp4ScanBuffer = async (file: File) => {
  if (file.size <= MAX_HEADER_SCAN_BYTES * 2) return readSlice(file);
  const head = await readSlice(file.slice(0, MAX_HEADER_SCAN_BYTES));
  const tail = await readSlice(file.slice(file.size - MAX_HEADER_SCAN_BYTES));
  const combined = new Uint8Array(head.byteLength + tail.byteLength);
  combined.set(new Uint8Array(head), 0);
  combined.set(new Uint8Array(tail), head.byteLength);
  return combined.buffer;
};

const fourCc = (view: DataView, offset: number) => {
  if (offset < 0 || offset + 4 > view.byteLength) return "";
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
};

const looksLikeBoxType = (type: string) => /^[a-zA-Z0-9 ]{4}$/.test(type);

const collectMp4SampleCodecs = (buffer: ArrayBuffer): string[] => {
  const view = new DataView(buffer);
  const codecs = new Set<string>();

  for (let i = 0; i < view.byteLength - 16; i += 1) {
    if (fourCc(view, i) !== "stsd") continue;
    const boxStart = i - 4;
    if (boxStart < 0) continue;
    const boxSize = view.getUint32(boxStart);
    if (boxSize < 24 || boxStart + boxSize > view.byteLength + 8) continue;

    const entryCountOffset = i + 8;
    if (entryCountOffset + 4 > view.byteLength) continue;
    const entryCount = Math.min(view.getUint32(entryCountOffset), 16);
    let entryOffset = entryCountOffset + 4;

    for (let entry = 0; entry < entryCount && entryOffset + 8 <= view.byteLength; entry += 1) {
      const entrySize = view.getUint32(entryOffset);
      const entryType = fourCc(view, entryOffset + 4).toLowerCase();
      if (looksLikeBoxType(entryType)) codecs.add(entryType);
      if (entrySize < 8) break;
      entryOffset += entrySize;
    }
  }

  return Array.from(codecs);
};

const isMp4ByNameOrType = (file: File) => {
  const name = file.name.toLowerCase();
  return name.endsWith(".mp4") || file.type === "video/mp4";
};

export const validatePlayableUploadFile = async (file: File): Promise<VideoFileAcceptance> => {
  if (!isMp4ByNameOrType(file)) {
    return {
      ok: false,
      message: "Please upload MP4 only.",
      detail: "MOV, WEBM, MKV, AVI and YouTube-downloaded WEBM files can fail on prospect phones. Convert/download as MP4 (H.264) and upload again.",
    };
  }

  try {
    const buffer = await readMp4ScanBuffer(file);
    const codecs = collectMp4SampleCodecs(buffer);

    if (codecs.length === 0) {
      return {
        ok: false,
        message: "Could not verify this MP4 codec.",
        detail: "Please convert/export it as MP4 (H.264/AVC) and upload again. This avoids prospect-side playback failure.",
      };
    }

    const possibleVideoCodecs = codecs.filter((codec) => !NON_VIDEO_MP4_SAMPLE_ENTRIES.has(codec));
    const safeVideoCodecs = possibleVideoCodecs.filter((codec) => SAFE_MP4_VIDEO_CODECS.has(codec));
    const unsafeVideoCodecs = possibleVideoCodecs.filter((codec) => UNSAFE_MP4_VIDEO_CODECS.has(codec));

    if (unsafeVideoCodecs.length > 0) {
      return {
        ok: false,
        message: "This MP4 uses an unsupported video codec.",
        detail: "Please convert it to MP4 (H.264/AVC). Avoid HEVC/H.265, AV1, VP9 and ProRes — they often show format errors to viewers.",
      };
    }

    if (possibleVideoCodecs.length > 0 && safeVideoCodecs.length === 0) {
      return {
        ok: false,
        message: "This video codec is not safe for all browsers.",
        detail: "Convert/download as MP4 (H.264/AVC) before uploading.",
      };
    }

    if (safeVideoCodecs.length === 0) {
      return {
        ok: false,
        message: "No supported video track was found.",
        detail: "Please export/download again as MP4 (H.264/AVC).",
      };
    }
  } catch {
    return {
      ok: false,
      message: "Could not verify this video file.",
      detail: "Please export/download it again as MP4 (H.264) and retry.",
    };
  }

  return { ok: true };
};

export const VIDEO_UPLOAD_ACCEPT = "video/mp4,.mp4";

export const VIDEO_UPLOAD_HELP_TEXT = "MP4 only · H.264/AVC codec · Max 500 MB";