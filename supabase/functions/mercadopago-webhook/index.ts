import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("ok");
  try {
    const body = await request.json().catch(() => ({}));
    const dataId = String(body?.data?.id || new URL(request.url).searchParams.get("data.id") || "");
    const requestId = request.headers.get("x-request-id") || "";
    if (!dataId || !await validSignature(request.headers.get("x-signature") || "", requestId, dataId)) {
      return new Response("Firma inválida", { status: 401 });
    }

    const mpResponse = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(dataId)}`, {
      headers: { Authorization: `Bearer ${required("MERCADOPAGO_ACCESS_TOKEN")}` }
    });
    if (!mpResponse.ok) return new Response("No encontrado", { status: 404 });
    const subscription = await mpResponse.json();
    const userId = String(subscription.external_reference || "");
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return new Response("Referencia inválida", { status: 400 });

    const admin = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"));
    const eventId = `${requestId}:${dataId}:${body.action || "updated"}`;
    const { error: eventError } = await admin.from("payment_events").insert({
      id: eventId,
      event_type: String(body.action || body.type || "subscription.updated"),
      payload: body
    });
    if (eventError?.code === "23505") return new Response("ok");
    if (eventError) throw eventError;

    const frequency = subscription.auto_recurring?.frequency_type;
    const amount = Number(subscription.auto_recurring?.transaction_amount || 0);
    const plan = frequency === "years" && amount === 119 ? "student_yearly" : "student_monthly";
    const allowedStatus = ["pending", "authorized", "paused", "cancelled"].includes(subscription.status)
      ? subscription.status : "pending";
    const { error } = await admin.from("subscriptions").upsert({
      user_id: userId,
      provider: "mercadopago",
      provider_subscription_id: dataId,
      plan,
      status: allowedStatus,
      current_period_end: subscription.next_payment_date || null,
      updated_at: new Date().toISOString()
    }, { onConflict: "provider_subscription_id" });
    if (error) throw error;
    return new Response("ok");
  } catch (error) {
    console.error(error);
    return new Response("Error", { status: 500 });
  }
});

async function validSignature(signature: string, requestId: string, dataId: string): Promise<boolean> {
  const parts = Object.fromEntries(signature.split(",").map((part) => part.split("=", 2)));
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(required("MERCADOPAGO_WEBHOOK_SECRET")),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const expected = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (expected.length !== parts.v1.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return mismatch === 0;
}

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Falta ${name}`);
  return value;
}
