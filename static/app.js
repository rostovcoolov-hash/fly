/* No API keys required. Put your direct model URL here. */
const AIRCRAFT_MODEL_URL = "https://raw.githubusercontent.com/kristimsu-beep/pinnogram/main/games/airbus_a320_s7_airlines.glb";
const $ = (id) => document.getElementById(id);

const state = {
  lat: 51.47, lon: -0.4543, altitude: 3000, speed: 120, heading: 90,
  pitch: 0, bank: 0, throttle: 0.42, verticalSpeed: 0,
  destination: null, camera: localStorage.getItem("wfs-camera") || "chase",
  keys: {}, lastTime: performance.now(), modelLoaded: false
};

const viewer = new Cesium.Viewer("globe", {
  animation: false,
  timeline: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  infoBox: false,
  selectionIndicator: false,
  fullscreenButton: false,
  shouldAnimate: true,
  terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  imageryProvider: false
});

viewer.scene.globe.show = true;
viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#162536");
viewer.scene.globe.enableLighting = true;
viewer.scene.globe.showGroundAtmosphere = true;
viewer.scene.skyAtmosphere.show = true;
viewer.scene.fog.enabled = true;
viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#020711");

viewer.scene.screenSpaceCameraController.minimumZoomDistance = 20;
viewer.scene.screenSpaceCameraController.maximumZoomDistance = 40000000;

// Спутниковые снимки Esri
const satelliteLayer = new Cesium.UrlTemplateImageryProvider({
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  credit: "Imagery © Esri and its data providers",
  minimumLevel: 0,
  maximumLevel: 19
});

viewer.imageryLayers.addImageryProvider(satelliteLayer);

// Подключаем глобальный 3D-рельеф
(async () => {
  const badge = document.querySelector(".bottom-left");

  try {
    const terrain = await Cesium.CesiumTerrainProvider.fromUrl(
      "https://terrain.reearth.land/cesium-mesh/ellipsoid",
      {
        requestVertexNormals: true,
        requestWaterMask: true
      }
    );

    viewer.terrainProvider = terrain;

    if (badge) {
      badge.innerHTML =
        '<span class="live-dot"></span> SIMULATION RUNNING <span class="separator">|</span> TERRAIN: GLOBAL 3D';
    }
  } catch (error) {
    console.error("Terrain loading failed:", error);

    if (badge) {
      badge.innerHTML =
        '<span class="live-dot"></span> SIMULATION RUNNING <span class="separator">|</span> TERRAIN: SATELLITE GLOBE';
    }
  }
})();

let aircraftEntity;
function aircraftOrientation() {
  return Cesium.Transforms.headingPitchRollQuaternion(
    Cesium.Cartesian3.fromDegrees(state.lon, state.lat, Math.max(20, state.altitude * 0.3048)),
    new Cesium.HeadingPitchRoll(
      Cesium.Math.toRadians(state.heading),
      Cesium.Math.toRadians(state.pitch),
      Cesium.Math.toRadians(state.bank)
    )
  );
}
function makeFallbackAircraft() {
  // Entity anchors the flight position; the GLB is loaded separately as a scene primitive.
  return new Cesium.Entity({
    position: Cesium.Cartesian3.fromDegrees(state.lon, state.lat, state.altitude * 0.3048),
    orientation: aircraftOrientation()
  });
}
aircraftEntity = makeFallbackAircraft();
viewer.entities.add(aircraftEntity);
viewer.flyTo(aircraftEntity, {duration: 0.1}).catch(()=>{});
$("model-state").textContent = "Loading A320 model…";

let aircraftModel = null;
function aircraftModelMatrix() {
  return Cesium.Transforms.headingPitchRollToFixedFrame(
    Cesium.Cartesian3.fromDegrees(state.lon, state.lat, Math.max(20, state.altitude * 0.3048)),
    new Cesium.HeadingPitchRoll(
      Cesium.Math.toRadians(state.heading),
      Cesium.Math.toRadians(state.pitch),
      Cesium.Math.toRadians(state.bank)
    )
  );
}
(async () => {
  try {
    aircraftModel = await Cesium.Model.fromGltfAsync({
      url: AIRCRAFT_MODEL_URL,
      modelMatrix: aircraftModelMatrix(),
      scale: 1,
      minimumPixelSize: 72,
      maximumScale: 9000,
      allowPicking: false
    });
    viewer.scene.primitives.add(aircraftModel);
    state.modelLoaded = true;
    $("model-state").textContent = "A320 loaded";
  } catch (err) {
    console.warn("Aircraft model failed to load", err);
    $("model-state").textContent = "Model unavailable — marker shown";
    makeSimplePlaneMarker();
  }
})();

