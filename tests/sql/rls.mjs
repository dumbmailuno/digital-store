import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";

const db = new PGlite({ extensions: { pgcrypto } });
let pass = 0, failN = 0;
const ok = (name, cond) => { cond ? pass++ : failN++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); };
const throws = async (name, fn, match) => {
  try { await fn(); ok(name + " (expected error, got none)", false); }
  catch (e) { ok(name, match ? String(e.message).includes(match) : true); if (match && !String(e.message).includes(match)) console.log("   got:", e.message); }
};

// --- minimal Supabase emulation -------------------------------------------------
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, email_confirmed_at timestamptz default now());
  create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal', nullif(current_setting('request.jwt.claim.aal', true), '')) $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text);
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to public;
`);
for (const f of ["0001_core_schema.sql", "0002_payment_engine.sql", "0003_hardening_storage.sql", "0004_admin_analytics_and_content.sql", "0005_email_2fa_rate_limits.sql", "0006_fix_rand_hex.sql", "0007_role_separation.sql", "0008_developer_support_access.sql"]) {
  await db.exec(readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), "utf8"));
  console.log("applied", f);
}
await db.exec(`grant select on auth.users to authenticated; grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;`);

const as = async (role, uid, fn, aal = 'aal2') => {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); select set_config('request.jwt.claim.aal', '${aal}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`); }
};
const q = (sql, p) => db.query(sql, p);

// --- users ----------------------------------------------------------------------
const U = { dev: "00000000-0000-0000-0000-0000000000d1", admin: "00000000-0000-0000-0000-0000000000a1",
            a: "00000000-0000-0000-0000-00000000000a", b: "00000000-0000-0000-0000-00000000000b" };
