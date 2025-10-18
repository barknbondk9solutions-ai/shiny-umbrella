// ======================
// Helper to dynamically load scripts
// ======================
function loadScript(url, async = true, callback) {
  const script = document.createElement('script');
  script.src = url;
  script.async = async;
  if (callback) script.onload = callback;
  document.head.appendChild(script);
}

// ======================
// Google Analytics
// ======================
loadScript("https://www.googletagmanager.com/gtag/js?id=G-6YDTVFLPLH", true, function () {
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
loadScript("https://client.crisp.chat/l.js");

// ======================
// TidyCal Embed
// ======================
loadScript("https://asset-tidycal.b-cdn.net/js/embed.js");



  // Load local dependent scripts
  loadScript('script.obf.js');
  loadScript('ui-widgets.js');
  loadScript('banner.obf.js');
  loadScript('/recap-loader.js');
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
