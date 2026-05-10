import { loadStripe, Stripe } from "@stripe/stripe-js";
import { supabase } from "@/integrations/supabase/client";

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

export function getStripeEnvironment(): "sandbox" | "live" {
  return clientToken?.startsWith("pk_test_") ? "sandbox" : "live";
}

let stripePromise: Promise<Stripe | null> | null = null;
export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    if (!clientToken) {
      throw new Error("VITE_PAYMENTS_CLIENT_TOKEN is not set");
    }
    stripePromise = loadStripe(clientToken);
  }
  return stripePromise!;
}

export async function createStripeCheckoutSession(opts: {
  priceId: string;
  customerEmail?: string;
  userId?: string;
  returnUrl?: string;
}): Promise<string> {
  const { data, error } = await supabase.functions.invoke("stripe-checkout", {
    body: { ...opts, environment: getStripeEnvironment() },
  });
  if (error || !data?.clientSecret) {
    throw new Error(error?.message || "Failed to create checkout session");
  }
  return data.clientSecret as string;
}

export async function openStripePortal(returnUrl?: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("create-portal-session", {
    body: { returnUrl, environment: getStripeEnvironment() },
  });
  if (error || !data?.url) {
    throw new Error(error?.message || "Unable to open billing portal");
  }
  return data.url as string;
}
