// Helper to dynamically load scripts
function loadScript(url, async = true, callback) {
  const script = document.createElement('script');
  script.src = url;
  script.async = async;
  if (callback) script.onload = callback;
  document.head.appendChild(script);
}

// Load local scripts
loadScript('script.obf.js', true);
loadScript('ui-widgets.js', true);
loadScript('banner.obf.js', true);
loadScript('/recap-loader.js', true);

// Your other dynamic scripts (GA, Crisp, MapLibre) remain in main.js as well

// ======================
// Helper function to dynamically load scripts
// ======================
function loadExternalScript(url, async = true, callback) {
  const script = document.createElement('script');
  script.src = url;
  script.async = async;
  if (callback) {
    script.onload = callback;
  }
  document.head.appendChild(script);
}

// ======================
// Google Analytics
// ======================
loadExternalScript("https://www.googletagmanager.com/gtag/js?id=G-6YDTVFLPLH", true, function() {
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  gtag('js', new Date());
  gtag('config', 'G-6YDTVFLPLH');
});

// ======================
// Crisp Chat Widget
// ======================
window.$crisp = [];
window.CRISP_WEBSITE_ID = "3414fd4a-ab39-440d-a142-8cf19be43ed1";
loadExternalScript("https://client.crisp.chat/l.js", true);

// ======================
// TidyCal Embed
// ======================
loadExternalScript(
  "https://asset-tidycal.b-cdn.net/js/embed.js",
  true
);

// ======================
// MapLibre
// ======================
loadExternalScript("https://unpkg.com/maplibre-gl/dist/maplibre-gl.js", true, function() {
  // Make sure DOM is ready
  document.addEventListener("DOMContentLoaded", function () {
    if (document.getElementById('map')) {
      const map = new maplibregl.Map({
        container: 'map',
        style: 'https://tiles.basemaps.cartocdn.com/gl/positron-gl-style/style.json',
        center: [-80.2995, 25.82],
        zoom: 10
      });
    }
  });
});

// ======================
// Current Year in Footer
// ======================
document.addEventListener("DOMContentLoaded", function () {
  const yearElement = document.getElementById('current-year');
  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }
});
