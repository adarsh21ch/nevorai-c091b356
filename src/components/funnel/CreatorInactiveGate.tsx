import { PlanInactiveScreen } from "@/components/PlanInactiveScreen";

interface Props {
  creatorName?: string | null;
}

/**
 * Kept as a thin shim over the shared PlanInactiveScreen so all existing
 * import sites keep working. The user has explicitly asked for a neutral
 * "temporarily unavailable" message — no mention of contacting the creator,
 * no mention of billing / plans.
 */
export const CreatorInactiveGate = (_props: Props) => <PlanInactiveScreen />;
