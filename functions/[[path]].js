const encoder = new TextEncoder();

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function iconSvg(name) {
  const icons = {
    logo: '<svg class="ss-logo" viewBox="0 0 64 40" aria-hidden="true"><path class="ss-mark" d="M27 9H16c-5 0-8 2.6-8 6.3 0 4.2 3.6 5.6 8 6.4l3.4.7c4.4.9 7.6 2.4 7.6 6.4 0 3.9-3.3 6.2-8.2 6.2H8"/><path class="ss-mark" d="M56 9H45c-5 0-8 2.6-8 6.3 0 4.2 3.6 5.6 8 6.4l3.4.7c4.4.9 7.6 2.4 7.6 6.4 0 3.9-3.3 6.2-8.2 6.2H37"/><path class="ss-join" d="M27 22c3-2.2 7-2.2 10 0"/></svg>',
    chain: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 16.8a4 4 0 0 1 0-5.6l2-2 2.1 2.1-2 2a1 1 0 0 0 1.4 1.4l2-2 2.1 2.1-2 2a4 4 0 0 1-5.6 0z"/><path d="M13.1 10.9l-2.2 2.2-2-2 2.2-2.2 2 2z"/><path d="M14.8 7.2a4 4 0 0 1 5.6 5.6l-2 2-2.1-2.1 2-2a1 1 0 0 0-1.4-1.4l-2 2-2.1-2.1 2-2z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.2"/><circle cx="16.8" cy="7.2" r="1"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4c.4 2.6 2 4.2 4.5 4.5v3.2A7.7 7.7 0 0 1 14 10v5.2a5.1 5.1 0 1 1-4.8-5.1v3.3a1.9 1.9 0 1 0 1.6 1.9V4h3.2z"/></svg>',
    reddit: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="7"/><circle cx="9.4" cy="12.3" r="1"/><circle cx="14.6" cy="12.3" r="1"/><path d="M9.5 15.4c1.4 1 3.6 1 5 0"/><path d="M13 6l1-3 3 1"/><circle cx="19" cy="9" r="2"/><circle cx="5" cy="9" r="2"/></svg>',
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 4.6-2.7 8-7 10-4.3-2-7-5.4-7-10V6l7-3z"/><path d="M9 12l2 2 4-5"/></svg>'
  };

  return icons[name] || icons.chain;
}

function iconForLink(link) {
  const text = `${link.title || ""} ${link.source || ""} ${link.slug || ""}`.toLowerCase();
  if (text.includes("instagram")) return iconSvg("instagram");
  if (text.includes("tiktok")) return iconSvg("tiktok");
  if (text.includes("reddit")) return iconSvg("reddit");
  return iconSvg("chain");
}

