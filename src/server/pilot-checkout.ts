import "server-only";
import { assignPilotGroup, type PilotGroup, type PilotOrderResult } from "@/src/domain/pilot-checkout";
import { dataSource, supabaseRest } from "@/src/lib/supabase-rest";
import { getCart } from "@/src/server/store";

export async function getPilotAssignment(sessionId: string): Promise<PilotGroup> {
  if (process.env.MIPO_EXPERIMENT_ENABLED !== "true") {
    if (dataSource() === "supabase") {
      await getCart(sessionId);
      await supabaseRest(`anonymous_sessions?id=eq.${sessionId}`, { method: "PATCH", body: JSON.stringify({ experiment_group: "treatment" }) });
    }
    return "treatment";
  }
  if (dataSource() === "local") return assignPilotGroup(sessionId);
  await getCart(sessionId);
  return supabaseRest<PilotGroup>("rpc/get_or_assign_pilot_group", {
    method: "POST",
    body: JSON.stringify({ p_session_id: sessionId }),
  });
}

export async function completePilotCheckout(sessionId: string, idempotencyKey: string): Promise<PilotOrderResult> {
  if (dataSource() === "local") throw new Error("Checkout persistente requer DATA_SOURCE=supabase.");
  await getCart(sessionId);
  return supabaseRest<PilotOrderResult>("rpc/complete_pilot_checkout", {
    method: "POST",
    body: JSON.stringify({ p_session_id: sessionId, p_idempotency_key: idempotencyKey }),
  });
}
