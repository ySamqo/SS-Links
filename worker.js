import { onRequest } from "./functions/[[path]].js";

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

function setupPage() {
  return html(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>SS Links setup</title>
        <link rel="stylesheet" href="/style.css">
      </head>
      <body>
        <main class="home">
          <section class="hero-card">
            <div class="avatar">SS</div>
            <h1>Supabase setup needed</h1>
            <p>Add SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and AUTH_SECRET in Cloudflare environment variables.</p>
          </section>
        </main>
      </body>
    </html>
  `);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/style.css" && env.PUBLIC_ASSETS) {
      return env.PUBLIC_ASSETS.fetch(request);
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      if (url.pathname === "/test") return html("App is working");
      return setupPage();
    }

    return onRequest({
      request,
      env,
      waitUntil: ctx.waitUntil.bind(ctx),
      passThroughOnException: ctx.passThroughOnException?.bind(ctx)
    });
  }
};
