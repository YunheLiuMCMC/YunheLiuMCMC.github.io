/* Visitors globe for the About page.
   Talks to the Cloudflare Worker (see worker.js) and draws the result with globe.gl.
   If the Worker cannot be reached, the whole section simply stays hidden. */
(function () {
  "use strict";

  // ▼▼▼ The only line you need to edit: your Worker's address, without a trailing slash. ▼▼▼
  var API = "https://visitors.yunheliu17.workers.dev";
  // ▲▲▲

  var DOT = "#ff5a36", RING = "255,90,54";     // coral markers
  var HOME_ALT = 1.75;                          // default camera distance

  var section = document.getElementById("visitors");
  if (!section || API.indexOf("YOUR-WORKER") !== -1) return;
  var el = document.getElementById("globe");
  var box = el.parentElement;
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function place(d) { return d.city === d.country ? d.country : d.city + ", " + d.country; }
  function plural(n, word, many) { return n === 1 ? word : (many || word + "s"); }

  // Count a visit once per browser session; afterwards just read.
  var counted = false;
  try { counted = sessionStorage.getItem("visit-counted") === "1"; } catch (e) {}
  var request = counted ? fetch(API + "/visitors") : fetch(API + "/hit", { method: "POST" });

  request
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      try { sessionStorage.setItem("visit-counted", "1"); } catch (e) {}
      show(data);
    })
    .catch(function () { /* Worker unreachable: leave the section hidden */ });

  function show(data) {
    $("v-visits").textContent = data.visits;
    $("v-visits-l").textContent = plural(data.visits, "visit");
    $("v-cities").textContent = data.cities;
    $("v-cities-l").textContent = plural(data.cities, "city", "cities");
    $("v-countries").textContent = data.countries;
    $("v-countries-l").textContent = plural(data.countries, "country", "countries");

    var recent = $("v-recent");
    if (data.recent && data.recent.length) {
      recent.append("Recently from ");
      data.recent.forEach(function (d, i) {
        if (i) { var s = document.createElement("span"); s.className = "dot"; s.textContent = "·"; recent.append(s); }
        recent.append(place(d));
      });
    } else recent.hidden = true;

    section.hidden = false;

    // Load the 3D library only when the section is about to scroll into view.
    if (!("IntersectionObserver" in window)) return loadGlobe(data);
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); loadGlobe(data); }
    }, { rootMargin: "400px" });
    io.observe(section);
  }

  function loadGlobe(data) {
    var s = document.createElement("script");
    s.src = "js/globe.gl.min.js";
    s.onload = function () { try { draw(data); } catch (e) { box.hidden = true; } };   // no WebGL: keep the text
    s.onerror = function () { box.hidden = true; };
    document.head.appendChild(s);
  }

  function draw(data) {
    var reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    var points = data.points || [];
    var radius = function (k) { return function (d) { return (0.28 + Math.sqrt(d.n) * 0.13) * k; }; };

    var globe = Globe()(el)
      .backgroundColor("rgba(0,0,0,0)")
      .width(el.clientWidth).height(el.clientHeight)
      .globeImageUrl("images/earth-blue-marble.jpg")
      .bumpImageUrl("images/earth-topology.png")
      .showAtmosphere(true).atmosphereColor("#8fbde8").atmosphereAltitude(0.16)
      .pointsData(points).pointLat("lat").pointLng("lng")
      .pointColor(function () { return DOT; })
      .pointAltitude(0.012).pointRadius(radius(1)).pointResolution(18)
      .pointLabel(function (d) { return esc(place(d)) + " · " + d.n + " " + plural(d.n, "visit"); })
      .ringsData(reduceMotion ? [] : (data.recent || []))
      .ringLat("lat").ringLng("lng")
      .ringColor(function () { return function (t) { return "rgba(" + RING + "," + (1 - t) + ")"; }; })
      .ringMaxRadius(5).ringPropagationSpeed(2.2).ringRepeatPeriod(1400)
      .htmlElementsData(points).htmlLat("lat").htmlLng("lng").htmlAltitude(0.02)
      .htmlElement(function (d) {
        var n = document.createElement("div"); n.className = "city-tag";
        var t = document.createElement("span"); t.textContent = d.city; n.append(t); return n;
      });

    // Start just east of the most recent visitor, so the slow rotation carries them across the middle.
    var start = (data.recent && data.recent[0]) || { lat: 26, lng: -85 };
    globe.pointOfView({ lat: Math.max(-50, Math.min(50, start.lat)), lng: start.lng + 25, altitude: HOME_ALT }, 0);

    var controls = globe.controls();
    controls.enableZoom = false;                 // page scroll stays normal until the globe is clicked
    controls.autoRotate = !reduceMotion;
    controls.autoRotateSpeed = 0.55;
    controls.minDistance = 118; controls.maxDistance = 420;

    var alt = function () { return globe.pointOfView().altitude; };
    function zoomBy(f) { globe.pointOfView({ altitude: Math.min(3.2, Math.max(0.18, alt() * f)) }, 350); }
    $("z-in").onclick = function () { zoomBy(0.6); };
    $("z-out").onclick = function () { zoomBy(1.6); };
    $("z-reset").onclick = function () { globe.pointOfView({ altitude: HOME_ALT }, 500); };

    el.addEventListener("pointerdown", function () { controls.enableZoom = true; box.classList.add("used"); });
    el.addEventListener("mouseleave", function () { controls.enableZoom = false; });

    var zoomed = false, scale = 1;
    controls.addEventListener("change", function () {
      var a = alt();
      controls.autoRotate = !reduceMotion && a > 1.6;
      controls.rotateSpeed = Math.min(1, Math.max(0.15, a * 0.5));
      var k = Math.min(1, Math.max(0.2, Math.round(a / HOME_ALT * 8) / 8));   // markers shrink as you zoom in
      if (k !== scale) {
        scale = k;
        globe.pointAltitude(0.012 * k).pointRadius(radius(k)).ringMaxRadius(5 * k).ringPropagationSpeed(2.2 * k);
      }
      var z = a < 1.25;                                                          // city names appear when close
      if (z !== zoomed) { zoomed = z; el.classList.toggle("zoomed", z); }
    });

    addEventListener("resize", function () { globe.width(el.clientWidth).height(el.clientHeight); });

    // Stop rendering while the globe is off screen.
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        entries[0].isIntersecting ? globe.resumeAnimation() : globe.pauseAnimation();
      }).observe(el);
    }
  }
})();
