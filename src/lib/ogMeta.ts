// Shared Open Graph / Twitter Card meta builder for public routes.
// Every new public route MUST use buildOgMeta so link previews stay consistent.

export const SITE = "https://nevorai.com";
export const SITE_NAME = "Nevorai";

export type BuildOgMetaInput = {
  title: string;
  description: string;
  url: string;
  image?: string | null;
  type?: string; // og:type, defaults to "website"
  imageWidth?: number;
  imageHeight?: number;
};

export type HeadResult = {
  meta: Array<Record<string, string>>;
  links: Array<{ rel: string; href: string }>;
};

export function buildOgMeta({
  title,
  description,
  url,
  image,
  type = "website",
  imageWidth = 1280,
  imageHeight = 720,
}: BuildOgMetaInput): HeadResult {
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} — ${SITE_NAME}`;
  const meta: Array<Record<string, string>> = [
    { title: fullTitle },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:type", content: type },
    { property: "og:site_name", content: SITE_NAME },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];

  if (image) {
    meta.push(
      { property: "og:image", content: image },
      { property: "og:image:secure_url", content: image },
      { property: "og:image:width", content: String(imageWidth) },
      { property: "og:image:height", content: String(imageHeight) },
      { name: "twitter:image", content: image },
      { name: "twitter:card", content: "summary_large_image" },
    );
  } else {
    meta.push({ name: "twitter:card", content: "summary_large_image" });
  }

  return {
    meta,
    links: [{ rel: "canonical", href: url }],
  };
}

export function genericNevoraiMeta(url: string, label = "Nevorai"): HeadResult {
  return buildOgMeta({
    title: label,
    description: "Watch on Nevorai — Same effort. Twice the conversion.",
    url,
  });
}
