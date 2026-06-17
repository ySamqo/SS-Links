const express = require("express");
const crypto = require("crypto");
const db = require("./src/db");

const app = express();
const port = 3000;
const authSecret = process.env.AUTH_SECRET || "change-this-local-secret";
const netlifyFunctionPath = "/.netlify/functions/app";

app.use(express.urlencoded({ extended: false }));
app.use(express.text({ type: "*/*" }));
app.use((req, res, next) => {
  if (typeof req.body === "string") {
    if (req.body.includes("&")) {
      req.body = Object.fromEntries(new URLSearchParams(req.body));
    } else {
      req.body = Object.fromEntries(
        req.body
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => {
            const [key, ...value] = line.split("=");
            return [key, value.join("=")];
          })
      );
    }
  }
  if (!req.body) req.body = {};
  next();
});
app.use(express.static("public"));

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
  return `
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
  `;
}

function postAction(path) {
  return process.env.NETLIFY ? `${netlifyFunctionPath}${path}` : path;
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

function getCountry(req) {
  const country =
    req.headers["cf-ipcountry"] ||
    req.headers["x-vercel-ip-country"] ||
    req.headers["x-country-code"] ||
    req.headers["cloudfront-viewer-country"] ||
    "Unknown";

  return String(country).slice(0, 40);
}

async function trackEvent(req, linkId, eventType) {
  await db.run(
    "INSERT INTO analytics_events (smart_link_id, event_type, country) VALUES (?, ?, ?)",
    [linkId, eventType, getCountry(req)]
  );
}

function percent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function browserBypassPage(link) {
  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(link.title)}</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 24px;
            background: #ffffff;
            color: #111111;
            font-family: Arial, sans-serif;
            text-align: center;
          }

          .box {
            width: 100%;
            max-width: 420px;
          }

          .loader {
            width: 34px;
            height: 34px;
            margin: 0 auto 18px;
            border: 3px solid #eeeeee;
            border-top-color: #111111;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }

          a {
            display: block;
            margin-top: 18px;
            padding: 16px;
            border-radius: 14px;
            background: #111111;
            color: #ffffff;
            font-weight: bold;
            text-decoration: none;
          }

          p {
            color: #555555;
            line-height: 1.45;
          }

          @keyframes spin {
            to { transform: rotate(360deg); }
          }
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
            const intentUrl =
              "intent://" +
              url.host +
              url.pathname +
              url.search +
              url.hash +
              "#Intent;scheme=" +
              url.protocol.replace(":", "") +
              ";package=com.android.chrome;S.browser_fallback_url=" +
              encodeURIComponent(targetUrl) +
              ";end";

            button.href = intentUrl;
            window.location.href = intentUrl;
          }

          function tryOpenOutside() {
            if (isAndroid) {
              openAndroidBrowser();
              return;
            }

            if (!isInstagram) {
              window.location.href = targetUrl;
              return;
            }

            const popup = window.open(targetUrl, "_blank", "noopener,noreferrer");
            if (!popup) {
              button.click();
            }
          }

          setTimeout(tryOpenOutside, 150);
        </script>
      </body>
    </html>
  `;
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .filter(Boolean)
      .map((cookie) => {
        const [name, ...parts] = cookie.trim().split("=");
        return [name, decodeURIComponent(parts.join("="))];
      })
  );
}

function signSession(userId) {
  return crypto
    .createHmac("sha256", authSecret)
    .update(String(userId))
    .digest("hex");
}

function sessionUserId(req) {
  const cookie = parseCookies(req).admin_auth || "";
  const [userId, token] = cookie.split(".");

  if (!userId || !token) return null;

  const expected = signSession(userId);
  const isValid = token.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));

  return isValid ? userId : null;
}

function isLoggedIn(req) {
  return Boolean(sessionUserId(req));
}

function requireLogin(req, res, next) {
  const userId = sessionUserId(req);
  if (userId) {
    req.userId = userId;
    return next();
  }
  return res.redirect("/signin");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;

  const testHash = crypto.scryptSync(password, salt, 64).toString("hex");
  return testHash.length === hash.length
    && crypto.timingSafeEqual(Buffer.from(testHash), Buffer.from(hash));
}

function setSessionCookie(res, userId) {
  res.setHeader(
    "Set-Cookie",
    `admin_auth=${encodeURIComponent(`${userId}.${signSession(userId)}`)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`
  );
}

app.get("/", async (req, res) => {
  const links = await db.all(
    "SELECT id, title, slug, source FROM smart_links WHERE is_active = ? ORDER BY id DESC",
    [1]
  );

  await Promise.all(links.map((link) => trackEvent(req, link.id, "view")));

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

  res.send(page("My Links", `
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
  `, "home"));
});

app.get("/login", (req, res) => res.redirect("/signin"));

app.get("/signin", (req, res) => {
  if (isLoggedIn(req)) return res.redirect("/admin");

  const error = req.query.error
    ? '<p class="message error">Wrong username or password.</p>'
    : "";

  res.send(page("Sign in", `
    <section class="auth-card">
    <div class="avatar small">${iconSvg("shield")}</div>
    <h1>Sign in</h1>
    <p>Sign in to manage your links.</p>
    ${error}
    <form class="login-form" method="post" action="${postAction("/signin")}" enctype="text/plain">
      <label>Username<input name="username" autocomplete="username" required></label>
      <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
      <button type="submit">Sign in</button>
    </form>
    <p class="auth-switch">No account yet? <a class="small-link" href="/signup">Create one</a></p>
    </section>
  `, "auth"));
});

app.post("/signin", async (req, res) => {
  const username = (req.body.username || "").trim();
  const password = req.body.password || "";
  const user = await db.get("SELECT * FROM users WHERE username = ?", [username]);

  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.redirect("/signin?error=1");
  }

  setSessionCookie(res, user.id);
  return res.redirect("/admin");
});

app.get("/signup", (req, res) => {
  if (isLoggedIn(req)) return res.redirect("/admin");

  const error = req.query.error
    ? `<p class="message error">${escapeHtml(req.query.error)}</p>`
    : "";

  res.send(page("Sign up", `
    <section class="auth-card">
    <div class="avatar small">${iconSvg("shield")}</div>
    <h1>Sign up</h1>
    <p>Create an account to manage your links.</p>
    ${error}
    <form class="login-form" method="post" action="${postAction("/signup")}" enctype="text/plain">
      <label>Username<input name="username" autocomplete="username" required></label>
      <label>Password<input name="password" type="password" autocomplete="new-password" required></label>
      <button type="submit">Create account</button>
    </form>
    <p class="auth-switch">Already have an account? <a class="small-link" href="/signin">Sign in</a></p>
    </section>
  `, "auth"));
});

app.post("/signup", async (req, res) => {
  const username = (req.body.username || "").trim();
  const password = req.body.password || "";

  if (!username || !password) {
    return res.redirect(`/signup?error=${encodeURIComponent("Username and password are required.")}`);
  }

  try {
    const existingUser = await db.get("SELECT COUNT(*) AS count FROM users");
    const role = existingUser.count === 0 ? "owner" : "user";
    await db.run(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
      [username, hashPassword(password), role]
    );
    const user = await db.get("SELECT id FROM users WHERE username = ?", [username]);
    setSessionCookie(res, user.id);
    return res.redirect("/admin");
  } catch (error) {
    const message = error.code === "SQLITE_CONSTRAINT"
      ? "That username already exists."
      : "Could not create account.";
    return res.redirect(`/signup?error=${encodeURIComponent(message)}`);
  }
});

app.post("/logout", (req, res) => {
  res.setHeader("Set-Cookie", "admin_auth=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  res.redirect("/signin");
});

app.get("/test", (req, res) => {
  res.send(page("Test", `
    <section class="hero-card">
    <div class="avatar">${iconSvg("chain")}</div>
    <h1>App is working</h1>
    <nav>
      <a class="link-button" href="/">Home</a>
      <a class="link-button" href="/admin">Admin</a>
      <a class="link-button" href="/signin">Sign in</a>
      <a class="link-button" href="/signup">Sign up</a>
    </nav>
    </section>
  `, "home"));
});

app.get("/admin", requireLogin, async (req, res) => {
  const currentUser = await db.get("SELECT id, username, role FROM users WHERE id = ?", [req.userId]);
  const isOwner = currentUser && currentUser.role === "owner";
  const requestedTab = req.query.tab;
  const activeTab = requestedTab === "analytics" || (requestedTab === "users" && isOwner) ? requestedTab : "links";
  const links = await db.all("SELECT * FROM smart_links ORDER BY id DESC");
  const users = isOwner
    ? await db.all("SELECT id, username, role, created_at FROM users ORDER BY id DESC")
    : [];
  const totals = await db.get(`
    SELECT
      SUM(CASE WHEN event_type = 'view' THEN 1 ELSE 0 END) AS views,
      SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) AS clicks
    FROM analytics_events
  `);
  const countryRows = await db.all(`
    SELECT country, COUNT(*) AS total
    FROM analytics_events
    GROUP BY country
    ORDER BY total DESC
    LIMIT 8
  `);
  const linkStats = await db.all(`
    SELECT
      smart_links.title,
      smart_links.slug,
      smart_links.source,
      SUM(CASE WHEN analytics_events.event_type = 'view' THEN 1 ELSE 0 END) AS views,
      SUM(CASE WHEN analytics_events.event_type = 'click' THEN 1 ELSE 0 END) AS clicks
    FROM smart_links
    LEFT JOIN analytics_events ON analytics_events.smart_link_id = smart_links.id
    GROUP BY smart_links.id
    ORDER BY clicks DESC, views DESC, smart_links.id DESC
  `);
  const error = req.query.error
    ? `<p class="message error">${escapeHtml(req.query.error)}</p>`
    : "";
  const totalViews = totals.views || 0;
  const totalClicks = totals.clicks || 0;
  const clickRate = totalViews ? (totalClicks / totalViews) * 100 : 0;

  const rows = links.length
    ? links.map((link) => `
        <tr>
          <td><span class="row-title"><span class="mini-icon">${iconForLink(link)}</span><strong>${escapeHtml(link.title)}</strong></span></td>
          <td>${escapeHtml(link.slug)}</td>
          <td class="url-cell">${escapeHtml(link.destination_url)}</td>
          <td><span class="status ${link.deeplink_enabled ? "active" : "inactive"}">${link.deeplink_enabled ? "On" : "Off"}</span></td>
          <td>${escapeHtml(link.source || "")}</td>
          <td><span class="status ${link.is_active ? "active" : "inactive"}">${link.is_active ? "Active" : "Inactive"}</span></td>
          <td><a class="small-link" href="/go/${encodeURIComponent(link.slug)}">/go/${escapeHtml(link.slug)}</a></td>
          <td class="actions">
            <form method="post" action="${postAction(`/admin/links/${link.id}/toggle`)}">
              <button type="submit">${link.is_active ? "Deactivate" : "Activate"}</button>
            </form>
            <form method="post" action="${postAction(`/admin/links/${link.id}/delete`)}">
              <button class="danger" type="submit">Delete</button>
            </form>
          </td>
        </tr>
      `).join("")
    : '<tr><td colspan="8" class="empty">No links yet.</td></tr>';

  const countryList = countryRows.length
    ? countryRows.map((row) => `
        <div class="country-row">
          <span>${escapeHtml(row.country || "Unknown")}</span>
          <strong>${row.total}</strong>
        </div>
      `).join("")
    : '<p class="empty">No country data yet.</p>';

  const analyticsRows = linkStats.length
    ? linkStats.map((link) => {
        const views = link.views || 0;
        const clicks = link.clicks || 0;
        const rate = views ? (clicks / views) * 100 : 0;

        return `
          <tr>
            <td><span class="row-title"><span class="mini-icon">${iconForLink(link)}</span><strong>${escapeHtml(link.title)}</strong></span></td>
            <td>${escapeHtml(link.slug)}</td>
            <td>${views}</td>
            <td>${clicks}</td>
            <td>${percent(rate)}</td>
            <td>${escapeHtml(link.source || "")}</td>
          </tr>
        `;
      }).join("")
    : '<tr><td colspan="6" class="empty">No analytics yet.</td></tr>';

  const linksPanel = `
    ${error}
    <form class="create-form tab-panel" method="post" action="${postAction("/admin/links")}" enctype="text/plain">
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

  const analyticsPanel = `
    <section class="analytics-grid tab-panel">
      <div class="metric-card">
        <span class="metric-icon">${iconSvg("chain")}</span>
        <small>Total views</small>
        <strong>${totalViews}</strong>
      </div>
      <div class="metric-card">
        <span class="metric-icon">${iconSvg("chain")}</span>
        <small>Total clicks</small>
        <strong>${totalClicks}</strong>
      </div>
      <div class="metric-card">
        <span class="metric-icon">${iconSvg("shield")}</span>
        <small>Click rate</small>
        <strong>${percent(clickRate)}</strong>
      </div>
    </section>
    <section class="analytics-layout">
      <div class="table-wrap tab-panel">
        <table>
          <thead><tr><th>Link</th><th>Link name</th><th>Views</th><th>Clicks</th><th>CTR</th><th>Source</th></tr></thead>
          <tbody>${analyticsRows}</tbody>
        </table>
      </div>
      <aside class="country-card tab-panel">
        <h2>Countries</h2>
        <p>Detected from hosting headers when available.</p>
        ${countryList}
      </aside>
    </section>
  `;

  const userRows = users.length
    ? users.map((user) => `
        <tr>
          <td><span class="row-title"><span class="mini-icon">${iconSvg("shield")}</span><strong>${escapeHtml(user.username)}</strong></span></td>
          <td><span class="status ${user.role === "owner" ? "active" : "inactive"}">${escapeHtml(user.role)}</span></td>
          <td>${escapeHtml(user.created_at)}</td>
        </tr>
      `).join("")
    : '<tr><td colspan="3" class="empty">No users yet.</td></tr>';

  const usersPanel = `
    <section class="analytics-grid tab-panel">
      <div class="metric-card">
        <span class="metric-icon">${iconSvg("shield")}</span>
        <small>Total users</small>
        <strong>${users.length}</strong>
      </div>
      <div class="metric-card">
        <span class="metric-icon">${iconSvg("logo")}</span>
        <small>Owner</small>
        <strong>${escapeHtml(currentUser.username)}</strong>
      </div>
    </section>
    <div class="table-wrap tab-panel">
      <table>
        <thead><tr><th>Username</th><th>Role</th><th>Signed up</th></tr></thead>
        <tbody>${userRows}</tbody>
      </table>
    </div>
  `;

  res.send(page("Admin", `
    <div class="admin-header">
      <div>
        <a class="brand" href="/">${iconSvg("logo")} <span>SS Links</span></a>
        <h1>Smart links</h1>
        <p>Create polished bio links with clean redirects and in-app browser bypass.</p>
      </div>
      <div class="admin-nav">
        <a class="pill" href="/">View public page</a>
        <form method="post" action="${postAction("/logout")}">
          <button type="submit">Log out</button>
        </form>
      </div>
    </div>
    <div class="tabs">
      <a class="${activeTab === "links" ? "tab active" : "tab"}" href="/admin?tab=links">${iconSvg("chain")} Links</a>
      <a class="${activeTab === "analytics" ? "tab active" : "tab"}" href="/admin?tab=analytics">${iconSvg("shield")} Analytics</a>
      ${isOwner ? `<a class="${activeTab === "users" ? "tab active" : "tab"}" href="/admin?tab=users">${iconSvg("logo")} Users</a>` : ""}
    </div>
    ${activeTab === "analytics" ? analyticsPanel : activeTab === "users" ? usersPanel : linksPanel}
  `, "admin"));
});

