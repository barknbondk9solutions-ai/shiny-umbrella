import { randomBytes } from "crypto"; // Node.js/Deno crypto

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
      "googlebot", "bingbot", "slurp", "duckduckbot",
      "baiduspider", "yandex", "facebookexternalhit", "twitterbot",
      "linkedinbot", "semrushbot", "ahrefsbot"
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
    const CAPTCHA_PROBABILITY = 0.2; // 20% chance
    let showCaptcha = false;
    let debugData = { clientIP, detected: false, note: "" };

    if (clientIP) {
      const apiKey = Deno.env.get("VPNAPI_KEY");
      if (apiKey) {
        try {
          const resp = await fetch(
            `https://vpnapi.io/api/${clientIP}?key=${apiKey}`
          );
          const data = await resp.json();

          const country = data?.location?.country_code || "Unknown";
          const isVpn = Boolean(data?.security?.vpn);
          const isProxy = Boolean(data?.security?.proxy);
          const isTor = Boolean(data?.security?.tor);
          const isRelay = Boolean(data?.security?.relay);

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

          // ✅ Allow US traffic, including VPNs, but flag them
          if (country === "US") {
            if (isVpn) addVpnHeader = false;

            // 🎯 Randomly select users for CAPTCHA
            if (isVpn && Math.random() < CAPTCHA_PROBABILITY) {
              showCaptcha = true;
            }
          } else {
            // 🚫 Block non-US or high-risk outside US
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

    // ==========================
    // DEBUG ROUTE (Temporary)
    // ==========================
    if (path === "/debug-ip-bark9sol") {
      return new Response(JSON.stringify({
        message: "VPNAPI.io Debug",
        ...debugData
      }, null, 2), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    // ==========================
    // BLOCK OR ALLOW
    // ==========================
    if (blockAccess) {
      return addSecurityHeaders(
        new Response("Access Denied: Non-US or High-Risk Network", { status: 403 })
      );
    }

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
// Helper: Security headers + dynamic CSP + logging
// ==========================
async function addSecurityHeaders(response) {
  // Generate nonces for inline scripts/styles
  const scriptNonce = randomBytes(16).toString("base64");
  const styleNonce = randomBytes(16).toString("base64");

  // Read HTML body
  let html;
  try {
    html = await response.clone().text();
  } catch {
    html = "";
  }

  // Inject nonces into inline scripts/styles
  html = html.replace(
    /<script(?![^>]*src)([^>]*)>/gi,
    `<script$1 nonce="${scriptNonce}">`
  );
  html = html.replace(
    /<style([^>]*)>/gi,
    `<style$1 nonce="${styleNonce}">`
  );

  // Extract all URLs from src/href/srcset
  const srcUrls = [];
  const urlRegex = /(?:src|href|srcset)=["']([^"']+)["']/gi;
  let match;
  while ((match = urlRegex.exec(html)) !== null) {
    srcUrls.push(match[1]);
  }

  // Predefined whitelist for known dynamic services
  const predefined = [
    "'self'",
    "https://cdnjs.cloudflare.com",
    "https://fonts.googleapis.com",
    "https://cdn.jsdelivr.net",
    "https://www.google-analytics.com",
    "https://www.googletagmanager.com",
    "https://cdn.onesignal.com",
    "https://client.crisp.chat",
    "https://asset-tidycal.b-cdn.net",
    "https://unpkg.com",
    "https://*.tile.openstreetmap.org",
    "https://*.carto.com"
  ];

  // Collect unique origins from HTML
  const origins = new Set(predefined);
  srcUrls.forEach(url => {
    try {
      const fullUrl = url.startsWith("http") ? new URL(url) : null;
      if (fullUrl) origins.add(fullUrl.origin);
    } catch {}
  });

  // Log whitelist (optional)
  console.log("===== CSP Whitelisted Origins =====");
  origins.forEach(origin => console.log(origin));
  console.log("===================================");

  // Build dynamic CSP
  const csp = `
    default-src 'self';
    script-src ${[...origins].join(" ")} 'nonce-${scriptNonce}' blob:;
    style-src ${[...origins].join(" ")} 'nonce-${styleNonce}';
    worker-src blob:;
    img-src ${[...origins].join(" ")} data:;
    font-src ${[...origins].join(" ")};
    connect-src ${[...origins].join(" ")};
    frame-src ${[...origins].join(" ")};
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
  `.replace(/\s+/g, " ").trim();

  // Create new response with modified HTML
  response = new Response(html, response);

  // Set security headers
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  response.headers.set("X-Robots-Tag", "index, follow");
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Content-Security-Policy-Nonce-Script", scriptNonce);
  response.headers.set("Content-Security-Policy-Nonce-Style", styleNonce);

  return response;
}
