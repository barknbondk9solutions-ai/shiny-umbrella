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
loadExternalScript(
  "https://www.googletagmanager.com/gtag/js?id=G-6YDTVFLPLH",
  true,
  function () {
    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    gtag('js', new Date());
    gtag('config', 'G-6YDTVFLPLH');
  }
);

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
loadExternalScript(
  "https://unpkg.com/maplibre-gl/dist/maplibre-gl.js",
  true,
  function () {
    document.addEventListener("DOMContentLoaded", function () {
      const mapEl = document.getElementById('map');
      if (mapEl) {
        const map = new maplibregl.Map({
          container: 'map',
          style: 'https://tiles.basemaps.cartocdn.com/gl/positron-gl-style/style.json',
          center: [-80.2995, 25.82], // Miami-Dade approximate center
          zoom: 10
        });

        // Example: Add a marker if needed
        new maplibregl.Marker().setLngLat([-80.2995, 25.82]).addTo(map);
      }
    });
  }
);

// ======================
// Current Year in Footer
// ======================
document.addEventListener("DOMContentLoaded", function () {
  const yearElement = document.getElementById('current-year');
  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }
});

// ======================
// Optional: ZIP Code Coverage Check (if you have JS for it)
// ======================
document.addEventListener("DOMContentLoaded", function () {
  const zipInput = document.getElementById('zipInput');
  const checkBtn = document.getElementById('check-coverage');
  const resultEl = document.getElementById('result');

  if (zipInput && checkBtn && resultEl) {
    checkBtn.addEventListener('click', function () {
      const zip = zipInput.value.trim();
      if (!zip) {
        resultEl.textContent = "Please enter a ZIP code.";
        return;
      }
      // Example ZIP coverage check logic
      const coveredZips = ["33014", "33126", "33142", "33160"]; // Add all served ZIP codes
      if (coveredZips.includes(zip)) {
        resultEl.textContent = "✅ We serve your neighborhood!";
      } else {
        resultEl.textContent = "❌ Sorry, we do not currently serve your ZIP code.";
      }
    });
  }
});
