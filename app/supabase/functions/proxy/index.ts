// proxy — the only server code. Signed-in household members only.
//   bm-archive            newest posts from the bare minimum
//   bm-post {slug}        one post (recipes + shopping list HTML)
//   serp-account          check the household's SerpApi key (free)
//   serp-search {q, location}  one Google Shopping search (counts toward the monthly cap)
//   serp-location {city, state} SerpApi's canonical location name
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const BM = 'https://barefoodtim.substack.com';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u, error: ue } = await admin.auth.getUser(token);
    if (ue || !u?.user) return json({ error: 'Please sign in again.' }, 401);
    const { data: mem } = await admin.from('members').select('household_id').eq('user_id', u.user.id).maybeSingle();
    if (!mem) return json({ error: 'No household yet.' }, 403);
    const hid = mem.household_id;
    const body = await req.json().catch(() => ({}));

    if (body.action === 'bm-archive') {
      const r = await fetch(`${BM}/api/v1/archive?sort=new&limit=30`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) return json({ error: `the bare minimum answered HTTP ${r.status}` }, 502);
      const j = await r.json();
      const posts = (Array.isArray(j) ? j : j.posts || []).map((p: any) => ({
        slug: p.slug, title: p.title, subtitle: p.subtitle || '', date: String(p.post_date || '').slice(0, 10),
        free: p.audience === 'everyone', url: p.canonical_url || `${BM}/p/${p.slug}`,
      }));
      return json({ posts });
    }

    if (body.action === 'bm-post') {
      const slug = String(body.slug || '').replace(/[^a-z0-9-]/gi, '');
      const r = await fetch(`${BM}/api/v1/posts/${slug}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) return json({ error: `Couldn't open that post (HTTP ${r.status})` }, 502);
      const p = await r.json();
      return json({ slug, title: p.title, date: String(p.post_date || '').slice(0, 10), free: p.audience === 'everyone',
                    url: p.canonical_url, html: p.body_html || '' });
    }

    if (String(body.action || '').startsWith('serp-')) {
      if (body.action === 'serp-location') {
        const r = await fetch(`https://serpapi.com/locations.json?limit=10&q=${encodeURIComponent(body.city || '')}`);
        const list = await r.json().catch(() => []);
        const hit = (list || []).find((x: any) => String(x.canonical_name || '').includes(body.state || 'California'));
        return json({ location: hit ? String(hit.canonical_name).replace(/,/g, ', ') : `${body.state || 'California'}, United States` });
      }
      const { data: sec } = await admin.from('household_secrets').select('serpapi_key').eq('household_id', hid).maybeSingle();
      const key = (sec?.serpapi_key || '').trim();
      if (!key) return json({ error: 'No SerpApi key saved yet. Add it in Settings.' }, 400);

      if (body.action === 'serp-account') {
        const r = await fetch(`https://serpapi.com/account.json?api_key=${encodeURIComponent(key)}`);
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) return json({ ok: false, error: j.error || `SerpApi answered HTTP ${r.status}` });
        return json({ ok: true, plan: j.plan_name || 'Free', left: j.plan_searches_left ?? j.total_searches_left, perMonth: j.searches_per_month });
      }

      if (body.action === 'serp-search') {
        const month = new Date().toISOString().slice(0, 7);
        const { data: st } = await admin.from('settings').select('data').eq('household_id', hid).maybeSingle();
        const limit = Number(st?.data?.serpMonthlyLimit) || 230;
        const { data: use } = await admin.from('serp_usage').select('n').eq('household_id', hid).eq('month', month).maybeSingle();
        const n = use?.n || 0;
        if (n >= limit) return json({ error: `Monthly SerpApi limit reached (${limit}).`, budget: true }, 429);
        const url = `https://serpapi.com/search.json?engine=google_shopping&gl=us&hl=en&num=60&location=${encodeURIComponent(body.location || 'California, United States')}&q=${encodeURIComponent(body.q || '')}&api_key=${encodeURIComponent(key)}`;
        const r = await fetch(url);
        const j = await r.json().catch(() => ({}));
        await admin.from('serp_usage').upsert({ household_id: hid, month, n: n + 1 });
        if (!r.ok || (j.error && !/hasn't returned any results/i.test(j.error))) return json({ error: j.error || `SerpApi HTTP ${r.status}` }, 502);
        const results = [...(j.shopping_results || []), ...(j.inline_shopping_results || [])].map((x: any) => ({
          title: x.title, source: x.source, price: x.extracted_price ?? (x.price ? Number(String(x.price).replace(/[^0-9.]/g, '')) : null),
        }));
        return json({ results, used: n + 1, limit });
      }
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
