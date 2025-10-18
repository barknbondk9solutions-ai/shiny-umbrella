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

function addSecurityHeaders(response) {
  // ==========================
  // Standard security headers
  // ==========================
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()");
  response.headers.set("X-Robots-Tag", "index, follow");

  // ==========================
  // Whitelist (Easily extendable)
  // ==========================
  const SCRIPT_WHITELIST = [
    "'self'",
    "'unsafe-inline'",
    "https://www.googletagmanager.com",
    "https://asset-tidycal.b-cdn.net",
    "https://unpkg.com",
    "https://client.crisp.chat",
    "https://www.google.com"
  ];

  const STYLE_WHITELIST = [
    "'self'",
    "'unsafe-inline'",
    "https://unpkg.com",
    "https://fonts.googleapis.com",
    "https://asset-tidycal.b-cdn.net",
    "https://assets.zyrosite.com",
    "https://client.crisp.chat"
  ];

  const CONNECT_WHITELIST = [
    "'self'",
    "https://asset-tidycal.b-cdn.net",
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    "https://basemaps.cartocdn.com",
    "https://tiles.basemaps.cartocdn.com",
    "https://tiles-a.basemaps.cartocdn.com",
    "https://tiles-b.basemaps.cartocdn.com",
    "https://tiles-c.basemaps.cartocdn.com",
    "https://tiles-d.basemaps.cartocdn.com",
    "https://api.sunrise-sunset.org",
    "https://api.weather.gov",
    "https://client.crisp.chat"
  ];

  const FRAME_WHITELIST = [
    "https://tidycal.com",
    "https://client.crisp.chat"
  ];

  const FONT_WHITELIST = [
    "https://fonts.gstatic.com"
  ];

  // ==========================
  // Construct CSP
  // ==========================
  const csp = [
    "default-src 'self';",
    `script-src ${SCRIPT_WHITELIST.join(" ")};`,
    `script-src-elem ${SCRIPT_WHITELIST.join(" ")};`,
    "worker-src 'self' blob:;",
    `style-src ${STYLE_WHITELIST.join(" ")};`,
    `style-src-elem ${STYLE_WHITELIST.join(" ")};`,
    "img-src 'self' data: https://assets.zyrosite.com;",
    `connect-src ${CONNECT_WHITELIST.join(" ")};`,
    `frame-src ${FRAME_WHITELIST.join(" ")};`,
    `font-src ${FONT_WHITELIST.join(" ")};`,
    "object-src 'none';",
    "base-uri 'self';",
    "form-action 'self';",
    "frame-ancestors 'self';",
    "upgrade-insecure-requests;"
  ].join(" ");

  response.headers.set("Content-Security-Policy", csp);
  return response;
}