function makeSimplePlaneMarker() {
  // A visible marker is used if the external GLB cannot be loaded.
  if (viewer.entities.getById("fallback-plane")) return;
  viewer.entities.add({
    id: "fallback-plane",
    position: new Cesium.CallbackProperty(() => Cesium.Cartesian3.fromDegrees(state.lon, state.lat, state.altitude * 0.3048), false),
    point: { pixelSize: 12, color: Cesium.Color.CYAN, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
    label: { text: "✈", font: "24px sans-serif", fillColor: Cesium.Color.WHITE, pixelOffset: new Cesium.Cartesian2(0,-20), showBackground: true, backgroundColor: Cesium.Color.fromBytes(4,20,34,180) }
  });
}

function setCamera(mode, instant=false) {
  state.camera = mode;
  localStorage.setItem("wfs-camera", mode);
  $("chase").classList.toggle("active", mode === "chase");
  $("cockpit").classList.toggle("active", mode === "cockpit");
  if (mode === "cockpit") {
    const p = Cesium.Cartesian3.fromDegrees(state.lon, state.lat, state.altitude*0.3048);
    viewer.camera.lookAt(p, new Cesium.HeadingPitchRange(Cesium.Math.toRadians(state.heading), Cesium.Math.toRadians(-4), 8));
  } else {
    const p = Cesium.Cartesian3.fromDegrees(state.lon, state.lat, state.altitude*0.3048);
    viewer.camera.lookAt(p, new Cesium.HeadingPitchRange(Cesium.Math.toRadians(state.heading+180), Cesium.Math.toRadians(-18), 1300));
  }
}
$("chase").addEventListener("click", ()=>setCamera("chase"));
$("cockpit").addEventListener("click", ()=>setCamera("cockpit"));

function normalizeHeading(v) { return (v % 360 + 360) % 360; }
function updateFlight(dt) {
  const k = state.keys;
  if (k.KeyA || k.ArrowLeft || k.bankLeft) state.bank = Math.max(-38, state.bank - 42*dt);
  else if (k.KeyD || k.ArrowRight || k.bankRight) state.bank = Math.min(38, state.bank + 42*dt);
  else state.bank *= Math.pow(0.94, dt*60);
  if (k.KeyW || k.ArrowUp || k.pitchUp) state.pitch = Math.min(18, state.pitch + 14*dt);
  else if (k.KeyS || k.ArrowDown || k.pitchDown) state.pitch = Math.max(-12, state.pitch - 14*dt);
  else state.pitch *= Math.pow(0.95, dt*60);
  if (k.KeyQ) state.heading -= 35*dt;
  if (k.KeyE) state.heading += 35*dt;
  if (k.ShiftLeft || k.ShiftRight || k.throttleUp) state.throttle = Math.min(1, state.throttle + .25*dt);
  if (k.ControlLeft || k.ControlRight || k.throttleDown) state.throttle = Math.max(.08, state.throttle - .25*dt);

  state.heading = normalizeHeading(state.heading - Math.sin(Cesium.Math.toRadians(state.bank))*state.speed/150*dt*20);
  const targetSpeed = 45 + state.throttle*260;
  state.speed += (targetSpeed-state.speed)*Math.min(1, dt*.25);
  state.verticalSpeed = Math.sin(Cesium.Math.toRadians(state.pitch))*state.speed*35;
  state.altitude = Math.max(150, Math.min(39000, state.altitude + state.verticalSpeed*dt/60));
  const distanceNm = state.speed * dt / 3600;
  const latRad = Cesium.Math.toRadians(state.lat);
  state.lat += (distanceNm * Math.cos(Cesium.Math.toRadians(state.heading)) / 60);
  state.lon += (distanceNm * Math.sin(Cesium.Math.toRadians(state.heading)) / Math.max(0.1, 60*Math.cos(latRad)));
  state.lon = ((state.lon + 180) % 360 + 360) % 360 - 180;
  aircraftEntity.position = Cesium.Cartesian3.fromDegrees(state.lon, state.lat, state.altitude*0.3048);
  aircraftEntity.orientation = aircraftOrientation();
  if (aircraftModel) aircraftModel.modelMatrix = aircraftModelMatrix();
  if (state.camera === "chase") {
    const p = Cesium.Cartesian3.fromDegrees(state.lon, state.lat, state.altitude*0.3048);
    viewer.camera.lookAt(p, new Cesium.HeadingPitchRange(Cesium.Math.toRadians(state.heading+180), Cesium.Math.toRadians(-18), Math.max(600, state.speed*8)));
  } else {
    const p = Cesium.Cartesian3.fromDegrees(state.lon, state.lat, state.altitude*0.3048);
    viewer.camera.lookAt(p, new Cesium.HeadingPitchRange(Cesium.Math.toRadians(state.heading), Cesium.Math.toRadians(-4), 8));
  }
  renderHud();
}
function renderHud() {
  $("speed").textContent = Math.round(state.speed);
  $("altitude").textContent = Math.round(state.altitude).toLocaleString("en-US");
  $("heading").textContent = String(Math.round(state.heading)).padStart(3,"0");
  $("vertical").textContent = Math.round(state.verticalSpeed).toLocaleString("en-US");
  $("position").textContent = `${Math.abs(state.lat).toFixed(4)}° ${state.lat>=0?"N":"S"}, ${Math.abs(state.lon).toFixed(4)}° ${state.lon>=0?"E":"W"}`;
}
function frame(now) {
  const dt = Math.min(.05, (now-state.lastTime)/1000);
  state.lastTime = now;
  updateFlight(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener("keydown", e => {
  if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
  state.keys[e.code] = true;
});
window.addEventListener("keyup", e => { state.keys[e.code] = false; });
document.querySelectorAll("[data-control]").forEach(btn => {
  const key = btn.dataset.control;
  const down = e => { e.preventDefault(); state.keys[key] = true; };
  const up = e => { e.preventDefault(); state.keys[key] = false; };
  btn.addEventListener("pointerdown", down);
  ["pointerup","pointerleave","pointercancel"].forEach(ev=>btn.addEventListener(ev,up));
});

async function searchPlace(query) {
  const coord = query.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)$/);
  if (coord) {
    const lat = Number(coord[1]), lon = Number(coord[2]);
    if (Math.abs(lat)>90 || Math.abs(lon)>180) throw new Error("Coordinates are out of range.");
    setDestination(lat, lon, `${lat.toFixed(4)}, ${lon.toFixed(4)}`); return;
  }
  $("status").textContent = "SEARCHING LOCATION…";
  const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" + encodeURIComponent(query);
  const res = await fetch(url, {headers: {"Accept":"application/json"}});
  if (!res.ok) throw new Error("Location search service is temporarily unavailable.");
  const data = await res.json();
  if (!data.length) throw new Error("No matching location found.");
  setDestination(Number(data[0].lat), Number(data[0].lon), data[0].display_name.split(",").slice(0,2).join(","));
}
function setDestination(lat,lon,name) {
  state.destination = {lat,lon,name};
  $("destination-label").textContent = "DESTINATION · " + name;
  viewer.entities.removeById("destination-pin");
  viewer.entities.add({id:"destination-pin",position:Cesium.Cartesian3.fromDegrees(lon,lat,0),point:{pixelSize:10,color:Cesium.Color.fromCssColorString("#ffb45c"),outlineColor:Cesium.Color.WHITE,outlineWidth:2},label:{text:name,font:"12px sans-serif",fillColor:Cesium.Color.WHITE,showBackground:true,backgroundColor:Cesium.Color.fromBytes(7,20,32,200),pixelOffset:new Cesium.Cartesian2(0,-18)}});
  $("status").textContent = "DESTINATION SET";
  viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(lon,lat,Math.max(180000,state.altitude*10)),duration:1.5});
}
$("search-form").addEventListener("submit", async e=>{
  e.preventDefault(); const q=$("place").value.trim(); if(!q)return;
  try { await searchPlace(q); } catch(err) { $("status").textContent = err.message; }
});
document.querySelectorAll(".quick button").forEach(btn=>btn.addEventListener("click",()=>setDestination(Number(btn.dataset.lat),Number(btn.dataset.lon),btn.dataset.name)));

window.addEventListener("beforeunload",()=>localStorage.setItem("wfs-last-location",JSON.stringify({lat:state.lat,lon:state.lon,altitude:state.altitude,heading:state.heading})));
setCamera(state.camera, true);
renderHud();
                                                                                       
