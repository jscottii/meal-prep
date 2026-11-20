// Stripe → WFD Plus. Set secrets STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET, deploy with JWT verification OFF,
// and point a Stripe webhook (checkout.session.completed, customer.subscription.updated, customer.subscription.deleted) here.
import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2024-06-20' });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature') || '';
  const body = await req.text();
  let event: Stripe.Event;
  try { event = await stripe.webhooks.constructEventAsync(body, sig, Deno.env.get('STRIPE_WEBHOOK_SECRET') || ''); }
  catch (e) { return new Response('bad signature', { status: 400 }); }

  const set = (row: Record<string, unknown>) => admin.from('entitlements').upsert({ ...row, updated_at: new Date().toISOString() });
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object as Stripe.Checkout.Session;
    const uid = s.client_reference_id;   // the app adds the signed-in person's id to the payment link
    if (uid && /^[0-9a-f-]{36}$/.test(uid)) await set({ user_id: uid, plus: true, source: 'stripe', stripe_customer: String(s.customer || ''), expires_at: null });
  }
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    const active = event.type === 'customer.subscription.updated' && ['active', 'trialing', 'past_due'].includes(sub.status);
    await admin.from('entitlements').update({ plus: active, expires_at: active ? null : new Date().toISOString(), updated_at: new Date().toISOString() }).eq('stripe_customer', String(sub.customer));
  }
  return new Response('ok');
});
