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

    // Block if flagged
    if (blockAccess) {
      return addSecurityHeaders(new Response("Access Denied: Non-US or High-Risk Network", { status: 403 }));
    }

    // Continue request
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
// Helper: Security headers + strict auto CSP
// ==========================
async function addSecurityHeaders(response) {
  const scriptNonce = makeNonce();
  const styleNonce = makeNonce();

  let html = "";
  try {
    html = await response.clone().text();
  } catch {}

  // ✅ Auto-detect all resource URLs (script, link, img, iframe)
  const extractOrigins = (regex) => {
    const urls = [...html.matchAll(regex)].map((m) => m[1]);
    return urls
      .map((url) => {
        try {
          return new URL(url).origin;
        } catch {
          return null;
        }
      })
      .filter((o) => o);
  };

  const scripts = extractOrigins(/<script[^>]+src=["']([^"']+)["']/gi);
  const styles = extractOrigins(/<link[^>]+href=["']([^"']+)["']/gi);
  const frames = extractOrigins(/<iframe[^>]+src=["']([^"']+)["']/gi);
  const imgs = extractOrigins(/<img[^>]+src=["']([^"']+)["']/gi);

  const predefined = [
    "'self'",
    "https://client.crisp.chat",
    "https://crisp.chat",
    "https://tidycal.com",
    "https://asset-tidycal.b-cdn.net",
    "https://cdn.jsdelivr.net",
    "https://cdnjs.cloudflare.com",
    "https://unpkg.com",
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
    "https://www.google.com",
    "https://www.gstatic.com",
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    "https://api.maptiler.com",
    "https://api.mapbox.com",
    "https://basemaps.cartocdn.com",
    "https://tile.openstreetmap.org",
  ];

  const origins = new Set([...predefined, ...scripts, ...styles, ...frames, ...imgs]);

  // 🧠 Debug logging for Netlify
  console.log("======== Detected CSP Origins ========");
  console.log("Scripts:", scripts);
  console.log("Styles:", styles);
  console.log("Frames:", frames);
  console.log("Images:", imgs);
  console.log("✅ Final whitelist:", Array.from(origins));
  console.log("======================================");

  // Inject nonces
  const updatedHTML = html
    .replace(/<script(?![^>]*src)/gi, `<script nonce="${scriptNonce}"`)
    .replace(/<style/gi, `<style nonce="${styleNonce}"`);

  // Build strict CSP dynamically
  const originList = Array.from(origins).join(" ");
  const csp = `
    default-src 'self';
    script-src ${originList} 'nonce-${scriptNonce}' blob:;
    style-src ${originList} 'nonce-${styleNonce}' 'unsafe-inline';
    img-src 'self' data: blob: ${originList};
    font-src 'self' ${originList};
    connect-src 'self' ${originList};
    frame-src 'self' ${originList};
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `.replace(/\s+/g, " ").trim();

  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", csp);
  headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-XSS-Protection", "1; mode=block");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");

  return new Response(updatedHTML || await response.text(), {
    status: response.status,
    headers,
  });
}
