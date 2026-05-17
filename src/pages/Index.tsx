import { Navigate } from "@/lib/router-compat";
import LandingV2 from "@/components/landing-v2/LandingV2";

const isStandalonePWA = (): boolean => {
  if (typeof window === "undefined") return false;
  const mql = window.matchMedia?.("(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const iosStandalone = (window.navigator as any).standalone === true;
  return !!(mql?.matches || iosStandalone);
};

const Index = () => {
  if (isStandalonePWA()) {
    return <Navigate to="/dashboard" replace />;
  }
  return <LandingV2 />;
};

export default Index;