for (const [k, id] of Object.entries(U)) {
  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)`, [id, `${k}@Example.com`, JSON.stringify({ full_name: `User ${k}` })]);
}
const prof = (await q(`select email, public_id from profiles where id=$1`, [U.a])).rows[0];
ok("signup trigger creates profile with lowercased email", prof.email === "a@example.com");
ok("public id has USR- prefix", /^USR-[0-9A-F]{8}$/.test(prof.public_id));
ok("signup grants customer role only", (await q(`select role from user_roles where user_id=$1`, [U.a])).rows.map(r => r.role).join() === "customer");

await q(`insert into user_roles values ($1,'admin'), ($2,'developer')`, [U.admin, U.dev]);
await throws("a second admin is rejected", () => q(`insert into user_roles values ($1,'admin')`, [U.a]), "one_admin");
await throws("a second developer is rejected", () => q(`insert into user_roles values ($1,'developer')`, [U.a]), "one_developer");

// --- catalog + wallet seed ------------------------------------------------------
const prod = (await q(`insert into products (slug,name,price_usd,status,download_limit,link_expiry_hours) values ('tpl','Template',50,'draft',1,24) returning id`)).rows[0].id;
await q(`insert into products (slug,name,price_usd,status) values ('draft','Draft',10,'draft')`);
const wallet = (await q(`insert into payment_wallets (asset,network,address) values ('USDT','tron','TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t') returning id`)).rows[0].id;
await q(`insert into product_files (product_id,path,size_bytes) values ($1,'tpl/v1.zip',1000)`, [prod]);
await q(`update products set status='active' where id=$1`, [prod]);

// --- RLS: catalog / wallets / platform --------------------------------------------
ok("anon sees only active products", (await as("anon", null, () => q(`select slug from products`))).rows.length === 1);
ok("customer cannot read wallet table", (await as("authenticated", U.a, () => q(`select * from payment_wallets`))).rows.length === 0);
ok("customer cannot read product_files", (await as("authenticated", U.a, () => q(`select * from product_files`))).rows.length === 0);
ok("customer cannot read platform_subscription", (await as("authenticated", U.a, () => q(`select * from platform_subscription`))).rows.length === 0);
ok("admin cannot read platform_subscription (developer only)", (await as("authenticated", U.admin, () => q(`select * from platform_subscription`))).rows.length === 0);
ok("developer can read platform_subscription", (await as("authenticated", U.dev, () => q(`select * from platform_subscription`))).rows.length === 1);
await throws("customer cannot edit products", () => as("authenticated", U.a, () => q(`update products set price_usd=1`)).then(r => { if (r.affectedRows === 0) throw new Error("denied (0 rows)"); }), "denied");
ok("admin CAN edit products", (await as("authenticated", U.admin, () => q(`update products set description='x' where slug='tpl'`))).affectedRows === 1);
ok("admin CAN edit store settings", (await as("authenticated", U.admin, () => q(`update store_settings set store_name='Acme'`))).affectedRows === 1);
ok("developer CANNOT edit store settings (admin-owned)", (await as("authenticated", U.dev, () => q(`update store_settings set store_name='Hacked'`))).affectedRows === 0);
ok("admin CANNOT change subscription", (await as("authenticated", U.admin, () => q(`update platform_subscription set status='active'`))).affectedRows === 0);
ok("developer CAN extend subscription", (await as("authenticated", U.dev, () => q(`update platform_subscription set grace_days=5`))).affectedRows === 1);

// --- privilege escalation attempts --------------------------------------------------
await throws("customer cannot self-promote to admin", () => as("authenticated", U.a, () => q(`insert into user_roles values ($1,'admin')`, [U.a])), "permission denied");
await throws("customer cannot edit profile.email", () => as("authenticated", U.a, () => q(`update profiles set email='x@y.z' where id=$1`, [U.a])), "permission denied");
ok("customer CAN edit own full_name", (await as("authenticated", U.a, () => q(`update profiles set full_name='New Name' where id=$1`, [U.a]))).affectedRows === 1);
ok("customer cannot see another profile", (await as("authenticated", U.a, () => q(`select id from profiles`))).rows.length === 1);
ok("admin sees all profiles", (await as("authenticated", U.admin, () => q(`select id from profiles`))).rows.length === 4);

// --- order / payment engine (service role) -------------------------------------------
await throws("customer cannot call create_order directly", () => as("authenticated", U.a, () => q(`select create_order($1, array[$2::uuid])`, [U.a, prod])), "permission denied");
await throws("anon cannot call transition_payment", () => as("anon", null, () => q(`select transition_payment(gen_random_uuid(),'expired',null,null)`)), "permission denied");

const svc = (sql, p) => as("service_role", null, () => q(sql, p));
await throws("draft product cannot be ordered", () => svc(`select create_order($1, array[(select id from products where slug='draft')])`, [U.a]), "product_unavailable");
await throws("empty cart rejected", () => svc(`select create_order($1, array[]::uuid[])`, [U.a]), "invalid_cart");
await throws("duplicate product rejected", () => svc(`select create_order($1, array[$2::uuid,$2::uuid])`, [U.a, prod]), "duplicate_product");

const orderId = (await svc(`select create_order($1, array[$2::uuid]) as id`, [U.a, prod])).rows[0].id;
const ord = (await q(`select public_id,total_usd,status from orders where id=$1`, [orderId])).rows[0];
ok("order total computed server-side ($50)", Number(ord.total_usd) === 50);
ok("order public id format", /^ORD-\d{8}-[0-9A-F]{5}$/.test(ord.public_id));
ok("order item snapshots name+price", (await q(`select product_name_snap, unit_price_usd from order_items where order_id=$1`, [orderId])).rows[0].product_name_snap === "Template");

const pay = (await svc(`select * from create_payment($1,$2,$3,1.0,50.000000)`, [orderId, U.a, wallet])).rows[0];
ok("payment created awaiting_payment with 1h quote", pay.public_id.startsWith("PAY-") && Math.abs(new Date(pay.expires_at) - Date.now() - 3600_000) < 60_000);
const payRow = (await q(`select id, status, address_snap, asset, network from payments where public_id=$1`, [pay.public_id])).rows[0];
ok("payment froze address/asset/network", payRow.address_snap.startsWith("TR7N") && payRow.asset === "USDT" && payRow.network === "tron");

await throws("wrong customer cannot create payment for someone else's order", () => svc(`select * from create_payment($1,$2,$3,1,50)`, [orderId, U.b, wallet]), "order_not_found");

// replacing an unpaid quote expires the old one
const pay2 = (await svc(`select * from create_payment($1,$2,$3,1.0,50.000000)`, [orderId, U.a, wallet])).rows[0];
ok("re-quote expires the previous unpaid payment", (await q(`select status from payments where public_id=$1`, [pay.public_id])).rows[0].status === "expired");
const pid = (await q(`select id from payments where public_id=$1`, [pay2.public_id])).rows[0].id;

// customers can read their own payment, not others'
ok("owner can read own payment + quote", (await as("authenticated", U.a, () => q(`select p.id from payments p join payment_quotes q on q.payment_id=p.id`))).rows.length >= 1);
ok("other customer cannot read it", (await as("authenticated", U.b, () => q(`select id from payments`))).rows.length === 0);
await throws("customer cannot mark own payment paid", () => as("authenticated", U.a, () => q(`update payments set status='approved'`)), "permission denied");
await throws("admin cannot bypass state machine with direct UPDATE", () => as("authenticated", U.admin, () => q(`update payments set status='approved'`)), "permission denied");

// state machine
await throws("cannot jump awaiting -> approved", () => svc(`select transition_payment($1,'approved',null,'x')`, [pid]), "invalid_transition");
for (const s of ["payment_detected", "blockchain_verified", "approved"]) await svc(`select transition_payment($1,$2,null,'t')`, [pid, s]);
ok("approval marks order paid", (await q(`select status from orders where id=$1`, [orderId])).rows[0].status === "paid");
await throws("cannot create a new quote while one is approved", () => svc(`select * from create_payment($1,$2,$3,1,50)`, [orderId, U.a, wallet]), "order_not_payable");
await throws("cannot go approved -> rejected", () => svc(`select transition_payment($1,'rejected',null,'x')`, [pid]), "invalid_transition");
ok("payment_events recorded full history", (await q(`select count(*)::int c from payment_events where payment_id=$1`, [pid])).rows[0].c === 4);

// tx replay protection
await q(`insert into blockchain_transactions (payment_id,network,tx_hash,amount_crypto) values ($1,'tron','abc',50)`, [pid]);
await throws("same tx hash cannot be reused", () => q(`insert into blockchain_transactions (payment_id,network,tx_hash,amount_crypto) values ($1,'tron','abc',50)`, [pid]), "blockchain_transactions_network_tx_hash_key");

// downloads: one grant per item, limited uses, peek does not consume
const item = (await q(`select id from order_items where order_id=$1`, [orderId])).rows[0].id;
await q(`insert into download_grants (order_item_id, token_hash, max_downloads, expires_at) values ($1,'h1',1, now()+interval '1 day')`, [item]);
await throws("only one grant per item", () => q(`insert into download_grants (order_item_id, token_hash) values ($1,'h2')`, [item]), "one_grant_per_item");
ok("peek shows 1 download left", (await svc(`select * from peek_download('h1')`)).rows[0].downloads_left === 1);
ok("peek twice does not consume", (await svc(`select * from peek_download('h1')`)).rows.length === 1);
ok("first consume returns the file path", (await svc(`select * from consume_download('h1')`)).rows[0].file_path === "tpl/v1.zip");
ok("second consume refused (limit 1)", (await svc(`select * from consume_download('h1')`)).rows.length === 0);
ok("unknown token yields nothing", (await svc(`select * from consume_download('nope')`)).rows.length === 0);
await throws("customer cannot call consume_download", () => as("authenticated", U.a, () => q(`select * from consume_download('h1')`)), "permission denied");
ok("customer cannot read download_grants", (await as("authenticated", U.a, () => q(`select * from download_grants`))).rows.length === 0);

// expired link
await q(`update download_grants set max_downloads=null, expires_at=now()-interval '1 minute'`);
ok("expired link refused", (await svc(`select * from consume_download('h1')`)).rows.length === 0);

// stale quote expiry job
const o2 = (await svc(`select create_order($1, array[$2::uuid]) as id`, [U.b, prod])).rows[0].id;
const p3 = (await svc(`select * from create_payment($1,$2,$3,1,50)`, [o2, U.b, wallet])).rows[0];
await q(`update payment_quotes set expires_at = now() - interval '2 hours' where payment_id = (select id from payments where public_id=$1)`, [p3.public_id]);
ok("expire_stale_payments expires it", Number((await svc(`select expire_stale_payments() as n`)).rows[0].n) === 1);

// store lock
await q(`update platform_subscription set expires_at = now() - interval '10 days'`);
ok("store_is_open false after expiry + grace", (await q(`select store_is_open() as o`)).rows[0].o === false);
ok("anon sees NO products when locked", (await as("anon", null, () => q(`select * from products`))).rows.length === 0);
await throws("create_order refused when locked", () => svc(`select create_order($1, array[$2::uuid])`, [U.b, prod]), "store_closed");
ok("customer cannot see own orders when locked", (await as("authenticated", U.a, () => q(`select * from orders`))).rows.length === 0);
await q(`update platform_subscription set expires_at = now() - interval '1 day', grace_days = 3`);
ok("inside grace period the store is still open", (await q(`select store_is_open() as o`)).rows[0].o === true);
await q(`update platform_subscription set maintenance_forced = true`);
ok("forced maintenance closes the store", (await q(`select store_is_open() as o`)).rows[0].o === false);


// ===== migration 0003 =====================================================================
await q(`update platform_subscription set maintenance_forced=false, expires_at=now()+interval '30 days'`);
ok("admin cannot touch wallets while the store is locked", (await (async () => { await q(`update platform_subscription set maintenance_forced=true`); const r = await as('authenticated', U.admin, () => q(`update payment_wallets set label='z'`)); await q(`update platform_subscription set maintenance_forced=false`); return r; })()).affectedRows === 0);
// Two-factor in RLS: admin/developer without AAL2 have NO powers
ok("admin WITHOUT aal2 cannot edit products", (await as("authenticated", U.admin, () => q(`update products set description='y'`), "aal1")).affectedRows === 0);
ok("admin WITHOUT aal2 cannot read all profiles", (await as("authenticated", U.admin, () => q(`select id from profiles`), "aal1")).rows.length === 1);
ok("developer WITHOUT aal2 cannot read subscription", (await as("authenticated", U.dev, () => q(`select * from platform_subscription`), "aal1")).rows.length === 0);
ok("developer WITHOUT aal2 cannot read audit log", (await as("authenticated", U.dev, () => q(`select * from audit_logs`), "aal1")).rows.length === 0);
ok("customers are unaffected by the aal rule (own orders still readable)", (await as("authenticated", U.a, () => q(`select id from profiles`), "aal1")).rows.length === 1);

// Wallet address validation + immutability
await throws("bad TRON address rejected", () => q(`insert into payment_wallets (asset,network,address) values ('USDT','tron','0x1234567890123456789012345678901234567890')`), "wallet_address_format");
await throws("bad ETH address rejected", () => q(`insert into payment_wallets (asset,network,address) values ('ETH','ethereum','not-an-address-not-an-address')`), "wallet_address_format");
await throws("bad BTC address rejected", () => q(`insert into payment_wallets (asset,network,address) values ('BTC','bitcoin','TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')`), "wallet_address_format");
ok("valid ETH address accepted", (await q(`insert into payment_wallets (asset,network,address) values ('ETH','ethereum','0xdAC17F958D2ee523a2206206994597C13D831ec7') returning id`)).rows.length === 1);
ok("valid BTC bech32 address accepted", (await q(`insert into payment_wallets (asset,network,address) values ('BTC','bitcoin','bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq') returning id`)).rows.length === 1);
await throws("wallet address cannot be edited in place (even by admin)", () => as("authenticated", U.admin, () => q(`update payment_wallets set address='TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7' where id=$1`, [wallet])), "wallet_immutable");
ok("admin CAN deactivate a wallet", (await as("authenticated", U.admin, () => q(`update payment_wallets set is_active=false, label='old' where id=$1`, [wallet]))).affectedRows === 1);
await q(`update payment_wallets set is_active=true where id=$1`, [wallet]);
await throws("a wallet that has payments cannot be deleted", () => as("authenticated", U.admin, () => q(`delete from payment_wallets where id=$1`, [wallet])), "violates foreign key");

// Avatars
const av = (await q(`insert into avatar_assets (name, svg_path) values ('A1','a1.svg') returning id`)).rows[0].id;
const avOff = (await q(`insert into avatar_assets (name, svg_path, status) values ('A2','a2.svg','archived') returning id`)).rows[0].id;
ok("verified customer CAN pick an active avatar", (await as("authenticated", U.a, () => q(`update profiles set avatar_id=$1 where id=$2`, [av, U.a]))).affectedRows === 1);
await throws("cannot pick an archived avatar", () => as("authenticated", U.a, () => q(`update profiles set avatar_id=$1 where id=$2`, [avOff, U.a])), "avatar_unavailable");
await q(`update auth.users set email_confirmed_at = null where id=$1`, [U.b]);
await throws("UNVERIFIED customer cannot pick an avatar", () => as("authenticated", U.b, () => q(`update profiles set avatar_id=$1 where id=$2`, [av, U.b])), "avatar_requires_verified_email");
await throws("customer cannot toggle reserved email_otp_2fa column", () => as("authenticated", U.a, () => q(`update profiles set email_otp_2fa=true where id=$1`, [U.a])), "permission denied");

// Storage
ok("4 buckets created; only product-files is private", (await q(`select count(*)::int c from storage.buckets where public = false`)).rows[0].c === 1 &&
   (await q(`select count(*)::int c from storage.buckets`)).rows[0].c === 4);
ok("avatar bucket only accepts SVG", (await q(`select allowed_mime_types from storage.buckets where id='avatar-assets'`)).rows[0].allowed_mime_types.join() === "image/svg+xml");
ok("admin CAN upload to product-files", (await as("authenticated", U.admin, () => q(`insert into storage.objects (bucket_id,name) values ('product-files','x/y.zip')`))).affectedRows === 1);
await throws("customer cannot upload to product-images", () => as("authenticated", U.a, () => q(`insert into storage.objects (bucket_id,name) values ('product-images','evil.png')`)), "row-level security");
ok("customer cannot list private product files", (await as("authenticated", U.a, () => q(`select * from storage.objects where bucket_id='product-files'`))).rows.length === 0);
await throws("developer cannot upload store media (admin-owned)", () => as("authenticated", U.dev, () => q(`insert into storage.objects (bucket_id,name) values ('store-assets','logo.png')`)), "row-level security");


// ===== migration 0004: analytics, developer helpers, publish guard, content ==================
await q(`update platform_subscription set maintenance_forced=false, expires_at=now()+interval '30 days', status='active'`);
const ov = async (uid, aal='aal2') => (await as("authenticated", uid, () => q(`select admin_overview() as o`), aal)).rows[0].o;
const o1 = await ov(U.admin);
ok("overview: revenue counts only approved orders ($50)", Number(o1.revenue_total) === 50 && Number(o1.revenue_30d) === 50 && Number(o1.orders_paid) === 1);
ok("overview: customers exclude admin and developer", Number(o1.customers) === 2);
ok("overview: orders_total counts every order", Number(o1.orders_total) >= 2);
ok("overview: the developer gets NO store numbers", Object.keys(await ov(U.dev)).length === 0);
ok("overview: customer gets nothing", Object.keys(await ov(U.a)).length === 0);
ok("overview: admin without TOTP gets nothing", Object.keys(await ov(U.admin, 'aal1')).length === 0);

const ser = (await as("authenticated", U.admin, () => q(`select * from admin_revenue_series(7)`))).rows;
ok("revenue series: 7 contiguous days, zero-filled", ser.length === 7 && ser.filter(r => Number(r.revenue) === 0).length === 6);
ok("revenue series: today holds the $50 order", Number(ser[ser.length - 1].revenue) === 50 && Number(ser[ser.length - 1].orders) === 1);
ok("revenue series: days clamp to 1..365", (await as("authenticated", U.admin, () => q(`select * from admin_revenue_series(0)`))).rows.length === 1 &&
   (await as("authenticated", U.admin, () => q(`select * from admin_revenue_series(100000)`))).rows.length === 365);
ok("revenue series: customer gets no rows", (await as("authenticated", U.a, () => q(`select * from admin_revenue_series(7)`))).rows.length === 0);

const grow = (await as("authenticated", U.admin, () => q(`select * from admin_customer_growth(7)`))).rows;
ok("customer growth: 7 days, 2 sign-ups today (admin/dev excluded)", grow.length === 7 && Number(grow[6].signups) === 2);

const top = (await as("authenticated", U.admin, () => q(`select * from admin_top_products(5)`))).rows;
ok("top products: one product, 1 unit, $50", top.length === 1 && top[0].name === "Template" && Number(top[0].units) === 1 && Number(top[0].revenue) === 50);
ok("top products: customer gets nothing", (await as("authenticated", U.a, () => q(`select * from admin_top_products(5)`))).rows.length === 0);

const cust = (await as("authenticated", U.admin, () => q(`select * from admin_customers(null, 25, 0)`))).rows;
ok("customers: lists only customers, with total_count", cust.length === 2 && Number(cust[0].total_count) === 2);
const ca = cust.find(r => r.id === U.a);
ok("customers: paid orders and spend are computed", Number(ca.orders_paid) === 1 && Number(ca.total_spent) === 50);
ok("customers: search by email substring", (await as("authenticated", U.admin, () => q(`select * from admin_customers('A@EXAMPLE', 25, 0)`))).rows.length === 1);
ok("customers: LIKE wildcards are treated literally", (await as("authenticated", U.admin, () => q(`select * from admin_customers('%', 25, 0)`))).rows.length === 0);
ok("customers: paging works", (await as("authenticated", U.admin, () => q(`select * from admin_customers(null, 1, 1)`))).rows.length === 1);
ok("customers: a customer cannot list customers", (await as("authenticated", U.a, () => q(`select * from admin_customers(null, 25, 0)`))).rows.length === 0);

const act = (await as("authenticated", U.admin, () => q(`select * from admin_payment_activity()`))).rows;
ok("payment activity: counts payments per status", act.length >= 2 && act.some(r => r.status === 'approved' && Number(r.n) === 1) && act.some(r => r.status === 'expired'));
ok("payment activity: customer gets nothing", (await as("authenticated", U.a, () => q(`select * from admin_payment_activity()`))).rows.length === 0);

const nt = async (uid, aal='aal2') => (await as("authenticated", uid, () => q(`select store_notice() as n`), aal)).rows[0].n;
const n1 = await nt(U.admin);
ok("store_notice: admin sees days left but no fee/notes", n1 && Number(n1.days_left) >= 29 && !("monthly_fee_usd" in n1) && !("note" in n1));
ok("store_notice: customer gets null", (await nt(U.a)) === null);
ok("store_notice: admin without TOTP gets null", (await nt(U.admin, 'aal1')) === null);

const ex = async (uid, days, aal='aal2') => (await as("authenticated", uid, () => q(`select dev_extend_subscription($1) as e`, [days]), aal)).rows[0].e;
const before = new Date((await q(`select expires_at from platform_subscription`)).rows[0].expires_at);
const after = new Date(await ex(U.dev, 30));
ok("extend: adds 30 days to a running subscription", Math.abs((after - before) / 86400000 - 30) < 0.01);
ok("extend: admin cannot extend (returns null, nothing changes)", (await ex(U.admin, 30)) === null &&
   Math.abs(new Date((await q(`select expires_at from platform_subscription`)).rows[0].expires_at) - after) < 1000);
ok("extend: developer without TOTP cannot extend", (await ex(U.dev, 30, 'aal1')) === null);
await throws("extend: rejects 0 and 400 days", async () => { await ex(U.dev, 0); }, "invalid_days");
await throws("extend: rejects 400 days", async () => { await ex(U.dev, 400); }, "invalid_days");
await q(`update platform_subscription set expires_at = now() - interval '20 days', status='suspended'`);
const lapsed = new Date(await ex(U.dev, 30));
ok("extend: a lapsed store gets a full 30 days from now, and reactivates", Math.abs((lapsed - Date.now()) / 86400000 - 30) < 0.01 &&
   (await q(`select status from platform_subscription`)).rows[0].status === 'active' && (await q(`select store_is_open() o`)).rows[0].o === true);

// publish guard
await throws("cannot publish a product that has no file", () => q(`insert into products (slug,name,price_usd,status) values ('nofile','No file',5,'active')`), "product_needs_file");
const d2 = (await q(`insert into products (slug,name,price_usd,status) values ('d2','Draft two',5,'draft') returning id`)).rows[0].id;
await throws("cannot activate a draft that has no file", () => q(`update products set status='active' where id=$1`, [d2]), "product_needs_file");
await throws("cannot delete the file of a published product", () => q(`delete from product_files where product_id=$1`, [prod]), "cannot_remove_file");
ok("a published product's file CAN be replaced in place", (await q(`update product_files set path='tpl/v2.zip', version=2 where product_id=$1`, [prod])).affectedRows === 1);
await q(`update products set status='archived' where id=$1`, [prod]);
ok("after archiving, the file can be removed", (await q(`delete from product_files where product_id=$1`, [prod])).affectedRows === 1);
await throws("and the archived product cannot be re-published without a file", () => q(`update products set status='active' where id=$1`, [prod]), "product_needs_file");

// seeded legal content
ok("7 starter legal documents are seeded", (await q(`select count(*)::int c from legal_documents`)).rows[0].c === 7);
ok("terms template states all sales are final", (await q(`select body_md from legal_documents where slug='terms'`)).rows[0].body_md.includes("ALL SALES ARE FINAL"));
ok("anyone can read legal pages", (await as("anon", null, () => q(`select slug from legal_documents`))).rows.length === 7);
ok("anon cannot edit legal pages", (await as("anon", null, () => q(`update legal_documents set body_md='x'`))).affectedRows === 0);
ok("developer cannot edit legal pages (admin-owned)", (await as("authenticated", U.dev, () => q(`update legal_documents set body_md='x'`))).affectedRows === 0);
ok("admin CAN edit legal pages", (await as("authenticated", U.admin, () => q(`update legal_documents set title='Terms & Conditions' where slug='terms'`))).affectedRows === 1);
ok("heartbeat column exists and is empty to start", (await q(`select last_cron_at from platform_settings`)).rows[0].last_cron_at === null);


// --- email-code 2FA + rate limiting (0005) -----------------------------------------
const issue = async (u, purpose, hash, cool = 30) => (await svc(`select otp_issue($1,$2,$3,600,$4) r`, [u, purpose, hash, cool])).rows[0].r;
const verify = async (u, purpose, hash) => (await svc(`select otp_verify($1,$2,$3,5) r`, [u, purpose, hash])).rows[0].r;

ok("first code is issued", (await issue(U.a, "login", "h1")) === true);
ok("a second request inside the cooldown is refused (no email spam)", (await issue(U.a, "login", "h2")) === false);
ok("a wrong guess is 'wrong'", (await verify(U.a, "login", "nope")) === "wrong");
ok("the right code works", (await verify(U.a, "login", "h1")) === "ok");
ok("and works only once", (await verify(U.a, "login", "h1")) === "none");

await issue(U.a, "login", "h3", 0);
await issue(U.a, "login", "h4", 0);
ok("a newer code voids the older one", (await verify(U.a, "login", "h3")) === "wrong");
ok("the newest code still works after one wrong guess", (await verify(U.a, "login", "h4")) === "ok");

await issue(U.b, "login", "good", 0);
for (let i = 0; i < 4; i++) await verify(U.b, "login", "bad" + i);
ok("the 5th wrong guess locks the code", (await verify(U.b, "login", "bad5")) === "locked");
ok("a locked code cannot be used even with the right value", (await verify(U.b, "login", "good")) === "locked");
ok("and once spent, there is nothing left to guess", (await verify(U.b, "login", "good")) === "none");

await issue(U.b, "login", "old", 0);
await svc(`update email_otp_challenges set expires_at = now() - interval '1 minute' where user_id=$1 and consumed_at is null`, [U.b]);
ok("an expired code is reported as expired", (await verify(U.b, "login", "old")) === "expired");

await issue(U.a, "enable", "e1", 0);
ok("a code for one purpose cannot be used for another", (await verify(U.a, "login", "e1")) === "none");
ok("it works for its own purpose", (await verify(U.a, "enable", "e1")) === "ok");

ok("the plain code is never stored (only the hash we gave it)", (await svc(`select count(*)::int c from email_otp_challenges where code_hash ~ '^[0-9]{6}$'`)).rows[0].c === 0);

// who can touch these
await throws("customers cannot read email_otp_challenges", () => as("authenticated", U.a, () => q(`select * from email_otp_challenges`)), "permission denied");
await throws("customers cannot call otp_verify", () => as("authenticated", U.a, () => q(`select otp_verify($1,'login','x',5)`, [U.a])), "permission denied");
await throws("customers cannot call otp_issue", () => as("authenticated", U.a, () => q(`select otp_issue($1,'login','x',600,0)`, [U.a])), "permission denied");
await throws("anon cannot call rate_limit_hit", () => as("anon", null, () => q(`select * from rate_limit_hit('k',1,60)`)), "permission denied");
await throws("customers cannot read rate_limits", () => as("authenticated", U.a, () => q(`select * from rate_limits`)), "permission denied");
await throws("customers still cannot flip email_otp_2fa themselves", () => as("authenticated", U.a, () => q(`update profiles set email_otp_2fa=false where id=$1`, [U.a])), "permission denied");
await svc(`select otp_set_enabled($1,true)`, [U.a]);
ok("the server can turn email 2FA on after a verified code", (await q(`select email_otp_2fa f from profiles where id=$1`, [U.a])).rows[0].f === true);
await svc(`select otp_set_enabled($1,false)`, [U.a]);
ok("and off again", (await q(`select email_otp_2fa f from profiles where id=$1`, [U.a])).rows[0].f === false);

// rate limiter
const hit = async (k, lim = 3, win = 3600) => (await svc(`select * from rate_limit_hit($1,$2,$3)`, [k, lim, win])).rows[0];
const r1 = await hit("t1"), r2 = await hit("t1"), r3 = await hit("t1"), r4 = await hit("t1");
ok("hits up to the limit are allowed", r1.allowed && r2.allowed && r3.allowed);
ok("the next hit is blocked with a retry time", r4.allowed === false && r4.retry_after >= 1 && r4.retry_after <= 3600);
ok("keys are independent", (await hit("t2")).allowed === true);
await svc(`update rate_limits set window_start = window_start - interval '2 hours' where key='t1'`);
ok("the limit resets in the next window", (await hit("t1")).allowed === true);



// --- role separation (0007): the developer is not store staff, the admin is not platform staff -------
// the one-admin / one-developer indexes already block a second holder; the new index is what stops ONE account holding BOTH.
// Free each slot first so that only the new rule can fire.
await q(`delete from user_roles where role='developer'`);
await throws("one account cannot hold both: the admin cannot also become developer", () => q(`insert into user_roles values ($1,'developer')`, [U.admin]), "one_privileged_role_per_user");
await q(`insert into user_roles values ($1,'developer')`, [U.dev]);
await q(`delete from user_roles where role='admin'`);
await throws("... and the developer cannot also become admin", () => q(`insert into user_roles values ($1,'admin')`, [U.dev]), "one_privileged_role_per_user");
await q(`insert into user_roles values ($1,'admin')`, [U.admin]);
ok("a customer role can still sit alongside (customers are not privileged)", (await q(`insert into user_roles values ($1,'customer') on conflict do nothing`, [U.admin])).affectedRows >= 0);
for (const [t, label] of [["orders","orders"],["order_items","order items"],["payments","payments"],["payment_quotes","payment quotes"],["blockchain_transactions","chain transactions"],["payment_events","payment events"],["email_events","email log"],["payment_wallets","wallets"],["product_files","product files"]]) {
  ok(`developer cannot read ${label}`, (await as("authenticated", U.dev, () => q(`select * from ${t}`))).rows.length === 0);
}
ok("developer cannot read customer profiles", (await as("authenticated", U.dev, () => q(`select id from profiles where id <> $1`, [U.dev]))).rows.length === 0);
ok("developer cannot see draft or archived products", (await as("authenticated", U.dev, () => q(`select id from products where status <> 'active'`))).rows.length === 0);
ok("developer cannot edit categories", (await as("authenticated", U.dev, () => q(`update categories set name='x'`))).affectedRows === 0);
ok("developer cannot edit avatars", (await as("authenticated", U.dev, () => q(`update avatar_assets set status='archived'`))).affectedRows === 0);
await throws("developer cannot approve payments through the database", () => as("authenticated", U.dev, () => q(`update payments set status='approved' where status='admin_review'`)), "permission denied");
ok("store_notice is for the admin only (developer gets nothing)", (await as("authenticated", U.dev, () => q(`select store_notice() n`))).rows[0].n === null);
ok("store_notice works for the admin", (await as("authenticated", U.admin, () => q(`select store_notice() n`))).rows[0].n !== null);

const health = async (u, aal) => (await as("authenticated", u, () => q(`select dev_health() h`), aal)).rows[0].h;
const hd = await health(U.dev);
ok("developer gets health counts, and only counts", hd && ["failed_emails_24h","stuck_approved","in_review","awaiting_payment"].every(k => typeof hd[k] === "number") && Object.keys(hd).length === 4);
ok("admin gets nothing from dev_health", (await health(U.admin)) === null);
ok("customers get nothing from dev_health", (await health(U.a)) === null);
ok("developer WITHOUT TOTP gets nothing from dev_health", (await health(U.dev, "aal1")) === null);
await throws("anon cannot call dev_health", () => as("anon", null, () => q(`select dev_health()`)), "permission denied");

await q(`insert into audit_logs (action, resource_type, resource_id) values ('UPDATE','platform_subscription','x'), ('UPDATE','payment_wallets','y')`);
const seen = async (u) => (await as("authenticated", u, () => q(`select resource_type from audit_logs`))).rows.map(r => r.resource_type);
const adminSees = await seen(U.admin), devSees = await seen(U.dev);
ok("admin's audit log hides platform/subscription changes", !adminSees.includes("platform_subscription") && adminSees.includes("payment_wallets"));
ok("developer's audit log shows only platform changes", devSees.includes("platform_subscription") && devSees.every(t => ["platform_subscription","platform_settings","feature_flags","user_roles"].includes(t)));
ok("the developer can still run the platform (read + extend subscription)", (await as("authenticated", U.dev, () => q(`select * from platform_subscription`))).rows.length === 1);


// --- optional read-only support view for the developer (0008) ------------------------------------
const devReads = async (aal = "aal2") => ({
  orders: (await as("authenticated", U.dev, () => q(`select id from orders`), aal)).rows.length,
  payments: (await as("authenticated", U.dev, () => q(`select id from payments`), aal)).rows.length,
  profiles: (await as("authenticated", U.dev, () => q(`select id from profiles where id <> $1`, [U.dev]), aal)).rows.length,
  wallets: (await as("authenticated", U.dev, () => q(`select id from payment_wallets`), aal)).rows.length,
  drafts: (await as("authenticated", U.dev, () => q(`select id from products where status <> 'active'`), aal)).rows.length,
});
ok("switch defaults to OFF", (await q(`select developer_support_access f from store_settings`)).rows[0].f === false);
const off = await devReads();
ok("OFF: developer reads nothing from the store", Object.values(off).every(n => n === 0));

ok("developer cannot switch it on", (await as("authenticated", U.dev, () => q(`update store_settings set developer_support_access=true`))).affectedRows === 0);
await throws("customer cannot switch it on", async () => { const r = await as("authenticated", U.a, () => q(`update store_settings set developer_support_access=true`)); if (r.affectedRows === 0) throw new Error("denied"); }, "denied");
ok("admin switches it on", (await as("authenticated", U.admin, () => q(`update store_settings set developer_support_access=true`))).affectedRows === 1);

const on = await devReads();
ok("ON: developer can read orders, payments, customers, wallets and drafts", on.orders > 0 && on.payments > 0 && on.profiles > 0 && on.wallets > 0 && on.drafts > 0);
ok("ON: developer sees the dashboard numbers", Number((await as("authenticated", U.dev, () => q(`select admin_overview() o`))).rows[0].o.revenue_total) >= 0 && Object.keys((await as("authenticated", U.dev, () => q(`select admin_overview() o`))).rows[0].o).length > 0);
ok("ON: developer sees store audit rows and platform audit rows", (await seen(U.dev)).includes("payment_wallets") && (await seen(U.dev)).includes("platform_subscription"));
ok("ON: admin still does NOT see platform audit rows", !(await seen(U.admin)).includes("platform_subscription"));

// ... but strictly read-only
ok("ON: developer cannot edit products", (await as("authenticated", U.dev, () => q(`update products set name='hacked'`))).affectedRows === 0);
ok("ON: developer cannot edit store settings or flip the switch", (await as("authenticated", U.dev, () => q(`update store_settings set store_name='hacked', developer_support_access=false`))).affectedRows === 0);
ok("ON: developer cannot edit categories, avatars or legal pages", (await as("authenticated", U.dev, () => q(`update categories set name='x'`))).affectedRows === 0 && (await as("authenticated", U.dev, () => q(`update avatar_assets set status='archived'`))).affectedRows === 0 && (await as("authenticated", U.dev, () => q(`update legal_documents set body_md='x'`))).affectedRows === 0);
await throws("ON: developer cannot add a wallet", () => as("authenticated", U.dev, () => q(`insert into payment_wallets (asset,network,address) values ('USDT','tron','TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')`)), "row-level security");
await throws("ON: developer cannot approve payments", () => as("authenticated", U.dev, () => q(`update payments set status='approved'`)), "permission denied");
await throws("ON: developer cannot add avatars", () => as("authenticated", U.dev, () => q(`insert into avatar_assets (name, svg_path) values ('x','x.svg')`)), "row-level security");
ok("ON: developer WITHOUT TOTP still sees nothing", Object.values(await devReads("aal1")).every(n => n === 0));
ok("ON: an ordinary customer still sees only their own orders", (await as("authenticated", U.b, () => q(`select customer_id from orders`))).rows.every(r => r.customer_id === U.b));
ok("the switch change was written to the audit log", (await q(`select count(*)::int c from audit_logs where resource_type='store_settings'`)).rows[0].c >= 1);

ok("admin switches it off again", (await as("authenticated", U.admin, () => q(`update store_settings set developer_support_access=false`))).affectedRows === 1);
ok("OFF again: developer loses access immediately", Object.values(await devReads()).every(n => n === 0));

// --- SQL-injection hygiene (database side) ------------------------------------------------------
const noPath = (await q(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')`)).rows.map(r => r.proname);
ok("every SECURITY DEFINER function pins its search_path" + (noPath.length ? ` (missing: ${noPath.join(", ")})` : ""), noPath.length === 0);
const dyn = (await q(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.prosrc ~* '\\mexecute\\M'`)).rows.map(r => r.proname);
ok("no database function builds dynamic SQL (EXECUTE)" + (dyn.length ? ` (found: ${dyn.join(", ")})` : ""), dyn.length === 0);

// --- coverage: every public table must have RLS on ---------------------------------
const noRls = (await q(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity order by 1`)).rows.map(r => r.relname);
ok("every public table has RLS enabled" + (noRls.length ? ` (missing: ${noRls.join(", ")})` : ""), noRls.length === 0);
const noPolicy = (await q(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity and not exists (select 1 from pg_policy p where p.polrelid=c.oid) order by 1`)).rows.map(r => r.relname);
console.log("RLS on, no policies (service-role only):", noPolicy.join(", ") || "none");
const anonWrite = (await q(`select table_name, privilege_type from information_schema.role_table_grants where table_schema='public' and grantee='anon' and privilege_type in ('INSERT','UPDATE','DELETE') order by 1`)).rows;
console.log("anon write grants (RLS still gates these):", anonWrite.length);


// --- regression: sign-up must not depend on pgcrypto being on the search path ----------
// (on Supabase pgcrypto lives in the "extensions" schema; the sign-up trigger runs with search_path=public)
await db.exec(`drop extension pgcrypto cascade`);
const rh = (await q(`select rand_hex(8) a, rand_hex(5) b`)).rows[0];
ok("rand_hex works without pgcrypto and returns the right length/charset", /^[0-9A-F]{8}$/.test(rh.a) && /^[0-9A-F]{5}$/.test(rh.b));
await q(`insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000c1','new@example.com','{"full_name":"New Person"}')`);
ok("sign-up still creates a profile with a USR- id when pgcrypto is unavailable", /^USR-[0-9A-F]{8}$/.test((await q(`select public_id from profiles where email='new@example.com'`)).rows[0]?.public_id ?? ""));

// audit trail
ok("audit log captured sensitive changes", (await q(`select count(*)::int c from audit_logs`)).rows[0].c > 0);
ok("customer cannot read audit log", (await as("authenticated", U.a, () => q(`select * from audit_logs`))).rows.length === 0);

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
