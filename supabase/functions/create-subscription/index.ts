import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_URL") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const auth = request.headers.get("Authorization");
    if (!auth) return json({ error: "Inicia sesión" }, 401);
    const supabaseUrl = required("SUPABASE_URL");
    const admin = createClient(supabaseUrl, required("SUPABASE_SERVICE_ROLE_KEY"));
    const token = auth.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    const user = userData.user;
    if (userError || !user?.email) return json({ error: "Sesión inválida" }, 401);

    const { data: owner } = await admin.from("app_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (owner) return json({ error: "La cuenta propietaria ya tiene acceso total" }, 400);

    const body = await request.json().catch(() => ({}));
    const cycle = body.cycle === "yearly" ? "yearly" : "monthly";
    const plan = cycle === "yearly" ? "student_yearly" : "student_monthly";
    const amount = cycle === "yearly" ? 119 : 12.9;
    const appUrl = required("APP_URL").replace(/\/$/, "");

    const mpResponse = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${required("MERCADOPAGO_ACCESS_TOKEN")}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reason: cycle === "yearly" ? "Habits Student · Anual" : "Habits Student · Mensual",
        external_reference: user.id,
        payer_email: user.email,
        auto_recurring: {
          frequency: 1,
          frequency_type: cycle === "yearly" ? "years" : "months",
          transaction_amount: amount,
          currency_id: "PEN"
        },
        back_url: `${appUrl}/#/planes`,
        status: "pending"
      })
    });
    const mp = await mpResponse.json();
    if (!mpResponse.ok || !mp.id || !mp.init_point) {
      console.error("Mercado Pago", mp);
      return json({ error: "Mercado Pago rechazó la creación del pago" }, 502);
    }

    const { error: saveError } = await admin.from("subscriptions").upsert({
      user_id: user.id,
      provider: "mercadopago",
      provider_subscription_id: mp.id,
      plan,
      status: mp.status || "pending",
      updated_at: new Date().toISOString()
    }, { onConflict: "provider_subscription_id" });
    if (saveError) throw saveError;
    return json({ initPoint: mp.init_point });
  } catch (error) {
    console.error(error);
    return json({ error: "No se pudo iniciar la suscripción" }, 500);
  }
});

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Falta ${name}`);
  return value;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