function page(title, content, className = "") {
  return html(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(title)}</title>
        <link rel="stylesheet" href="/style.css">
      </head>
      <body>
        <main class="${className}">${content}</main>
      </body>
    </html>
  `);
}

function html(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...headers }
  });
}

function redirect(path, headers = {}) {
  return new Response(null, {
    status: 302,
    headers: { location: path, ...headers }
  });
}

function normalizeSlug(value = "") {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseCookies(request) {
  return Object.fromEntries(
    (request.headers.get("cookie") || "")
      .split(";")
      .filter(Boolean)
      .map((cookie) => {
        const [name, ...parts] = cookie.trim().split("=");
        return [name, decodeURIComponent(parts.join("="))];
      })
  );
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(String(value))));
}

async function sessionUserId(request, env) {
  const cookie = parseCookies(request).admin_auth || "";
  const [userId, token] = cookie.split(".");
  if (!userId || !token) return null;

  const expected = await hmac(env.AUTH_SECRET || "change-this-local-secret", userId);
  return token === expected ? userId : null;
}

async function setSessionCookie(userId, env) {
  const token = await hmac(env.AUTH_SECRET || "change-this-local-secret", userId);
  return `admin_auth=${encodeURIComponent(`${userId}.${token}`)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400; Secure`;
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" },
    key,
    256
  );
  return `pbkdf2:120000:${bytesToBase64(salt)}:${bytesToBase64(new Uint8Array(bits))}`;
}

async function verifyPassword(password, storedHash) {
  const [type, iterations, saltValue, hashValue] = String(storedHash || "").split(":");
  if (type !== "pbkdf2" || !iterations || !saltValue || !hashValue) return false;

  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: base64ToBytes(saltValue), iterations: Number(iterations), hash: "SHA-256" },
    key,
    256
  );
  return bytesToBase64(new Uint8Array(bits)) === hashValue;
}

class SupabaseDb {
  constructor(env) {
    this.url = (env.SUPABASE_URL || "").replace(/\/$/, "");
    this.key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!this.url || !this.key) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }
  }

  request(path, options = {}) {
    return fetch(`${this.url}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: this.key,
        authorization: `Bearer ${this.key}`,
        "content-type": "application/json",
        ...options.headers
      }
    });
  }

  async select(path) {
    const response = await this.request(path);
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async insert(table, body) {
    const response = await this.request(table, {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async patch(path, body) {
    const response = await this.request(path, {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async delete(path) {
    const response = await this.request(path, { method: "DELETE" });
    if (!response.ok) throw new Error(await response.text());
  }
}

function encoded(value) {
  return encodeURIComponent(value);
}

async function getCountry(request) {
  return request.cf?.country || request.headers.get("cf-ipcountry") || "Unknown";
}

async function trackEvent(db, request, linkId, eventType) {
  await db.insert("analytics_events", {
    smart_link_id: linkId,
    event_type: eventType,
    country: await getCountry(request)
  });
}

function browserBypassPage(link) {
  return html(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(link.title)}</title>
        <style>
          body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #fff; color: #111; font-family: Arial, sans-serif; text-align: center; }
          .box { width: 100%; max-width: 420px; }
          .loader { width: 34px; height: 34px; margin: 0 auto 18px; border: 3px solid #eee; border-top-color: #111; border-radius: 50%; animation: spin .8s linear infinite; }
          a { display: block; margin-top: 18px; padding: 16px; border-radius: 14px; background: #111; color: #fff; font-weight: bold; text-decoration: none; }
          p { color: #555; line-height: 1.45; }
          @keyframes spin { to { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <div class="box">
          <div class="loader"></div>
          <h1>Opening...</h1>
          <p>If this stays inside Instagram, tap the button below.</p>
          <a id="open-browser" href="${escapeHtml(link.destination_url)}" target="_blank" rel="noopener">Open in browser</a>
        </div>
        <script>
          const targetUrl = ${JSON.stringify(link.destination_url)};
          const userAgent = navigator.userAgent || "";
          const isAndroid = /Android/i.test(userAgent);
          const isInstagram = /Instagram/i.test(userAgent);
          const button = document.getElementById("open-browser");

          function openAndroidBrowser() {
            const url = new URL(targetUrl);
            const intentUrl = "intent://" + url.host + url.pathname + url.search + url.hash + "#Intent;scheme=" + url.protocol.replace(":", "") + ";package=com.android.chrome;S.browser_fallback_url=" + encodeURIComponent(targetUrl) + ";end";
            button.href = intentUrl;
            window.location.href = intentUrl;
          }

          function tryOpenOutside() {
            if (isAndroid) return openAndroidBrowser();
            if (!isInstagram) return window.location.href = targetUrl;
            const popup = window.open(targetUrl, "_blank", "noopener,noreferrer");
            if (!popup) button.click();
          }

          setTimeout(tryOpenOutside, 150);
        </script>
      </body>
    </html>
  `);
}

function percent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

async function publicPage(db, request) {
  const links = await db.select("smart_links?select=id,title,slug,source&is_active=eq.1&order=id.desc");
  await Promise.all(links.map((link) => trackEvent(db, request, link.id, "view")));

  const buttons = links.length
    ? links.map((link) => `
        <a class="link-button" href="/go/${encodeURIComponent(link.slug)}">
          <span class="link-icon">${iconForLink(link)}</span>
          <span class="link-copy">
            <strong>${escapeHtml(link.title)}</strong>
            ${link.source ? `<small>${escapeHtml(link.source)}</small>` : "<small>Smart link</small>"}
          </span>
          <span class="arrow">&rarr;</span>
        </a>
      `).join("")
    : '<p class="empty">No active links yet.</p>';

  return page("SS Links", `
    <header class="hero-nav">
      <a class="brand" href="/">${iconSvg("logo")} <span>SS Links</span></a>
      <a class="pill" href="/signin">Log in</a>
    </header>
    <section class="hero-card">
      <div class="avatar brand-avatar">${iconSvg("logo")}</div>
      <p class="eyebrow">SS Links</p>
      <h1>SS Links that feel <span>premium.</span></h1>
      <p class="lead">One elegant page for your bio links, redirects, and in-app browser bypass tests.</p>
      <nav>${buttons}</nav>
    </section>
  `, "home");
}

function signinPage(error = false) {
  return page("Sign in", `
    <section class="auth-card">
      <div class="avatar small">${iconSvg("shield")}</div>
      <h1>Sign in</h1>
      <p>Sign in to manage your links.</p>
      ${error ? '<p class="message error">Wrong username or password.</p>' : ""}
      <form class="login-form" method="post" action="/signin">
        <label>Username<input name="username" autocomplete="username" required></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
        <button type="submit">Sign in</button>
      </form>
      <p class="auth-switch">No account yet? <a class="small-link" href="/signup">Create one</a></p>
    </section>
  `, "auth");
}

function signupPage(error = "") {
  return page("Sign up", `
    <section class="auth-card">
      <div class="avatar small">${iconSvg("shield")}</div>
      <h1>Sign up</h1>
      <p>Create an account to manage your links.</p>
      ${error ? `<p class="message error">${escapeHtml(error)}</p>` : ""}
      <form class="login-form" method="post" action="/signup">
        <label>Username<input name="username" autocomplete="username" required></label>
        <label>Password<input name="password" type="password" autocomplete="new-password" required></label>
        <button type="submit">Create account</button>
      </form>
      <p class="auth-switch">Already have an account? <a class="small-link" href="/signin">Sign in</a></p>
    </section>
  `, "auth");
}

function analyticsFor(linkStats, events) {
  const stats = new Map(linkStats.map((link) => [link.id, { ...link, views: 0, clicks: 0 }]));
  const countries = new Map();
  let views = 0;
  let clicks = 0;

  events.forEach((event) => {
    if (event.event_type === "view") views += 1;
    if (event.event_type === "click") clicks += 1;
    countries.set(event.country || "Unknown", (countries.get(event.country || "Unknown") || 0) + 1);
    const link = stats.get(event.smart_link_id);
    if (link && event.event_type === "view") link.views += 1;
    if (link && event.event_type === "click") link.clicks += 1;
  });

  return { views, clicks, stats: [...stats.values()], countries: [...countries.entries()] };
}

async function adminPage(db, request, env) {
  const userId = await sessionUserId(request, env);
  if (!userId) return redirect("/signin");

  const currentUser = (await db.select(`users?select=id,username,role&id=eq.${encoded(userId)}&limit=1`))[0];
  const isOwner = currentUser?.role === "owner";
  const url = new URL(request.url);
  const requestedTab = url.searchParams.get("tab");
  const activeTab = requestedTab === "analytics" || (requestedTab === "users" && isOwner) ? requestedTab : "links";
  const links = await db.select("smart_links?select=*&order=id.desc");
  const events = await db.select("analytics_events?select=*&order=id.desc&limit=1000");
  const users = isOwner ? await db.select("users?select=id,username,role,created_at&order=id.desc") : [];
  const error = url.searchParams.get("error");
  const analytics = analyticsFor(links, events);
  const clickRate = analytics.views ? (analytics.clicks / analytics.views) * 100 : 0;

  const rows = links.length ? links.map((link) => `
    <tr>
      <td><span class="row-title"><span class="mini-icon">${iconForLink(link)}</span><strong>${escapeHtml(link.title)}</strong></span></td>
      <td>${escapeHtml(link.slug)}</td>
      <td class="url-cell">${escapeHtml(link.destination_url)}</td>
      <td><span class="status ${link.deeplink_enabled ? "active" : "inactive"}">${link.deeplink_enabled ? "On" : "Off"}</span></td>
      <td>${escapeHtml(link.source || "")}</td>
      <td><span class="status ${link.is_active ? "active" : "inactive"}">${link.is_active ? "Active" : "Inactive"}</span></td>
      <td><a class="small-link" href="/go/${encodeURIComponent(link.slug)}">/go/${escapeHtml(link.slug)}</a></td>
      <td class="actions">
        <form method="post" action="/admin/links/${link.id}/toggle"><button type="submit">${link.is_active ? "Deactivate" : "Activate"}</button></form>
        <form method="post" action="/admin/links/${link.id}/delete"><button class="danger" type="submit">Delete</button></form>
      </td>
    </tr>
  `).join("") : '<tr><td colspan="8" class="empty">No links yet.</td></tr>';

  const linksPanel = `
    ${error ? `<p class="message error">${escapeHtml(error)}</p>` : ""}
    <form class="create-form tab-panel" method="post" action="/admin/links">
      <label>Title<input name="title" required></label>
      <label>Link name<input name="slug" placeholder="instagram, tiktok, fanvue" required></label>
      <label>Destination URL<input name="destination_url" type="url" placeholder="https://example.com" required></label>
      <label class="checkbox-label"><input name="deeplink_enabled" type="checkbox" value="1"><span>Bypass In-app browser</span></label>
      <label>Source label<input name="source" placeholder="Instagram, TikTok, Reddit, Fanvue"></label>
      <button type="submit">${iconSvg("chain")} Create link</button>
    </form>
    <div class="table-wrap tab-panel">
      <table>
        <thead><tr><th>Title</th><th>Link name</th><th>Destination</th><th>In-app bypass</th><th>Source</th><th>Status</th><th>Preview link</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  const analyticsRows = analytics.stats.length ? analytics.stats.map((link) => {
    const rate = link.views ? (link.clicks / link.views) * 100 : 0;
    return `
      <tr>
        <td><span class="row-title"><span class="mini-icon">${iconForLink(link)}</span><strong>${escapeHtml(link.title)}</strong></span></td>
        <td>${escapeHtml(link.slug)}</td><td>${link.views}</td><td>${link.clicks}</td><td>${percent(rate)}</td><td>${escapeHtml(link.source || "")}</td>
      </tr>
    `;
  }).join("") : '<tr><td colspan="6" class="empty">No analytics yet.</td></tr>';

  const countryList = analytics.countries.length ? analytics.countries.map(([country, total]) => `
    <div class="country-row"><span>${escapeHtml(country)}</span><strong>${total}</strong></div>
  `).join("") : '<p class="empty">No country data yet.</p>';

  const analyticsPanel = `
    <section class="analytics-grid tab-panel">
      <div class="metric-card"><span class="metric-icon">${iconSvg("chain")}</span><small>Total views</small><strong>${analytics.views}</strong></div>
      <div class="metric-card"><span class="metric-icon">${iconSvg("chain")}</span><small>Total clicks</small><strong>${analytics.clicks}</strong></div>
      <div class="metric-card"><span class="metric-icon">${iconSvg("shield")}</span><small>Click rate</small><strong>${percent(clickRate)}</strong></div>
    </section>
    <section class="analytics-layout">
      <div class="table-wrap tab-panel">
        <table><thead><tr><th>Link</th><th>Link name</th><th>Views</th><th>Clicks</th><th>CTR</th><th>Source</th></tr></thead><tbody>${analyticsRows}</tbody></table>
      </div>
      <aside class="country-card tab-panel"><h2>Countries</h2><p>Detected from Cloudflare country data.</p>${countryList}</aside>
    </section>
  `;

  const userRows = users.length ? users.map((user) => `
    <tr>
      <td><span class="row-title"><span class="mini-icon">${iconSvg("shield")}</span><strong>${escapeHtml(user.username)}</strong></span></td>
      <td><span class="status ${user.role === "owner" ? "active" : "inactive"}">${escapeHtml(user.role)}</span></td>
      <td>${escapeHtml(user.created_at)}</td>
    </tr>
  `).join("") : '<tr><td colspan="3" class="empty">No users yet.</td></tr>';

  const usersPanel = `
    <section class="analytics-grid tab-panel">
      <div class="metric-card"><span class="metric-icon">${iconSvg("shield")}</span><small>Total users</small><strong>${users.length}</strong></div>
      <div class="metric-card"><span class="metric-icon">${iconSvg("logo")}</span><small>Owner</small><strong>${escapeHtml(currentUser.username)}</strong></div>
    </section>
    <div class="table-wrap tab-panel">
      <table><thead><tr><th>Username</th><th>Role</th><th>Signed up</th></tr></thead><tbody>${userRows}</tbody></table>
    </div>
  `;

  return page("Admin", `
    <div class="admin-header">
      <div>
        <a class="brand" href="/">${iconSvg("logo")} <span>SS Links</span></a>
        <h1>Smart links</h1>
        <p>Create polished bio links with clean redirects and in-app browser bypass.</p>
      </div>
      <div class="admin-nav">
        <a class="pill" href="/">View public page</a>
        <form method="post" action="/logout"><button type="submit">Log out</button></form>
      </div>
    </div>
    <div class="tabs">
      <a class="${activeTab === "links" ? "tab active" : "tab"}" href="/admin?tab=links">${iconSvg("chain")} Links</a>
      <a class="${activeTab === "analytics" ? "tab active" : "tab"}" href="/admin?tab=analytics">${iconSvg("shield")} Analytics</a>
      ${isOwner ? `<a class="${activeTab === "users" ? "tab active" : "tab"}" href="/admin?tab=users">${iconSvg("logo")} Users</a>` : ""}
    </div>
    ${activeTab === "analytics" ? analyticsPanel : activeTab === "users" ? usersPanel : linksPanel}
  `, "admin");
}

async function handleRequest(request, env) {
  const db = new SupabaseDb(env);
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === "GET" && path === "/") return publicPage(db, request);
  if (method === "GET" && path === "/login") return redirect("/signin");
  if (method === "GET" && path === "/signin") return signinPage(url.searchParams.has("error"));
  if (method === "GET" && path === "/signup") return signupPage(url.searchParams.get("error") || "");
  if (method === "GET" && path === "/admin") return adminPage(db, request, env);
  if (method === "GET" && path === "/test") return html("App is working");

  if (method === "POST" && path === "/signin") {
    const form = await request.formData();
    const username = String(form.get("username") || "").trim();
    const password = String(form.get("password") || "");
    const user = (await db.select(`users?select=*&username=eq.${encoded(username)}&limit=1`))[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) return redirect("/signin?error=1");
    return redirect("/admin", { "set-cookie": await setSessionCookie(user.id, env) });
  }

  if (method === "POST" && path === "/signup") {
    const form = await request.formData();
    const username = String(form.get("username") || "").trim();
    const password = String(form.get("password") || "");
    if (!username || !password) return redirect(`/signup?error=${encoded("Username and password are required.")}`);

    try {
      const users = await db.select("users?select=id&limit=1");
      const inserted = await db.insert("users", {
        username,
        password_hash: await hashPassword(password),
        role: users.length === 0 ? "owner" : "user"
      });
      return redirect("/admin", { "set-cookie": await setSessionCookie(inserted[0].id, env) });
    } catch {
      return redirect(`/signup?error=${encoded("That username already exists.")}`);
    }
  }

  if (method === "POST" && path === "/logout") {
    return redirect("/signin", { "set-cookie": "admin_auth=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Secure" });
  }

  const userId = await sessionUserId(request, env);
  if (method === "POST" && path === "/admin/links" && userId) {
    const form = await request.formData();
    const title = String(form.get("title") || "").trim();
    const slug = normalizeSlug(String(form.get("slug") || ""));
    const destinationUrl = String(form.get("destination_url") || "").trim();
    const source = String(form.get("source") || "").trim();
    const deeplinkEnabled = form.get("deeplink_enabled") === "1" ? 1 : 0;
    if (!title || !slug || !isValidHttpUrl(destinationUrl)) {
      return redirect(`/admin?error=${encoded("Enter a title, link name, and valid http:// or https:// URL.")}`);
    }
    try {
      await db.insert("smart_links", { title, slug, destination_url: destinationUrl, deeplink_url: "", deeplink_enabled: deeplinkEnabled, source });
      return redirect("/admin");
    } catch {
      return redirect(`/admin?error=${encoded("That link name already exists.")}`);
    }
  }

  const deleteMatch = path.match(/^\/admin\/links\/(\d+)\/delete$/);
  if (method === "POST" && deleteMatch && userId) {
    await db.delete(`smart_links?id=eq.${deleteMatch[1]}`);
    return redirect("/admin");
  }

  const toggleMatch = path.match(/^\/admin\/links\/(\d+)\/toggle$/);
  if (method === "POST" && toggleMatch && userId) {
    const link = (await db.select(`smart_links?select=id,is_active&id=eq.${toggleMatch[1]}&limit=1`))[0];
    if (link) await db.patch(`smart_links?id=eq.${link.id}`, { is_active: link.is_active ? 0 : 1, updated_at: new Date().toISOString() });
    return redirect("/admin");
  }

  const goMatch = path.match(/^\/go\/([^/]+)$/);
  if (method === "GET" && goMatch) {
    const link = (await db.select(`smart_links?select=*&slug=eq.${encoded(normalizeSlug(goMatch[1]))}&limit=1`))[0];
    if (!link) return html("Link not found", 404);
    if (!link.is_active) return html("This link is inactive");
    await trackEvent(db, request, link.id, "click");
    if (link.deeplink_enabled) return browserBypassPage(link);
    return redirect(link.destination_url);
  }

  return html("Not found", 404);
}

export async function onRequest(context) {
  try {
    return await handleRequest(context.request, context.env);
  } catch (error) {
    return html(`<pre>${escapeHtml(error.message)}</pre>`, 500);
  }
}
