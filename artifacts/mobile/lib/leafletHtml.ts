import bundle from "../assets/leaflet/bundle.json";

import { BASE_LAYERS, OVERLAY_LAYERS } from "./mapLayers";

let cached: string | null = null;

export async function getLeafletHtml(): Promise<string> {
  if (cached) return cached;
  const { css, js } = bundle as { css: string; js: string };

  const layerConfigsJson = JSON.stringify({
    base: BASE_LAYERS,
    overlay: OVERLAY_LAYERS,
  });

  cached = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>${css}</style>
<style>
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #ece4d3; }
  .wp-pin {
    background: #c8633a; border: 2px solid #fff; border-radius: 50% 50% 50% 0;
    width: 22px; height: 22px; transform: rotate(-45deg);
    box-shadow: 0 2px 6px rgba(0,0,0,0.35);
    position: relative;
  }
  .wp-pin-poi { background: #2f6b46; }
  .wp-pin-inner {
    width: 8px; height: 8px; background: #fff; border-radius: 50%;
    margin: 5px 0 0 5px;
  }
  .wp-badge {
    position: absolute; top: -6px; right: -8px;
    background: #fff; border-radius: 9px; min-width: 16px; height: 16px;
    font: 9px -apple-system, system-ui, sans-serif; line-height: 16px;
    text-align: center; padding: 0 3px; transform: rotate(45deg);
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  }
  .me-dot {
    background: #2f6b46; border: 3px solid #fff; border-radius: 50%;
    width: 18px; height: 18px; box-shadow: 0 0 0 6px rgba(47,107,70,0.18);
  }
  .plot-vtx {
    background: #3a6ea5; border: 2px solid #fff; border-radius: 50%;
    width: 22px; height: 22px; box-shadow: 0 2px 5px rgba(0,0,0,0.35);
    color: #fff; font: 700 11px -apple-system, system-ui, sans-serif;
    text-align: center; line-height: 18px;
  }
  .plot-vtx-sel {
    background: #c8633a;
    box-shadow: 0 0 0 5px rgba(200,99,58,0.28), 0 2px 5px rgba(0,0,0,0.35);
  }
  .plot-mid {
    background: rgba(255,255,255,0.95); border: 2px dashed #3a6ea5;
    border-radius: 50%; width: 18px; height: 18px;
    color: #3a6ea5; font: 700 13px -apple-system, system-ui, sans-serif;
    text-align: center; line-height: 14px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.3);
  }
  .scale-line { font: 600 11px -apple-system, system-ui, sans-serif !important; }
  .leaflet-control-attribution { font-size: 9px; opacity: 0.75; }
</style>
</head>
<body>
<div id="map"></div>
<script>${js}</script>
<script>
(function(){
  var post = function(msg){
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    }
  };

  var LAYER_CONFIGS = ${layerConfigsJson};
  // Per-layer offline tile manifests: { layerId: { 'z/x/y': dataUrl } }
  window.OfflineTiles = {};
  window.OnlineEnabled = true;

  var BLANK_BASE = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="%23ece4d3"/><g fill="none" stroke="%23ddd2bb" stroke-width="1"><path d="M0 64 H256 M0 128 H256 M0 192 H256 M64 0 V256 M128 0 V256 M192 0 V256"/></g></svg>';
  var BLANK_TRANSPARENT = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"></svg>';

  function resolveUrl(config, z, x, y){
    var sub = '';
    if (config.subdomains && config.subdomains.length){
      sub = config.subdomains[(x + y) % config.subdomains.length];
    }
    return config.urlTemplate
      .replace('{s}', sub)
      .replace('{z}', z)
      .replace('{x}', x)
      .replace('{y}', y);
  }

  function buildLayer(config){
    var blank = config.overlay ? BLANK_TRANSPARENT : BLANK_BASE;
    var Cls = L.TileLayer.extend({
      createTile: function(coords, done){
        var img = document.createElement('img');
        var key = coords.z + '/' + coords.x + '/' + coords.y;
        var bucket = window.OfflineTiles[config.id] || {};
        var cachedUrl = bucket[key];
        var remoteUrl = resolveUrl(config, coords.z, coords.x, coords.y);
        img.onload = function(){ done(null, img); };
        img.onerror = function(){
          if (window.OnlineEnabled){
            img.onerror = function(){ img.src = blank; };
            img.src = remoteUrl;
          } else {
            img.src = blank;
          }
        };
        if (cachedUrl){
          img.src = cachedUrl;
        } else if (window.OnlineEnabled){
          img.src = remoteUrl;
        } else {
          img.src = blank;
        }
        return img;
      }
    });
    var opacity = (typeof config.opacity === 'number')
      ? config.opacity
      : (config.overlay ? 0.85 : 1);
    return new Cls('', {
      maxZoom: config.maxZoom,
      attribution: config.attribution,
      opacity: opacity,
      pane: config.overlay ? 'overlayPane' : 'tilePane'
    });
  }

  var map = L.map('map', { zoomControl: false, attributionControl: true })
    .setView([37.7749, -122.4194], 4);
  L.control.scale({ position: 'bottomleft', imperial: true, metric: true }).addTo(map);
  map.attributionControl.setPrefix('');

  var baseLayers = {};
  var overlayLayers = {};
  Object.keys(LAYER_CONFIGS.base).forEach(function(id){
    baseLayers[id] = buildLayer(LAYER_CONFIGS.base[id]);
  });
  Object.keys(LAYER_CONFIGS.overlay).forEach(function(id){
    overlayLayers[id] = buildLayer(LAYER_CONFIGS.overlay[id]);
  });

  var activeBaseId = 'osm';
  baseLayers[activeBaseId].addTo(map);
  var activeOverlayIds = [];

  function setActiveBase(id){
    if (!baseLayers[id] || id === activeBaseId) return;
    map.removeLayer(baseLayers[activeBaseId]);
    activeBaseId = id;
    baseLayers[activeBaseId].addTo(map);
    // Re-add overlays so they stay on top
    activeOverlayIds.forEach(function(oid){
      if (overlayLayers[oid]){
        overlayLayers[oid].bringToFront();
      }
    });
  }

  function setActiveOverlays(ids){
    var next = {};
    ids.forEach(function(id){ next[id] = true; });
    // Remove ones no longer active
    activeOverlayIds.forEach(function(id){
      if (!next[id] && overlayLayers[id]){
        map.removeLayer(overlayLayers[id]);
      }
    });
    // Add new ones
    ids.forEach(function(id){
      if (overlayLayers[id] && activeOverlayIds.indexOf(id) === -1){
        overlayLayers[id].addTo(map);
      }
    });
    activeOverlayIds = ids.slice();
  }

  function redrawAll(){
    if (baseLayers[activeBaseId]) baseLayers[activeBaseId].redraw();
    activeOverlayIds.forEach(function(id){
      if (overlayLayers[id]) overlayLayers[id].redraw();
    });
  }

  var datasetLayer = L.layerGroup().addTo(map);
  var waypointLayer = L.layerGroup().addTo(map);
  var trackLayer = L.layerGroup().addTo(map);
  var climbLayer = L.layerGroup().addTo(map);
  var plotLayer = L.layerGroup().addTo(map);
  var liveTrackLine = null;
  var meMarker = null;
  var meAccuracy = null;
  window.PlotMode = false;

  function styleFor(color, kind){
    var isRoad = kind === 'road';
    return {
      color: color,
      weight: isRoad ? 2 : 3,
      opacity: 0.85,
      dashArray: isRoad ? '8 5' : null,
      fillColor: color,
      fillOpacity: 0.18
    };
  }

  function renderDatasets(datasets){
    datasetLayer.clearLayers();
    datasets.forEach(function(d){
      if (!d.visible) return;
      try {
        var layer = L.geoJSON(d.geojson, {
          style: styleFor(d.color, d.communityKind),
          pointToLayer: function(feature, latlng){
            var props = (feature && feature.properties) || {};
            if (props._waypointMarker) {
              var badge = props.photoUrl ? '<div class="wp-badge">📷</div>' : '';
              var icon = L.divIcon({
                className: '',
                html: '<div class="wp-pin wp-pin-poi"><div class="wp-pin-inner"></div>' + badge + '</div>',
                iconSize: [22, 22],
                iconAnchor: [11, 22],
                popupAnchor: [0, -24]
              });
              return L.marker(latlng, { icon: icon });
            }
            return L.circleMarker(latlng, {
              radius: 6, color: '#fff', weight: 2,
              fillColor: d.color, fillOpacity: 1
            });
          },
          onEachFeature: function(feature, layer){
            var props = (feature && feature.properties) || {};
            if (props._waypointMarker) {
              // Waypoint dropped during a recording — show a photo popup rather
              // than bridging to the dataset detail sheet.
              var popup = '<div style="font:600 14px -apple-system,system-ui;">' + escapeHtml(props.name || 'Waypoint') + '</div>';
              if (props.notes) {
                popup += '<div style="font:13px -apple-system,system-ui;color:#555;margin-top:4px;">' + escapeHtml(props.notes) + '</div>';
              }
              if (props.photoUrl) {
                popup += '<div style="margin-top:8px;"><img src="' + escapeHtml(props.photoUrl) + '" style="max-width:200px;max-height:150px;border-radius:6px;display:block;" loading="lazy" /></div>';
              }
              layer.bindPopup(popup, { maxWidth: 240 });
              return;
            }
            // Tapping a dataset feature bridges back to React Native so it can
            // show a rich detail sheet (distance, elevation, follow) instead of
            // a basic Leaflet popup. Suppressed while plotting a route.
            layer.on('click', function(){
              if (window.PlotMode) return;
              post({ type:'datasetTap', id: d.id });
            });
          }
        });
        datasetLayer.addLayer(layer);
      } catch(e){}
    });
  }

  function renderWaypoints(waypoints){
    waypointLayer.clearLayers();
    waypoints.forEach(function(w){
      var hasPhoto = !!w.photoUri;
      var hasTrack = !!w.trackId;
      var pinClass = hasTrack ? 'wp-pin wp-pin-poi' : 'wp-pin';
      var badge = hasPhoto ? '<div class="wp-badge">📷</div>' : '';
      var icon = L.divIcon({
        className: '',
        html: '<div class="' + pinClass + '"><div class="wp-pin-inner"></div>' + badge + '</div>',
        iconSize: [22, 22],
        iconAnchor: [11, 22]
      });
      var m = L.marker([w.latitude, w.longitude], { icon: icon });
      var popup = '<div style="font:600 14px -apple-system,system-ui;">' + escapeHtml(w.name) + '</div>' +
        (w.notes ? '<div style="font:13px -apple-system,system-ui;color:#555;margin-top:4px;">' + escapeHtml(w.notes) + '</div>' : '') +
        (hasPhoto ? '<div style="font:11px -apple-system,system-ui;color:#888;margin-top:6px;">📷 photo attached</div>' : '') +
        (hasTrack ? '<div style="font:11px -apple-system,system-ui;color:#c8633a;margin-top:2px;">↳ on a recorded track</div>' : '') +
        '<div style="font:11px -apple-system,system-ui;color:#888;margin-top:6px;">' + w.latitude.toFixed(5) + ', ' + w.longitude.toFixed(5) + '</div>';
      m.bindPopup(popup);
      waypointLayer.addLayer(m);
    });
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  function setMe(loc){
    if (!loc){
      if (meMarker){ map.removeLayer(meMarker); meMarker = null; }
      if (meAccuracy){ map.removeLayer(meAccuracy); meAccuracy = null; }
      return;
    }
    var ll = [loc.latitude, loc.longitude];
    if (!meMarker){
      var icon = L.divIcon({ className:'', html:'<div class="me-dot"></div>', iconSize:[18,18], iconAnchor:[9,9] });
      meMarker = L.marker(ll, { icon: icon, interactive: false }).addTo(map);
    } else {
      meMarker.setLatLng(ll);
    }
    if (loc.accuracy && loc.accuracy > 0){
      if (!meAccuracy){
        meAccuracy = L.circle(ll, { radius: loc.accuracy, color:'#2f6b46', weight:1, fillColor:'#2f6b46', fillOpacity:0.08, interactive:false }).addTo(map);
      } else {
        meAccuracy.setLatLng(ll);
        meAccuracy.setRadius(loc.accuracy);
      }
    }
  }

  function fitBounds(b){
    if (!b) return;
    var sw = L.latLng(b[1], b[0]);
    var ne = L.latLng(b[3], b[2]);
    map.fitBounds(L.latLngBounds(sw, ne), { padding:[30,30], maxZoom: 16 });
  }

  function flyTo(lat, lng, zoom){
    map.flyTo([lat, lng], zoom || Math.max(map.getZoom(), 14), { duration: 0.6 });
  }

  // Long-press to add waypoint
  var pressTimer = null;
  var pressLatLng = null;
  map.on('mousedown touchstart', function(e){
    if (window.PlotMode) return;
    pressLatLng = e.latlng;
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = setTimeout(function(){
      if (pressLatLng){
        post({ type:'longpress', lat: pressLatLng.lat, lng: pressLatLng.lng });
      }
    }, 600);
  });
  map.on('mouseup touchend touchmove mousemove dragstart movestart', function(){
    if (pressTimer){ clearTimeout(pressTimer); pressTimer = null; }
  });

  // Single tap adds a vertex while plotting a route.
  map.on('click', function(e){
    if (!window.PlotMode) return;
    post({ type:'plotTap', lat: e.latlng.lat, lng: e.latlng.lng });
  });

  function setPlotMode(enabled){
    window.PlotMode = !!enabled;
    if (!window.PlotMode) plotLayer.clearLayers();
  }

  var plotPolyline = null;
  var plotVertexMarkers = [];

  // Keep the route line glued to the vertices while one is being dragged so the
  // user gets live visual feedback; the authoritative move is posted on dragend.
  function syncPlotPolyline(){
    if (!plotPolyline) return;
    plotPolyline.setLatLngs(plotVertexMarkers.map(function(m){ return m.getLatLng(); }));
  }

  function renderPlot(points, selectedIndex){
    plotLayer.clearLayers();
    plotPolyline = null;
    plotVertexMarkers = [];
    var sel = (typeof selectedIndex === 'number') ? selectedIndex : -1;
    if (!points || points.length === 0) return;
    var latlngs = points.map(function(p){ return [p.lat, p.lng]; });
    if (latlngs.length >= 2){
      plotPolyline = L.polyline(latlngs, { color: '#3a6ea5', weight: 4, opacity: 0.95 })
        .addTo(plotLayer);
      // "+" handles at each segment midpoint to insert a vertex between two points.
      for (var i = 0; i < points.length - 1; i++){
        (function(idx){
          var a = points[idx], b = points[idx + 1];
          var micon = L.divIcon({
            className: '',
            html: '<div class="plot-mid">+</div>',
            iconSize: [18, 18],
            iconAnchor: [9, 9]
          });
          var mm = L.marker([(a.lat + b.lat) / 2, (a.lng + b.lng) / 2], {
            icon: micon, interactive: true, keyboard: false
          });
          mm.on('click', function(e){
            post({ type:'plotInsert', index: idx, lat: e.latlng.lat, lng: e.latlng.lng });
          });
          mm.addTo(plotLayer);
        })(i);
      }
    }
    points.forEach(function(p, i){
      var cls = 'plot-vtx' + (i === sel ? ' plot-vtx-sel' : '');
      var icon = L.divIcon({
        className: '',
        html: '<div class="' + cls + '">' + (i + 1) + '</div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      });
      var marker = L.marker([p.lat, p.lng], {
        icon: icon, draggable: true, interactive: true, keyboard: false
      });
      (function(idx){
        var moved = false;
        marker.on('dragstart', function(){ moved = false; });
        marker.on('drag', function(){ moved = true; syncPlotPolyline(); });
        marker.on('dragend', function(){
          var ll = marker.getLatLng();
          if (moved){
            post({ type:'plotMove', index: idx, lat: ll.lat, lng: ll.lng });
          }
        });
        marker.on('click', function(){
          if (moved) { moved = false; return; }
          post({ type:'plotVertexTap', index: idx });
        });
      })(i);
      marker.addTo(plotLayer);
      plotVertexMarkers.push(marker);
    });
  }

  map.on('moveend zoomend', function(){
    var c = map.getCenter();
    var b = map.getBounds();
    post({
      type:'view',
      lat: c.lat, lng: c.lng, zoom: map.getZoom(),
      bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
    });
  });

  // Pixel distance from point p to segment [a, b] (all L.Point objects).
  function ptSegDist(p, a, b){
    var dx = b.x - a.x, dy = b.y - a.y;
    if (dx === 0 && dy === 0) return Math.sqrt((p.x-a.x)*(p.x-a.x)+(p.y-a.y)*(p.y-a.y));
    var t = ((p.x-a.x)*dx + (p.y-a.y)*dy) / (dx*dx + dy*dy);
    t = Math.max(0, Math.min(1, t));
    var nx = a.x + t*dx - p.x, ny = a.y + t*dy - p.y;
    return Math.sqrt(nx*nx + ny*ny);
  }

  // Returns ids of every track whose polyline passes within threshold pixels of latlng.
  function nearbyTrackIds(latlng){
    var threshold = 12;
    var cp = map.latLngToLayerPoint(latlng);
    var ids = [];
    trackLayer.eachLayer(function(layer){
      if (!layer._trackId) return;
      var lls = layer.getLatLngs();
      for (var i = 1; i < lls.length; i++){
        var a = map.latLngToLayerPoint(lls[i-1]);
        var b = map.latLngToLayerPoint(lls[i]);
        if (ptSegDist(cp, a, b) < threshold){ ids.push(layer._trackId); break; }
      }
    });
    return ids;
  }

  function renderTracks(tracks){
    trackLayer.clearLayers();
    tracks.forEach(function(t){
      if (!t.points || t.points.length < 2) return;
      var latlngs = t.points.map(function(p){ return [p.lat, p.lng]; });
      var origColor = t.color || '#c8633a';
      var line = L.polyline(latlngs, { color: origColor, weight: 4, opacity: 0.9 });
      line._trackId = t.id;
      line._origColor = origColor;
      line.on('click', function(e){
        if (window.PlotMode) return;
        L.DomEvent.stopPropagation(e);
        post({ type: 'trackTap', ids: nearbyTrackIds(e.latlng) });
      });
      trackLayer.addLayer(line);
    });
  }

  function highlightTrack(id){
    trackLayer.eachLayer(function(layer){
      if (!layer._trackId) return;
      if (id && layer._trackId === id){
        layer.setStyle({ color: '#e8821a', weight: 6, opacity: 1 });
        layer.bringToFront();
      } else {
        layer.setStyle({ color: layer._origColor, weight: 4, opacity: 0.9 });
      }
    });
  }

  function setLiveTrack(points){
    if (liveTrackLine){ map.removeLayer(liveTrackLine); liveTrackLine = null; }
    if (!points || points.length < 2) return;
    var latlngs = points.map(function(p){ return [p.lat, p.lng]; });
    liveTrackLine = L.polyline(latlngs, {
      color: '#c8633a', weight: 5, opacity: 0.95, dashArray: '1, 8'
    }).addTo(map);
    liveTrackLine.bindTooltip('Recorded path', {sticky:true});
  }

  var liveFollowedRouteLine = null;
  function setLiveFollowedRoute(route){
    if (liveFollowedRouteLine){ map.removeLayer(liveFollowedRouteLine); liveFollowedRouteLine = null; }
    if (!route || !route.points || route.points.length < 2) return;
    var latlngs = route.points.map(function(p){ return [p.lat, p.lng]; });
    liveFollowedRouteLine = L.polyline(latlngs, {
      color: '#315e43', weight: 3, opacity: 0.58, dashArray: '7, 8', interactive: false
    }).addTo(map);
    liveFollowedRouteLine.bindTooltip(route.name || 'Followed trail', {permanent:true, direction:'top'});
  }

  // Highlight a point on a route while the user scrubs the elevation profile.
  var elevMarker = null;
  function setElevationMarker(loc){
    if (elevMarker){ map.removeLayer(elevMarker); elevMarker = null; }
    if (!loc) return;
    elevMarker = L.circleMarker([loc.lat, loc.lng], {
      radius: 8, color: '#ffffff', weight: 3,
      fillColor: '#3a6ea5', fillOpacity: 1, interactive: false
    }).addTo(map);
  }

  // Emphasize the next significant climb ahead on a followed route. Draws a
  // glowing casing under a bright "heat" line (#d6453d, mirrored in
  // ElevationProfile's climb shading) plus a dot at the climb's base so the
  // hiker can see where the effort begins.
  function setClimbHighlight(path){
    climbLayer.clearLayers();
    if (!path || path.length < 2) return;
    var latlngs = path.map(function(p){ return [p.lat, p.lng]; });
    L.polyline(latlngs, {
      color:'#d6453d', weight:11, opacity:0.22,
      lineCap:'round', lineJoin:'round', interactive:false
    }).addTo(climbLayer);
    L.polyline(latlngs, {
      color:'#d6453d', weight:5, opacity:0.95,
      lineCap:'round', lineJoin:'round', interactive:false
    }).addTo(climbLayer);
    L.circleMarker(latlngs[0], {
      radius:6, color:'#ffffff', weight:2,
      fillColor:'#d6453d', fillOpacity:1, interactive:false
    }).addTo(climbLayer);
  }

  window.FM = {
    renderDatasets: renderDatasets,
    renderWaypoints: renderWaypoints,
    renderTracks: renderTracks,
    highlightTrack: highlightTrack,
    setLiveTrack: setLiveTrack,
    setLiveFollowedRoute: setLiveFollowedRoute,
    setElevationMarker: setElevationMarker,
    setClimbHighlight: setClimbHighlight,
    setPlotMode: setPlotMode,
    renderPlot: renderPlot,
    setMe: setMe,
    fitBounds: fitBounds,
    flyTo: flyTo,
    setActiveBase: setActiveBase,
    setActiveOverlays: setActiveOverlays,
    setOfflineTiles: function(manifest){
      // manifest = { layerId: { 'z/x/y': dataUrl } }
      window.OfflineTiles = manifest || {};
      redrawAll();
    },
    setOnlineEnabled: function(v){
      window.OnlineEnabled = !!v;
      redrawAll();
    },
    invalidate: function(){ map.invalidateSize(); }
  };

  post({ type:'ready' });
})();
</script>
</body>
</html>`;
  return cached;
}
