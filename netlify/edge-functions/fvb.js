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
    // VPNAPI.io GEO + VPN CHECK
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
// Helper: Security headers + hybrid CSP
// ==========================
async function addSecurityHeaders(response) {
  // generate per-request nonces for dynamic scripts/styles
  const scriptNonce = makeNonce();
  const styleNonce = makeNonce();

  // attempt to read HTML
  let html;
  try {
    html = await response.clone().text();
  } catch {
    html = "";
  }

  // inject nonces into inline scripts/styles for dynamic use
  if (html) {
    html = html.replace(
      /<script((?:(?!\b(src|nonce)\b)[\s\S])*?)>([\s\S]*?)<\/script>/gi,
      (m, attrPart, body) => /\b(src|nonce)\b/i.test(attrPart)
        ? m
        : `<script${attrPart} nonce="${scriptNonce}">${body}</script>`
    );

    html = html.replace(
      /<style((?:(?!\bnonce\b)[\s\S])*?)>([\s\S]*?)<\/style>/gi,
      (m, attrPart, body) => /\bnonce\b/i.test(attrPart)
        ? m
        : `<style${attrPart} nonce="${styleNonce}">${body}</style>`
    );
  }

  // auto-detect all external origins from src/href/srcset
  const srcUrls = [];
  const urlRegex = /(?:src|href|srcset)=["']([^"']+)["']/gi;
  let match;
  while ((match = urlRegex.exec(html)) !== null) srcUrls.push(match[1]);

  const origins = new Set(["'self'"]);
  srcUrls.forEach(u => {
    try {
      if (u.startsWith("http")) origins.add(new URL(u).origin);
    } catch {}
  });

  // add predefined trusted origins
  const predefined = [
    "https://cdnjs.cloudflare.com","https://cdn.jsdelivr.net","https://unpkg.com",
    "https://www.google-analytics.com","https://www.googletagmanager.com",
    "https://fonts.googleapis.com","https://fonts.gstatic.com",
    "https://client.crisp.chat","https://crisp.chat","https://tidycal.com","https://asset-tidycal.b-cdn.net",
    "https://basemaps.cartocdn.com","https://api.maptiler.com","https://api.mapbox.com","https://maps.geoapify.com","https://carto.com",
    "https://*.tile.openstreetmap.org","https://*.carto.com",
    "https://api.weather.gov","https://api.sunrise-sunset.org",
    "https://www.google.com","https://www.gstatic.com"
  ];
  predefined.forEach(p => origins.add(p));

  console.log("===== CSP Origins =====", [...origins]);

  // -------------------------
  // Build hybrid CSP
  // -------------------------
  const csp = [
    "default-src 'self';",
    `script-src 'self' 'unsafe-inline' 'nonce-${scriptNonce}' ${[...origins].join(" ")} blob:;`,
    `style-src 'self' 'unsafe-inline' 'nonce-${styleNonce}' ${[...origins].join(" ")};`,
    `img-src 'self' data: blob: ${[...origins].join(" ")};`,
    `connect-src 'self' ${[...origins].join(" ")};`,
    `font-src 'self' https://fonts.gstatic.com;`,
    `frame-src 'self' https://tidycal.com https://client.crisp.chat https://crisp.chat;`,
    "object-src 'none';",
    "base-uri 'self';",
    "form-action 'self';",
    "frame-ancestors 'none';",
    "upgrade-insecure-requests;"
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
}
