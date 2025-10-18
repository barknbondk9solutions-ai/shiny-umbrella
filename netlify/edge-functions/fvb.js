function addSecurityHeaders(response) {
  // Standard security headers
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()");
  response.headers.set("X-Robots-Tag", "index, follow");

  // Whitelists
  const SCRIPT_WHITELIST = [
    "'self'",
    "https://www.googletagmanager.com",
    "https://asset-tidycal.b-cdn.net",
    "https://unpkg.com",
    "https://client.crisp.chat",
    "https://www.google.com",
    "https://www.gstatic.com"
  ];

  const STYLE_WHITELIST = [
    "'self'",
    "'unsafe-inline'",
    "https://unpkg.com",
    "https://fonts.googleapis.com",
    "https://asset-tidycal.b-cdn.net",
    "https://assets.zyrosite.com",
    "https://client.crisp.chat",
    "https://basemaps.cartocdn.com"
  ];

  const FRAME_WHITELIST = [
    "https://tidycal.com",
    "https://*.tidycal.com",
    "https://client.crisp.chat",
    "https://www.google.com"
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
    "https://nominatim.openstreetmap.org",
    "https://api.sunrise-sunset.org",
    "https://api.weather.gov",
    "https://client.crisp.chat",
    "https://www.gstatic.com",
    "https://www.google.com",
    "https://unpkg.com",
    "https://unpkg.com/maplibre-gl/dist/",
    "https://*.tidycal.com",
    "wss://client.relay.crisp.chat"
  ];

  const FONT_WHITELIST = [
    "https://fonts.gstatic.com",
    "https://client.crisp.chat"
  ];

  // Construct CSP
  const csp = [
    "default-src 'self';",
    `script-src ${SCRIPT_WHITELIST.join(" ")};`,
    `script-src-elem ${SCRIPT_WHITELIST.join(" ")};`,
    "worker-src 'self' blob:;",
    `style-src ${STYLE_WHITELIST.join(" ")};`,
    `style-src-elem ${STYLE_WHITELIST.join(" ")};`,
    "img-src 'self' data: https://assets.zyrosite.com https://client.crisp.chat https://image.crisp.chat;",
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