app.post("/admin/links", requireLogin, async (req, res) => {
  const title = (req.body.title || "").trim();
  const slug = normalizeSlug(req.body.slug);
  const destinationUrl = (req.body.destination_url || "").trim();
  const deeplinkEnabled = req.body.deeplink_enabled === "1" ? 1 : 0;
  const source = (req.body.source || "").trim();

  if (!title || !slug || !isValidHttpUrl(destinationUrl)) {
    return res.redirect(`/admin?error=${encodeURIComponent("Enter a title, link name, and valid http:// or https:// URL.")}`);
  }

  try {
    await db.run(
      "INSERT INTO smart_links (title, slug, destination_url, deeplink_url, deeplink_enabled, source) VALUES (?, ?, ?, ?, ?, ?)",
      [title, slug, destinationUrl, "", deeplinkEnabled, source]
    );
    return res.redirect("/admin");
  } catch (error) {
    const message = error.code === "SQLITE_CONSTRAINT"
      ? "That link name already exists."
      : "Could not create link.";
    return res.redirect(`/admin?error=${encodeURIComponent(message)}`);
  }
});

app.post("/admin/links/:id/delete", requireLogin, async (req, res) => {
  await db.run("DELETE FROM smart_links WHERE id = ?", [req.params.id]);
  res.redirect("/admin");
});

app.post("/admin/links/:id/toggle", requireLogin, async (req, res) => {
  await db.run(
    "UPDATE smart_links SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [req.params.id]
  );
  res.redirect("/admin");
});

app.get("/go/:slug", async (req, res) => {
  const link = await db.get("SELECT * FROM smart_links WHERE slug = ?", [normalizeSlug(req.params.slug)]);

  if (!link) return res.status(404).send("Link not found");
  if (!link.is_active) return res.send("This link is inactive");
  await trackEvent(req, link.id, "click");
  if (link.deeplink_enabled) return res.send(browserBypassPage(link));
  return res.redirect(link.destination_url);
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Smart-link app running at http://localhost:${port}`);
  });
}

module.exports = app;
