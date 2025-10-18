import { randomBytes } from "crypto"; // Node.js/Deno crypto

// ---------------------------
// Helper: generate base64 nonce
// ---------------------------
function makeNonce(len = 16) {
  return randomBytes(len).toString("base64");
}

// ==========================
// Main Edge Function
// ==========================
export default async (request, context) => {
  try {
    const url = new URL(request.url);
    const path = url.pathname;
    const userAgent = (request.headers.get("user-agent") || "").toLowerCase();
    const clientIP =
      context.clientAddress ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-real-ip") ||
      "";

    // ==========================
    // SEO BOT WHITELIST
    // ==========================
    const seoBots = [
      "googlebot","bingbot","slurp","duckduckbot",
      "baiduspider","yandex","facebookexternalhit","twitterbot",
      "linkedinbot","semrushbot","ahrefsbot"
    ];
    if (seoBots.some(bot => userAgent.includes(bot))) {
      const seoResponse = await context.next();
      return addSecurityHeaders(seoResponse);
    }

    // ==========================
    // VPNAPI.io GEO + VPN CHECK (unchanged)
    // ==========================
    let addVpnHeader = false;
    let blockAccess = false;
    const CAPTCHA_PROBABILITY = 0.2;
    let showCaptcha = false;
    let debugData = { clientIP, detected: false, note: "" };

    if (clientIP) {
      const apiKey = Deno.env.get("VPNAPI_KEY");
      if (apiKey) {
        try {
          const resp = await fetch(`https://vpnapi.io/api/${clientIP}?key=${apiKey}`);
          const data = await resp.json();

          const country = data?.location?.country_code || "Unknown";
          const isVpn = !!data?.security?.vpn;
          const isProxy = !!data?.security?.proxy;
          const isTor = !!data?.security?.tor;
          const isRelay = !!data?.security?.relay;

          debugData = {
            clientIP,
            country,
            isVpn,
            isProxy,
            isTor,
            isRelay,
            detected: true,
            org: data?.network?.organization || data?.network?.asn || "Unknown"
          };

          if (country === "US") {
            if (isVpn && Math.random() < CAPTCHA_PROBABILITY) showCaptcha = true;
          } else {
            if (isVpn || isProxy || isTor || isRelay || country !== "US") blockAccess = true;
          }
        } catch (err) {
          debugData.note = "API lookup failed: " + err.message;
        }
      } else {
        debugData.note = "Missing VPNAPI_KEY in environment variables!";
      }
    } else {
      debugData.note = "No client IP detected!";
    }

    // Debug route
    if (path === "/debug-ip-bark9sol") {
      return new Response(JSON.stringify({ message: "VPNAPI.io Debug", ...debugData }, null, 2), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    // Block if flagged by geo logic
    if (blockAccess) {
      return addSecurityHeaders(new Response("Access Denied: Non-US or High-Risk Network", { status: 403 }));
    }

    // Let the request proceed and then secure the response
    const response = await context.next();
    if (addVpnHeader) response.headers.set("X-VPN-Warning", "true");
    if (showCaptcha) response.headers.set("X-Show-Captcha", "true");
    return addSecurityHeaders(response);

  } catch (err) {
    console.error("Edge Function Error:", err);
    const response = await context.next();
    return addSecurityHeaders(response);
  }
};

// ==========================
// Helper: Security headers + strict nonce CSP
// ==========================
async function addSecurityHeaders(response) {
  // create nonces per-request
  const scriptNonce = makeNonce();
  const styleNonce = makeNonce();

  // read the HTML (if any)
  let html;
  try {
    html = await response.clone().text();
  } catch {
    html = "";
  }

  // 1) Inject nonces into inline <script> and <style> tags that do NOT already have a nonce
  //    - only targets true inline tags (no src for scripts)
  if (html) {
    // inject nonce into inline <script> (skip scripts that have src or already have nonce)
    html = html.replace(
      /<script((?:(?!\b(src|nonce)\b)[\s\S])*?)>([\s\S]*?)<\/script>/gi,
      (m, attrPart, body) => {
        // if tag contains src or nonce in attrPart, leave unchanged
        if (/\b(src|nonce)\b/i.test(attrPart)) return m;
        return `<script${attrPart} nonce="${scriptNonce}">${body}</script>`;
      }
    );

    // inject nonce into <style> tags that don't already have a nonce
    html = html.replace(
      /<style((?:(?!\bnonce\b)[\s\S])*?)>([\s\S]*?)<\/style>/gi,
      (m, attrPart, body) => {
        if (/\bnonce\b/i.test(attrPart)) return m;
        return `<style${attrPart} nonce="${styleNonce}">${body}</style>`;
      }
    );
  }

  // 2) Extract static URLs from src/href/srcset to build a whitelist
  const srcUrls = [];
  const urlRegex = /(?:src|href|srcset)=["']([^"']+)["']/gi;
  let match;
  while ((match = urlRegex.exec(html)) !== null) srcUrls.push(match[1]);

  // 3) Predefined trusted origins (includes MapLibre/OpenStreetMap/CARTO, Crisp, TidyCal, recaptcha, weather APIs)
  const predefined = [
    "'self'",
    // common CDNs
    "https://cdnjs.cloudflare.com",
    "https://cdn.jsdelivr.net",
    "https://unpkg.com",
    // analytics / tag manager
    "https://www.google-analytics.com",
    "https://www.googletagmanager.com",
    // fonts
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
    // Crisp / TidyCal
    "https://client.crisp.chat",
    "https://crisp.chat",
    "https://asset-tidycal.b-cdn.net",
    "https://tidycal.com",
    // Map tile/style providers commonly used with MapLibre
    "https://basemaps.cartocdn.com",
    "https://api.maptiler.com",
    "https://api.mapbox.com",
    "https://maps.geoapify.com",
    "https://carto.com",
    "https://*.tile.openstreetmap.org",
    "https://*.carto.com",
    // other APIs observed in your logs
    "https://api.weather.gov",
    "https://api.sunrise-sunset.org",
    // reCAPTCHA
    "https://www.google.com",
    "https://www.gstatic.com"
  ];

  // 4) Merge origins found in HTML with predefined
  const origins = new Set(predefined);
  srcUrls.forEach(u => {
    try {
      if (u.startsWith("http")) {
        const parsed = new URL(u);
        origins.add(parsed.origin);
      }
    } catch (e) { /* ignore bad urls */ }
  });

  // Debug log (Netlify function logs)
  console.log("===== CSP Origins =====");
  origins.forEach(o => console.log(o));
  console.log("=======================");

  // 5) Build strict CSP using nonces (no 'unsafe-inline')
  //    - script-src includes blob: because MapLibre and some libs may create blob workers
  //    - style-src uses the style nonce; note: inline style attributes (style="") are not covered by nonce and will still be blocked
  const originList = [...origins].join(" ");
  const csp = [
    "default-src 'self';",
    // --- Allow critical external resources ---
    `script-src 'self' 'nonce-${scriptNonce}' https://client.crisp.chat https://crisp.chat https://tidycal.com https://asset-tidycal.b-cdn.net https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://maps.geoapify.com https://carto.com https://api.maptiler.com https://api.mapbox.com https://www.google-analytics.com https://www.googletagmanager.com https://www.google.com https://www.gstatic.com;`,
    `style-src 'self' 'nonce-${styleNonce}' https://fonts.googleapis.com https://fonts.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://client.crisp.chat https://crisp.chat https://tidycal.com https://asset-tidycal.b-cdn.net https://basemaps.cartocdn.com https://carto.com;`,
    `img-src 'self' data: blob: https://client.crisp.chat https://crisp.chat https://cdn.jsdelivr.net https://unpkg.com https://tidycal.com https://asset-tidycal.b-cdn.net https://carto.com https://basemaps.cartocdn.com https://*.tile.openstreetmap.org https://*.carto.com https://maps.geoapify.com https://api.maptiler.com;`,
    `connect-src 'self' https://client.crisp.chat https://crisp.chat https://tidycal.com https://asset-tidycal.b-cdn.net https://carto.com https://basemaps.cartocdn.com https://*.tile.openstreetmap.org https://maps.geoapify.com https://api.maptiler.com https://api.mapbox.com https://www.google-analytics.com https://www.googletagmanager.com;`,
    "font-src 'self' https://fonts.gstatic.com;",
    "frame-src 'self' https://tidycal.com https://client.crisp.chat https://crisp.chat;",
    "object-src 'none';",
    "base-uri 'self';",
    "form-action 'self';",
    "frame-ancestors 'none';",
    "upgrade-insecure-requests;",
  ].join(" ");

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()");
  response.headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");

  return { response, scriptNonce, styleNonce };
