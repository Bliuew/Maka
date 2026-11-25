import { fail } from '../http.js';
import { id, now } from '../db.js';
import { screenText } from '../safety.js';

const FORBIDDEN_CAMPAIGN_KEYS = /follower|tier|nano|micro|macro|mega|audience_?size|min_?reach/i;

export function registerCommerce(r, ctx) {
  const { q, config, mapAsync } = ctx;

  const ownBusiness = async (bid, user) => (await q.get('SELECT * FROM businesses WHERE id=? AND owner_id=?', bid, user.id)) || fail(404, 'business_not_found');
  const serBiz = (b) => ({ id: b.id, name: b.name, category: b.category, description: b.description, website: b.website,
    verification: b.verification, isSample: !!b.is_sample });
  const serCampaign = async (c, user) => {
    const b = await q.get('SELECT * FROM businesses WHERE id=?', c.business_id);
    const app = await q.get('SELECT id,status FROM applications WHERE campaign_id=? AND creator_id=?', c.id, user.id);
    return { id: c.id, title: c.title, category: c.category, brief: c.brief, deliverables: c.deliverables,
      compensationCents: c.compensation_cents, currency: c.currency, disclosure: c.disclosure, status: c.status,
      deadline: c.deadline, imageUrl: await ctx.assetUrl(c.image), isSample: !!c.is_sample, business: serBiz(b),
      eligibility: 'Open to every 19+ verified creator in good standing. No follower minimum. No tiers.',
      myApplication: app || null };
  };

  // ---------------- businesses ----------------
  r.post('/api/businesses', {}, async ({ user, body }) => {
    ctx.requireWrite(user);
    const b = await body();
    const name = String(b.name || '').trim().slice(0, 80);
    if (!name || !b.category) fail(400, 'invalid_business', 'Name and category are required.');
    if (!b.registrationRef) fail(400, 'registration_required', 'Provide a business registration or tax number for verification.');
    const bid = id('b_');
    await q.run('INSERT INTO businesses (id,owner_id,name,category,description,website,registration_ref,created_at) VALUES (?,?,?,?,?,?,?,?)',
      bid, user.id, name, String(b.category).slice(0, 40), String(b.description || '').slice(0, 1000), b.website ? String(b.website).slice(0, 200) : null, String(b.registrationRef).slice(0, 80), now());
    return { ...serBiz(await q.get('SELECT * FROM businesses WHERE id=?', bid)), message: 'Submitted for verification. Campaigns and storefront unlock once a reviewer verifies your business.' };
  });
  r.get('/api/me/businesses', {}, async ({ user }) => (await q.all('SELECT * FROM businesses WHERE owner_id=?', user.id)).map(serBiz));

  // ---------------- collaborations ----------------
  r.get('/api/campaigns', {}, async ({ user, query }) => {
    const cat = query.get('category');
    const rows = await q.all(`SELECT c.* FROM campaigns c JOIN businesses b ON b.id=c.business_id WHERE c.status='open' AND b.verification='verified'
      ${cat ? 'AND c.category=?' : ''} ORDER BY c.created_at DESC`, ...(cat ? [cat] : []));
    return { items: await mapAsync(rows, (c) => serCampaign(c, user)), categories: (await q.all("SELECT DISTINCT category FROM campaigns WHERE status='open' ORDER BY category")).map((x) => x.category) };
  });
  r.get('/api/campaigns/:id', {}, async ({ user, params }) => serCampaign((await q.get('SELECT * FROM campaigns WHERE id=?', params.id)) || fail(404, 'campaign_not_found'), user));

  r.post('/api/businesses/:id/campaigns', {}, async ({ user, params, body }) => {
    const biz = await ownBusiness(params.id, user);
    if (biz.verification !== 'verified') fail(403, 'business_not_verified', 'Your business must be verified before posting campaigns.');
    const b = await body();
    const bad = Object.keys(b).find((k) => FORBIDDEN_CAMPAIGN_KEYS.test(k));
    if (bad) fail(400, 'follower_criteria_not_allowed', 'Mäka campaigns cannot require follower counts or creator tiers. Select on fit, quality and reliability instead.');
    if (/\b(min(imum)?\s*\d+[km]?\s*followers?|\d+[km]?\+?\s*followers?\s*(required|minimum|only))\b/i.test(String(b.brief || '') + ' ' + String(b.deliverables || '')))
      fail(400, 'follower_criteria_not_allowed', 'Remove follower-count requirements from the brief.');
    const cents = Math.round(Number(b.compensationCents));
    if (!b.title || !b.brief || !b.deliverables || !(cents > 0)) fail(400, 'invalid_campaign', 'Title, brief, deliverables and paid compensation are required.');
    const cid = id('cp_');
    await q.run('INSERT INTO campaigns (id,business_id,title,category,brief,deliverables,compensation_cents,currency,disclosure,deadline,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      cid, biz.id, String(b.title).slice(0, 100), String(b.category || biz.category), String(b.brief).slice(0, 4000), String(b.deliverables).slice(0, 1000),
      cents, String(b.currency || 'CAD'), String(b.disclosure || '#PaidPartnership'), b.deadline ? Date.parse(b.deadline) : null, now());
    await ctx.audit(user.id, 'campaign_create', 'campaign', cid, {});
    return serCampaign(await q.get('SELECT * FROM campaigns WHERE id=?', cid), user);
  });

  r.post('/api/campaigns/:id/apply', {}, async ({ user, params, body }) => {
    ctx.requireWrite(user);
    const c = (await q.get('SELECT * FROM campaigns WHERE id=?', params.id)) || fail(404, 'campaign_not_found');
    if (c.status !== 'open') fail(409, 'campaign_closed');
    const biz = await q.get('SELECT * FROM businesses WHERE id=?', c.business_id);
    if (biz.owner_id === user.id) fail(400, 'own_campaign');
    if (await ctx.isBlockedEitherWay(user.id, biz.owner_id)) fail(403, 'blocked');
    // Eligibility = verified 19+ (enforced by gate) + good standing. Follower count is never consulted.
    const b = await body();
    const pitch = String(b.pitch || '').trim();
    if (pitch.length < 20) fail(400, 'pitch_too_short', 'Tell the brand about your idea in at least 20 characters.');
    if (screenText(pitch).action === 'hold') fail(400, 'pitch_not_allowed');
    if (b.portfolioPostId && !await q.get("SELECT 1 FROM posts WHERE id=? AND author_id=? AND status='published'", b.portfolioPostId, user.id)) fail(400, 'invalid_portfolio_post');
    if (await q.get('SELECT 1 FROM applications WHERE campaign_id=? AND creator_id=?', c.id, user.id)) fail(409, 'already_applied');
    const owner = await q.get('SELECT * FROM users WHERE id=?', biz.owner_id);
    const cid = await ctx.openConversation(user, [owner], `${c.title} · application`);
    const aid = id('ap_');
    await q.run('INSERT INTO applications (id,campaign_id,creator_id,pitch,portfolio_post_id,conversation_id,created_at) VALUES (?,?,?,?,?,?,?)', aid, c.id, user.id, pitch.slice(0, 3000), b.portfolioPostId || null, cid, now());
    await ctx.postMessage(cid, user, `Application for “${c.title}”: ${pitch.slice(0, 500)}`);
    await ctx.notify(owner.id, 'application', user.id, 'campaign', c.id, `@${user.handle} applied to ${c.title}`);
    return { applicationId: aid, status: 'submitted', conversationId: cid };
  });

  r.get('/api/me/applications', {}, async ({ user }) => mapAsync(await q.all('SELECT a.*, c.title FROM applications a JOIN campaigns c ON c.id=a.campaign_id WHERE a.creator_id=? ORDER BY a.created_at DESC', user.id),
    async (a) => ({ id: a.id, campaignId: a.campaign_id, title: a.title, status: a.status, conversationId: a.conversation_id, createdAt: a.created_at,
      contract: (await q.get('SELECT id,status,amount_cents "amountCents",currency FROM contracts WHERE application_id=?', a.id)) || null })));

  // Business view of applicants: ordered by submission time, with objective
  // signals (pitch, portfolio, completed collaborations). Not sortable by followers.
  r.get('/api/businesses/:id/applications', {}, async ({ user, params }) => {
    const biz = await ownBusiness(params.id, user);
    return mapAsync(await q.all('SELECT a.*, c.title FROM applications a JOIN campaigns c ON c.id=a.campaign_id WHERE c.business_id=? ORDER BY a.created_at ASC', biz.id), async (a) => ({
      id: a.id, campaign: a.title, status: a.status, pitch: a.pitch, conversationId: a.conversation_id,
      portfolio: a.portfolio_post_id ? await ctx.serializePost(await q.get('SELECT * FROM posts WHERE id=?', a.portfolio_post_id), user.id) : null,
      creator: await ctx.publicUser(await q.get('SELECT * FROM users WHERE id=?', a.creator_id), user.id),
      completedCollaborations: (await q.get("SELECT COUNT(*) n FROM contracts k JOIN applications x ON x.id=k.application_id WHERE x.creator_id=? AND k.status IN ('approved','payout_pending','paid')", a.creator_id)).n,
    }));
  });

  r.post('/api/applications/:id/decision', {}, async ({ user, params, body }) => {
    const a = (await q.get('SELECT a.*, c.business_id, c.compensation_cents, c.currency, c.title, c.deliverables, c.disclosure FROM applications a JOIN campaigns c ON c.id=a.campaign_id WHERE a.id=?', params.id)) || fail(404, 'not_found');
    await ownBusiness(a.business_id, user);
    const { status } = await body();
    if (!['shortlisted', 'accepted', 'declined'].includes(status)) fail(400, 'invalid_status');
    await q.run('UPDATE applications SET status=? WHERE id=?', status, a.id);
    let contractId = null;
    if (status === 'accepted' && !await q.get('SELECT 1 FROM contracts WHERE application_id=?', a.id)) {
      contractId = id('k_');
      await q.run('INSERT INTO contracts (id,application_id,amount_cents,currency,terms,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', contractId, a.id, a.compensation_cents, a.currency,
        `Deliverables: ${a.deliverables}\nDisclosure required: ${a.disclosure}\nCreator keeps ownership of original content; brand receives the usage licence described in the brief.`, 'offered', now(), now());
    }
    await ctx.notify(a.creator_id, 'application_' + status, user.id, 'application', a.id, `Your application to ${a.title} was ${status}`);
    await ctx.audit(user.id, 'application_' + status, 'application', a.id, {});
    return { status, contractId };
  });

  // Contract lifecycle. Money movement requires a payment provider.
  const transitions = { sign: ['offered', 'signed', 'creator'], deliver: ['signed', 'delivered', 'creator'], approve: ['delivered', 'approved', 'business'], dispute: [null, 'disputed', 'either'] };
  r.post('/api/contracts/:id/:action', {}, async ({ user, params }) => {
    const t = transitions[params.action] || fail(404, 'not_found');
    const k = (await q.get('SELECT k.*, a.creator_id, c.business_id FROM contracts k JOIN applications a ON a.id=k.application_id JOIN campaigns c ON c.id=a.campaign_id WHERE k.id=?', params.id)) || fail(404, 'not_found');
    const biz = await q.get('SELECT * FROM businesses WHERE id=?', k.business_id);
    const role = user.id === k.creator_id ? 'creator' : user.id === biz.owner_id ? 'business' : null;
    if (!role || (t[2] !== 'either' && t[2] !== role)) fail(403, 'forbidden');
    if (t[0] && k.status !== t[0]) fail(409, 'invalid_state', `Contract is ${k.status}.`);
    let next = t[1];
    await q.tx(async () => {
      if (next === 'approved') {
        // Record real earned revenue. It becomes available once the business's payment clears.
        await q.run('INSERT INTO earnings (id,user_id,source,ref_id,amount_cents,currency,status,created_at) VALUES (?,?,?,?,?,?,?,?)', id('e_'), k.creator_id, 'collab', k.id, k.amount_cents, k.currency, 'pending', now());
        next = 'payout_pending';
      }
      await q.run('UPDATE contracts SET status=?, updated_at=? WHERE id=?', next, now(), k.id);
      await ctx.audit(user.id, 'contract_' + params.action, 'contract', k.id, {});
    });
    return { status: next, paymentsConfigured: !!config.paymentsProvider,
      note: next === 'payout_pending' && !config.paymentsProvider ? 'Approved. Funds move once a payment provider (e.g. Stripe Connect) is connected.' : null };
  });

  // ---------------- marketplace ----------------
  const serProduct = async (p) => ({ id: p.id, businessId: p.business_id, name: p.name, description: p.description, priceCents: p.price_cents,
    currency: p.currency, imageUrl: await ctx.assetUrl(p.image), inStock: p.stock > 0, stock: p.stock, isSample: !!p.is_sample });

  r.get('/api/market/businesses', {}, async ({ query }) => {
    const term = (query.get('q') || '').toLowerCase(), cat = query.get('category');
    let rows = await q.all(`SELECT b.*, (SELECT string_agg(name, ' ') FROM products WHERE business_id=b.id) product_names
      FROM businesses b WHERE verification='verified' ORDER BY name`);
    if (cat) rows = rows.filter((b) => b.category === cat);
    if (term) rows = rows.filter((b) => (b.name + ' ' + b.category + ' ' + b.description + ' ' + (b.product_names || '')).toLowerCase().includes(term));
    return { items: await mapAsync(rows, async (b) => ({ ...serBiz(b), coverUrl: await ctx.assetUrl((await q.get('SELECT image FROM products WHERE business_id=? AND active=1 ORDER BY created_at LIMIT 1', b.id))?.image),
      productCount: (await q.get('SELECT COUNT(*) n FROM products WHERE business_id=? AND active=1', b.id)).n })),
      categories: (await q.all("SELECT DISTINCT category FROM businesses WHERE verification='verified' ORDER BY category")).map((x) => x.category) };
  });
  // Product feed across verified stores (newest first), with category and search.
  r.get('/api/market/products', {}, async ({ query }) => {
    const term = String(query.get('q') || '').trim().toLowerCase(), cat = query.get('category') || '';
    let rows = await q.all(`SELECT p.*, b.name business, b.category FROM products p JOIN businesses b ON b.id=p.business_id
      WHERE p.active=1 AND b.verification='verified' ORDER BY p.created_at DESC LIMIT 200`);
    if (cat) rows = rows.filter((p) => p.category === cat);
    if (term) rows = rows.filter((p) => (p.name + ' ' + p.description + ' ' + p.business + ' ' + p.category).toLowerCase().includes(term));
    return {
      items: await mapAsync(rows, async (p) => ({ ...(await serProduct(p)), business: p.business, category: p.category })),
      categories: (await q.all("SELECT DISTINCT category FROM businesses WHERE verification='verified' ORDER BY category")).map((x) => x.category),
    };
  });
  r.get('/api/market/businesses/:id', {}, async ({ params }) => {
    const b = (await q.get("SELECT * FROM businesses WHERE id=? AND verification='verified'", params.id)) || fail(404, 'store_not_found');
    return { business: serBiz(b), products: await mapAsync(await q.all('SELECT * FROM products WHERE business_id=? AND active=1 ORDER BY created_at', b.id), serProduct) };
  });
  r.post('/api/businesses/:id/products', {}, async ({ user, params, body }) => {
    const biz = await ownBusiness(params.id, user);
    if (biz.verification !== 'verified') fail(403, 'business_not_verified');
    const b = await body();
    const cents = Math.round(Number(b.priceCents));
    if (!b.name || !(cents >= 0)) fail(400, 'invalid_product');
    if (b.imageMediaId && !await q.get("SELECT 1 FROM media WHERE id=? AND owner_id=? AND kind='image'", b.imageMediaId, user.id)) fail(400, 'invalid_media');
    const pid = id('pr_');
    await q.run('INSERT INTO products (id,business_id,name,description,price_cents,currency,image,stock,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      pid, biz.id, String(b.name).slice(0, 100), String(b.description || '').slice(0, 2000), cents, String(b.currency || 'CAD'), b.imageMediaId || null, Math.max(0, Number(b.stock) | 0), now());
    return serProduct(await q.get('SELECT * FROM products WHERE id=?', pid));
  });

  r.post('/api/orders', {}, async ({ user, body }) => {
    const b = await body();
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) fail(400, 'empty_cart');
    const biz = (await q.get("SELECT * FROM businesses WHERE id=? AND verification='verified'", b.businessId)) || fail(404, 'store_not_found');
    let total = 0, currency = null;
    const lines = [];
    for (const it of items) {
      const p = (await q.get('SELECT * FROM products WHERE id=? AND business_id=? AND active=1', it.productId, biz.id)) || fail(400, 'invalid_product');
      const qty = Math.floor(Number(it.qty));
      if (!(qty >= 1 && qty <= 20)) fail(400, 'invalid_quantity');
      if (p.stock < qty) fail(409, 'out_of_stock', `${p.name} is out of stock.`);
      if (currency && currency !== p.currency) fail(400, 'mixed_currency');
      currency = p.currency; total += p.price_cents * qty; // prices always computed server-side
      lines.push({ p, qty });
    }
    const oid = id('o_');
    await q.tx(async () => {
      await q.run('INSERT INTO orders (id,buyer_id,business_id,status,total_cents,currency,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', oid, user.id, biz.id, 'awaiting_payment', total, currency, now(), now());
      for (const l of lines) await q.run('INSERT INTO order_items (order_id,product_id,qty,unit_cents) VALUES (?,?,?,?)', oid, l.p.id, l.qty, l.p.price_cents);
    });
    return { orderId: oid, status: 'awaiting_payment', totalCents: total, currency };
  });

  r.post('/api/orders/:id/checkout', {}, async ({ user, params }) => {
    const o = (await q.get('SELECT * FROM orders WHERE id=? AND buyer_id=?', params.id, user.id)) || fail(404, 'order_not_found');
    if (o.status !== 'awaiting_payment') fail(409, 'invalid_state');
    // Card data is entered on the provider's hosted page and never touches Mäka servers.
    const pay = ctx.payments;
    if (!pay) fail(503, 'payments_not_configured', 'Checkout is not live yet. Your order is saved; no payment has been taken.');
    if (pay.missing) fail(501, 'payments_adapter_missing');
    if (o.checkout_url && o.checkout_expires > now() + 5 * 6e4) return { url: o.checkout_url };
    const biz = await q.get('SELECT * FROM businesses WHERE id=?', o.business_id);
    if (!biz.stripe_account || !biz.charges_enabled) fail(409, 'store_not_accepting_payments', `${biz.name} isn’t set up to take payments yet. Your order is saved; no payment has been taken.`);
    const items = await q.all('SELECT oi.qty, oi.unit_cents, p.name, p.stock FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?', o.id);
    for (const it of items) if (it.stock < it.qty) fail(409, 'out_of_stock', `${it.name} sold out after you ordered. Cancel and order again.`);
    const fee = Math.floor(o.total_cents * pay.feeBps / 10000);
    const expires = Math.floor(now() / 1000) + 60 * 60;
    const origin = config.publicOrigin;
    const session = await pay.createCheckout({
      mode: 'payment', client_reference_id: o.id + '-' + expires, customer_email: user.email,
      line_items: items.map((it) => ({ quantity: it.qty, price_data: { currency: o.currency.toLowerCase(), unit_amount: it.unit_cents, product_data: { name: it.name } } })),
      success_url: `${origin}/order.html?status=paid&order=${o.id}`, cancel_url: `${origin}/order.html?status=cancelled&order=${o.id}`,
      expires_at: expires, metadata: { order_id: o.id },
      payment_intent_data: { transfer_data: { destination: biz.stripe_account }, application_fee_amount: fee || undefined, metadata: { order_id: o.id } },
      shipping_address_collection: { allowed_countries: pay.shipCountries },
      automatic_tax: pay.automaticTax ? { enabled: true, liability: { type: 'account', account: biz.stripe_account } } : undefined,
    });
    await q.run('UPDATE orders SET checkout_session=?, checkout_url=?, checkout_expires=?, updated_at=? WHERE id=?', session.id, session.url, expires * 1000, now(), o.id);
    return { url: session.url };
  });

  // Business payouts: each verified business connects its own Stripe account.
  r.get('/api/businesses/:id/payments', {}, async ({ user, params }) => {
    const biz = await ownBusiness(params.id, user);
    const pay = ctx.payments;
    if (pay && !pay.missing && biz.stripe_account && !biz.charges_enabled) {
      const acct = await pay.getAccount(biz.stripe_account).catch(() => null);
      if (acct?.charges_enabled) { await q.run('UPDATE businesses SET charges_enabled=1 WHERE id=?', biz.id); biz.charges_enabled = 1; }
    }
    return { configured: !!pay && !pay.missing, connected: !!biz.stripe_account, acceptingPayments: !!biz.charges_enabled };
  });
  r.post('/api/businesses/:id/payments/onboard', {}, async ({ user, params }) => {
    const biz = await ownBusiness(params.id, user);
    if (biz.verification !== 'verified') fail(403, 'business_not_verified', 'Your business needs to be verified first.');
    const pay = ctx.payments;
    if (!pay) fail(503, 'payments_not_configured', 'Payments aren’t live on Mäka yet.');
    if (pay.missing) fail(501, 'payments_adapter_missing');
    let account = biz.stripe_account;
    if (!account) {
      account = (await pay.createAccount({ email: user.email, businessId: biz.id })).id;
      await q.run('UPDATE businesses SET stripe_account=? WHERE id=?', account, biz.id);
      await ctx.audit(user.id, 'payments_connect', 'business', biz.id, {});
    }
    const back = `${config.publicOrigin}/order.html?status=onboarded`;
    const link = await pay.accountLink({ account, refreshUrl: `${config.publicOrigin}/order.html?status=onboarding_expired`, returnUrl: back });
    return { url: link.url };
  });

  // Provider webhook: the only way an order becomes paid, refunded or disputed.
  r.post('/api/payments/webhook', { auth: 'public' }, async ({ req, raw }) => {
    const pay = ctx.payments;
    if (!pay || pay.missing) fail(503, 'payments_not_configured');
    const buf = await raw();
    const ev = pay.verifyWebhook(buf, req.headers['stripe-signature']);
    if (!ev) fail(400, 'invalid_signature');
    const obj = ev.data?.object || {};
    const notices = [], refunds = [];
    // Recording the event and applying it commit together, so a failure is retried by the provider.
    const duplicate = await q.tx(async () => {
    const fresh = await q.run('INSERT INTO payment_events (id,type,created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING', ev.id, ev.type, now());
    if (fresh.changes === 0) return true;
    if ((ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') && obj.payment_status === 'paid') {
      const oid = obj.metadata?.order_id;
      const o = oid && await q.get('SELECT * FROM orders WHERE id=?', oid);
      if (o && o.status === 'cancelled' && !o.payment_ref) {
        // Paid on a page opened before the order was cancelled: refund in full, never keep the money.
        await q.run('UPDATE orders SET payment_ref=?, updated_at=? WHERE id=?', obj.payment_intent, now(), o.id);
        refunds.push(obj.payment_intent);
      } else if (o && o.status === 'awaiting_payment') {
        if (o.total_cents !== obj.amount_subtotal) console.error(`order ${o.id}: paid subtotal ${obj.amount_subtotal} differs from ${o.total_cents}`);
        await q.run("UPDATE orders SET status='paid', payment_ref=?, updated_at=? WHERE id=?", obj.payment_intent, now(), o.id);
        for (const it of await q.all('SELECT product_id, qty FROM order_items WHERE order_id=?', o.id))
          await q.run('UPDATE products SET stock=GREATEST(stock-?,0) WHERE id=?', it.qty, it.product_id);
        const biz = await q.get('SELECT * FROM businesses WHERE id=?', o.business_id);
        notices.push([o.buyer_id, o.id, `Payment received for your ${biz.name} order.`], [biz.owner_id, o.id, `New paid order for ${biz.name}.`]);
      }
    } else if (ev.type === 'charge.refunded' && obj.refunded) {
      await q.run("UPDATE orders SET status='refunded', updated_at=? WHERE payment_ref=?", now(), obj.payment_intent);
    } else if (ev.type === 'charge.dispute.created') {
      await q.run("UPDATE orders SET status='disputed', updated_at=? WHERE payment_ref=?", now(), obj.payment_intent);
    } else if (ev.type === 'account.updated') {
      await q.run('UPDATE businesses SET charges_enabled=? WHERE stripe_account=?', obj.charges_enabled ? 1 : 0, obj.id);
    }
    return false;
    });
    if (duplicate) return { received: true, duplicate: true };
    for (const pi of refunds) await pay.refund(pi);
    for (const [uid, oid, text] of notices) await ctx.notify(uid, 'order_paid', null, 'order', oid, text);
    return { received: true };
  });
  r.post('/api/orders/:id/cancel', {}, async ({ user, params }) => {
    const o = (await q.get('SELECT * FROM orders WHERE id=? AND buyer_id=?', params.id, user.id)) || fail(404, 'order_not_found');
    if (o.status !== 'awaiting_payment') fail(409, 'invalid_state', 'Paid orders need a refund request instead.');
    // Close any open payment page first so a cancelled order can't be paid afterwards.
    if (o.checkout_session && o.checkout_expires > now() && ctx.payments?.expireCheckout) await ctx.payments.expireCheckout(o.checkout_session);
    await q.run("UPDATE orders SET status='cancelled', checkout_url=NULL, updated_at=? WHERE id=?", now(), o.id);
    return { status: 'cancelled' };
  });
  r.post('/api/orders/:id/refund-request', {}, async ({ user, params }) => {
    const o = (await q.get('SELECT * FROM orders WHERE id=? AND buyer_id=?', params.id, user.id)) || fail(404, 'order_not_found');
    if (!['paid', 'fulfilled'].includes(o.status)) fail(409, 'invalid_state');
    await q.run("UPDATE orders SET status='refund_requested', updated_at=? WHERE id=?", now(), o.id);
    return { status: 'refund_requested' };
  });
  r.get('/api/me/orders', {}, async ({ user }) => mapAsync(await q.all('SELECT o.*, b.name business FROM orders o JOIN businesses b ON b.id=o.business_id WHERE buyer_id=? ORDER BY o.created_at DESC', user.id), async (o) => ({
    id: o.id, business: o.business, status: o.status, totalCents: o.total_cents, currency: o.currency, createdAt: o.created_at,
    items: await q.all('SELECT oi.qty, oi.unit_cents "unitCents", p.name FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?', o.id) })));
}
