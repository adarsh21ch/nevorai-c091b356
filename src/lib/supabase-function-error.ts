function pickReadableMessage(payload: any, fallback: string) {
  const razorpayError = payload?.razorpay_error?.error;

  return (
    razorpayError?.description ||
    razorpayError?.reason ||
    payload?.error_description ||
    payload?.details ||
    payload?.error ||
    payload?.message ||
    fallback
  );
}

export async function getSupabaseFunctionErrorMessage(error: any, fallback = "Request failed") {
  if (!error) return fallback;

  const baseMessage = error?.message || fallback;
  const response = error?.context;

  if (!response || typeof response.clone !== "function") {
    return baseMessage;
  }

  try {
    const payload = await response.clone().json();
    return pickReadableMessage(payload, baseMessage);
  } catch {
    try {
      const text = await response.clone().text();
      if (!text) return baseMessage;

      try {
        return pickReadableMessage(JSON.parse(text), baseMessage);
      } catch {
        return text;
      }
    } catch {
      return baseMessage;
    }
  }
}