// ======================
// Service ZIP Codes
// ======================
const serviceZips = new Set([
  "33010","33012","33013","33014","33015","33016","33018","33030",
  "33031","33032","33033","33034","33035","33039","33101","33109",
  "33122","33125","33126","33127","33128","33129","33130","33131",
  "33132","33133","33134","33135","33136","33137","33138","33139",
  "33140","33141","33142","33143","33144","33145","33146","33147",
  "33149","33150","33151","33152","33153","33154","33155","33156",
  "33157","33158","33159","33160","33161","33162","33163","33164",
  "33165","33166","33167","33168","33169","33170","33172","33173",
  "33174","33175","33176","33177","33178","33179","33180","33181",
  "33182","33183","33184","33185","33186","33187","33189","33190",
  "33193","33194","33196"
]);

// ======================
// Global Variables
// ======================
let map = null;
let currentMarker = null;

// ======================
// Initialize Map
// ======================
function initMap() {
  const container = document.getElementById('map');
  if (!container || typeof maplibregl === 'undefined') return;

  map = new maplibregl.Map({
    container: 'map',
    style: 'https://tiles.basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    center: [-80.25, 25.76],
    zoom: 10
  });
}

// Retry map initialization until MapLibre loads
function waitForMapLib() {
  if (typeof maplibregl !== 'undefined') {
    initMap();
  } else {
    const interval = setInterval(() => {
      if (typeof maplibregl !== 'undefined') {
        clearInterval(interval);
        initMap();
      }
    }, 50);
  }
}

// ======================
// ZIP Code Coverage
// ======================
function checkCoverage() {
  const zip = document.getElementById("zipInput")?.value.trim();
  const resultEl = document.getElementById("result");
  if (!zip || !resultEl) return;

  if (currentMarker) currentMarker.remove();

  if (serviceZips.has(zip)) {
    resultEl.innerHTML = `✅ We cover ZIP ${zip}! Schedule your free consultation below.`;

    fetch(`https://nominatim.openstreetmap.org/search?postalcode=${zip}&country=USA&format=json`)
      .then(res => res.json())
      .then(data => {
        if (data.length && map) {
          const { lat, lon } = data[0];
          currentMarker = new maplibregl.Marker()
            .setLngLat([parseFloat(lon), parseFloat(lat)])
            .setPopup(new maplibregl.Popup().setText(`ZIP: ${zip}`))
            .addTo(map)
            .togglePopup();

          map.flyTo({ center: [parseFloat(lon), parseFloat(lat)], zoom: 13 });
        }
      })
      .catch(err => console.error("ZIP fetch error:", zip, err));

  } else {
    resultEl.innerHTML = `❌ Sorry, we don’t cover ZIP ${zip} yet.`;
  }
}

// ======================
// Time & Holidays
// ======================
function getEasternTime() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
}

function getNthWeekday(year, month, weekday, n) {
  let date = new Date(year, month, 1), count = 0;
  while (date.getMonth() === month) {
    if (date.getDay() === weekday) {
      count++;
      if (count === n) return new Date(date);
    }
    date.setDate(date.getDate() + 1);
  }
  return null;
}

function getLastWeekday(year, month, weekday) {
  let date = new Date(year, month + 1, 0);
  while (date.getDay() !== weekday) date.setDate(date.getDate() - 1);
  return date;
}

function applyObserved(date) {
  const obs = new Date(date);
  if (obs.getDay() === 6) obs.setDate(obs.getDate() - 1);
  if (obs.getDay() === 0) obs.setDate(obs.getDate() + 1);
  return obs;
}

function getFederalHolidays(year) {
  const holidays = [];
  const add = (date, name, observed=true) => {
    holidays.push({ date: date.toDateString(), name });
    if (observed) {
      const obs = applyObserved(date);
      if (obs.toDateString() !== date.toDateString())
        holidays.push({ date: obs.toDateString(), name: name + " (Observed)" });
    }
  };

  add(new Date(year,0,1),"New Year's Day");
  add(getNthWeekday(year,0,1,3),"Martin Luther King Jr. Day", false);
  add(getNthWeekday(year,1,1,3),"Presidents Day", false);
  add(getLastWeekday(year,4,1),"Memorial Day", false);
  add(new Date(year,5,19),"Juneteenth National Independence Day");
  add(new Date(year,6,4),"Independence Day");
  add(getNthWeekday(year,8,1,1),"Labor Day", false);
  add(getNthWeekday(year,9,1,2),"Columbus Day", false);
  add(new Date(year,10,11),"Veterans Day");
  add(getNthWeekday(year,10,4,4),"Thanksgiving Day", false);
  add(new Date(year,11,25),"Christmas Day");

  return holidays;
}

// ======================
// Business Hours
// ======================
const schedule = {
  1:{openHour:8,openMinute:0,closeHour:17,closeMinute:0},
  2:{openHour:8,openMinute:0,closeHour:17,closeMinute:0},
  3:{openHour:8,openMinute:0,closeHour:17,closeMinute:0},
  4:{openHour:8,openMinute:0,closeHour:17,closeMinute:0},
  5:{openHour:8,openMinute:0,closeHour:17,closeMinute:0},
  6:{openHour:8,openMinute:0,closeHour:12,closeMinute:0}
};

function formatTime(hour24, minute) {
  const h = hour24 % 12 || 12;
  const m = minute.toString().padStart(2,'0');
  return `${h}:${m} ${hour24>=12?'PM':'AM'}`;
}

function getTodayStatus() {
  const now = getEasternTime();
  const day = now.getDay();
  const holidays = getFederalHolidays(now.getFullYear());
  const holiday = holidays.find(h=>h.date===now.toDateString());

  if (holiday) return `We are closed today for ${holiday.name}.`;
  if (day===0) return `We are closed today (Sunday). We'll reopen Monday at ${formatTime(schedule[1].openHour,schedule[1].openMinute)}.`;

  const hours = schedule[day];
  if (!hours) return `We are closed today.`;

  const nowMinutes = now.getHours()*60 + now.getMinutes();
  const openMinutes = hours.openHour*60 + hours.openMinute;
  const closeMinutes = hours.closeHour*60 + hours.closeMinute;

  if (nowMinutes>=openMinutes && nowMinutes<closeMinutes) {
    if (nowMinutes>=closeMinutes-30) return `We're closing soon. We close at ${formatTime(hours.closeHour,hours.closeMinute)}.`;
    return `We are open! We close at ${formatTime(hours.closeHour,hours.closeMinute)}.`;
  } else {
    const nextDay = schedule[day===6?1:day+1];
    return `We are currently closed. We will reopen at ${formatTime(nextDay.openHour,nextDay.openMinute)}.`;
  }
}

function updateStatus() {
  const el = document.getElementById("status-message");
  if (el) el.innerText = getTodayStatus();
}

// ======================
// DOM Ready
// ======================
document.addEventListener("DOMContentLoaded", () => {
  updateStatus();
  setInterval(updateStatus, 60000);

  // ZIP button
  const btn = document.getElementById('check-coverage');
  if (btn) btn.addEventListener('click', checkCoverage);

  // Map
  waitForMapLib();
});
