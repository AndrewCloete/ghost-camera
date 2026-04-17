const video = document.getElementById("preview");
const ghost = document.getElementById("ghost");
const placeholder = document.getElementById("placeholder");
const file = document.getElementById("file");
const stage = document.getElementById("stage");
const btnCamera = document.getElementById("btn-camera");
const btnCapture = document.getElementById("btn-capture");
const btnStop = document.getElementById("btn-stop");
const btnClear = document.getElementById("btn-clear");
const opacityEl = document.getElementById("opacity");
const scaleEl = document.getElementById("scale");
const mirrorCameraEl = document.getElementById("mirror-camera");
const mirrorEl = document.getElementById("mirror");
const err = document.getElementById("err");
const cameraSelect = document.getElementById("camera-select");
const btnRefreshCameras = document.getElementById("btn-refresh-cameras");
const cameraHint = document.getElementById("camera-hint");
const cameraDebugBody = document.getElementById("camera-debug-body");
const btnCopyDebug = document.getElementById("btn-copy-debug");

const CAMERA_STORAGE_KEY = "ghost-photo-device-id";

/** @type {MediaStream | null} */
let stream = null;
/** @type {boolean} */
let fillingCameraSelect = false;
/** @type {ReturnType<typeof setTimeout>[]} */
let cameraRefreshTimers = [];
/** @type {string | null} */
let ghostObjectUrl = null;

function showError(message) {
  err.textContent = message;
  err.hidden = false;
}

function clearError() {
  err.hidden = true;
  err.textContent = "";
}

function setGhostVisible(hasImage) {
  ghost.classList.toggle("hidden", !hasImage);
  btnClear.hidden = !hasImage;
  placeholder.classList.toggle("hidden", hasImage || stream !== null);
}

function applyVideoMirror() {
  video.classList.toggle("mirrored", mirrorCameraEl.checked);
}

function applyGhostStyles() {
  const o = Number(opacityEl.value) / 100;
  const s = Number(scaleEl.value) / 100;
  const mirror = mirrorEl.checked ? -1 : 1;
  ghost.style.setProperty("--ghost-opacity", String(o));
  ghost.style.setProperty("--ghost-scale", String(s));
  ghost.style.setProperty("--ghost-mirror", String(mirror));
}

function revokeGhostUrl() {
  if (ghostObjectUrl) {
    URL.revokeObjectURL(ghostObjectUrl);
    ghostObjectUrl = null;
  }
}

file.addEventListener("change", () => {
  const f = file.files?.[0];
  if (!f) return;
  clearError();
  revokeGhostUrl();
  ghostObjectUrl = URL.createObjectURL(f);
  ghost.src = ghostObjectUrl;
  ghost.alt = "Reference overlay";
  setGhostVisible(true);
  file.value = "";
});

btnClear.addEventListener("click", () => {
  revokeGhostUrl();
  ghost.removeAttribute("src");
  ghost.alt = "";
  setGhostVisible(false);
});

opacityEl.addEventListener("input", applyGhostStyles);
scaleEl.addEventListener("input", applyGhostStyles);
mirrorCameraEl.addEventListener("change", applyVideoMirror);
mirrorEl.addEventListener("change", applyGhostStyles);

/**
 * @param {string} [deviceId] empty = auto back camera
 */
async function getCameraStream(deviceId) {
  if (deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
        audio: false,
      });
    } catch {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { ideal: deviceId } },
          audio: false,
        });
      } catch {
        /* fall through to auto */
      }
    }
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
  } catch {
    return navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
  }
}

function clearCameraRefreshTimers() {
  for (const t of cameraRefreshTimers) {
    clearTimeout(t);
  }
  cameraRefreshTimers = [];
}

/**
 * deviceId often missing in getSettings() until after first frame on Android;
 * constraints can still hold deviceId when that was used to open the camera.
 * @param {MediaStreamTrack} track
 */
function extractDeviceIdFromTrack(track) {
  const s = track.getSettings?.();
  if (s?.deviceId) {
    const a = String(s.deviceId).trim();
    if (a) return a;
  }

  const cons = track.getConstraints?.();
  const v = cons?.video;
  if (v && typeof v === "object") {
    const d = v.deviceId;
    if (typeof d === "string") {
      const b = d.trim();
      if (b) return b;
    }
    if (d && typeof d === "object") {
      if (typeof d.exact === "string" && d.exact.trim()) return d.exact.trim();
      if (typeof d.ideal === "string" && d.ideal.trim()) return d.ideal.trim();
    }
  }

  try {
    const cap = track.getCapabilities?.();
    const cid = cap?.deviceId;
    if (typeof cid === "string" && cid.trim()) return cid.trim();
  } catch {
    /* optional */
  }

  return "";
}

/**
 * Android: merge enumerateDevices + active track (settings / constraints).
 * @returns {Promise<{ deviceId: string, label: string }[]>}
 */
async function gatherVideoDevicesForPicker() {
  const out = [];
  const seen = new Set();

  function push(id, label) {
    const trimmed = String(id ?? "").trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push({ deviceId: trimmed, label: String(label ?? "").trim() });
  }

  try {
    const raw = await navigator.mediaDevices.enumerateDevices();
    for (const d of raw) {
      if (d.kind !== "videoinput") continue;
      push(d.deviceId, d.label);
    }
  } catch {
    /* enumerate failed */
  }

  if (stream) {
    for (const track of stream.getVideoTracks()) {
      const id = extractDeviceIdFromTrack(track);
      if (id) {
        push(id, track.label);
      }
    }
  }

  return out;
}

function updateCameraHint() {
  if (!cameraHint) return;
  if (!stream) {
    cameraHint.hidden = true;
    cameraHint.textContent = "";
    return;
  }
  const track = stream.getVideoTracks()[0];
  if (!track) {
    cameraHint.hidden = true;
    return;
  }
  const did = extractDeviceIdFromTrack(track);
  const s = track.getSettings?.() || {};
  cameraHint.textContent = did
    ? `deviceId: ${did}`
    : `deviceId not in settings yet — track.id: ${track.id} · ${s.width ?? "?"}×${s.height ?? "?"}`;
  cameraHint.hidden = false;
}

/**
 * Full on-screen snapshot for mobile debugging (enumerate + tracks + env).
 */
async function buildCameraDebugText() {
  const lines = [];
  lines.push(`time: ${new Date().toISOString()}`);
  lines.push(`isSecureContext: ${String(isSecureContext)}`);
  lines.push(`location: ${location.href}`);
  lines.push(`UA: ${navigator.userAgent}`);
  lines.push(
    `mediaDevices: ${String(!!navigator.mediaDevices)} enumerate: ${String(!!navigator.mediaDevices?.enumerateDevices)} getUserMedia: ${String(!!navigator.mediaDevices?.getUserMedia)}`
  );
  lines.push(
    `video.rVFC: ${String(typeof video.requestVideoFrameCallback === "function")} · readyState: ${video.readyState} · ${video.videoWidth}x${video.videoHeight}`
  );
  lines.push("");

  let enumErr = /** @type {string | null} */ (null);
  /** @type {MediaDeviceInfo[]} */
  let enumerated = [];
  try {
    enumerated = await navigator.mediaDevices.enumerateDevices();
  } catch (e) {
    enumErr = e instanceof Error ? e.message : String(e);
  }
  lines.push(`enumerateDevices: count=${enumerated.length}`);
  if (enumErr) {
    lines.push(`enumerateDevices THREW: ${enumErr}`);
  }
  enumerated.forEach((d, i) => {
    const id = String(d.deviceId ?? "");
    const lab = d.label ?? "";
    lines.push(
      `  [${i}] kind=${d.kind} labelLen=${lab.length} idLen=${id.length} label=${lab.slice(0, 40)}${lab.length > 40 ? "…" : ""}`
    );
    if (id.length) {
      lines.push(`       idPrefix=${id.slice(0, 16)}… idSuffix=…${id.slice(-12)}`);
    }
  });
  lines.push("");

  if (stream) {
    lines.push(`MediaStream active=${stream.active} id=${stream.id}`);
    stream.getVideoTracks().forEach((t, i) => {
      lines.push(`videoTrack[${i}] id=${t.id} label=${t.label} state=${t.readyState} muted=${t.muted}`);
      try {
        lines.push(`  getSettings: ${JSON.stringify(t.getSettings())}`);
      } catch (e) {
        lines.push(`  getSettings ERROR: ${e instanceof Error ? e.message : e}`);
      }
      try {
        lines.push(`  getConstraints: ${JSON.stringify(t.getConstraints())}`);
      } catch (e) {
        lines.push(`  getConstraints ERROR: ${e instanceof Error ? e.message : e}`);
      }
      try {
        lines.push(`  getCapabilities: ${JSON.stringify(t.getCapabilities())}`);
      } catch (e) {
        lines.push(`  getCapabilities ERROR: ${e instanceof Error ? e.message : e}`);
      }
    });
  } else {
    lines.push("MediaStream: null");
  }

  lines.push("");
  try {
    const merged = await gatherVideoDevicesForPicker();
    lines.push(`gatherVideoDevicesForPicker (dropdown entries excl. Auto): ${merged.length}`);
    merged.forEach((m, i) => {
      lines.push(`  merged[${i}] idLen=${m.deviceId.length} label=${m.label.slice(0, 48)}`);
    });
  } catch (e) {
    lines.push(`gatherVideoDevicesForPicker ERROR: ${e instanceof Error ? e.message : e}`);
  }
  return lines.join("\n");
}

async function updateCameraDebug() {
  if (!cameraDebugBody) return;
  try {
    cameraDebugBody.textContent = await buildCameraDebugText();
  } catch (e) {
    cameraDebugBody.textContent = `updateCameraDebug failed: ${e instanceof Error ? e.stack || e.message : String(e)}`;
  }
}

btnCopyDebug?.addEventListener("click", async () => {
  const text = cameraDebugBody?.textContent ?? "";
  try {
    await navigator.clipboard.writeText(text);
    clearError();
  } catch {
    showError("Clipboard blocked — select text in the box manually.");
  }
});

function scheduleCameraListRefresh() {
  clearCameraRefreshTimers();
  const delays = [0, 50, 200, 500, 1200, 2500, 4000];
  for (const ms of delays) {
    cameraRefreshTimers.push(setTimeout(() => void refreshCameraList(), ms));
  }
}

async function refreshCameraList() {
  if (!navigator.mediaDevices?.enumerateDevices || !cameraSelect) return;
  fillingCameraSelect = true;
  const prev = cameraSelect.value;
  const saved = sessionStorage.getItem(CAMERA_STORAGE_KEY) || "";
  try {
    cameraSelect.innerHTML = "";
    const auto = document.createElement("option");
    auto.value = "";
    auto.textContent = "Auto (back camera)";
    cameraSelect.append(auto);

    const devices = await gatherVideoDevicesForPicker();
    devices.forEach((d, i) => {
      const opt = document.createElement("option");
      opt.value = d.deviceId;
      opt.textContent = d.label || `Camera ${i + 1}`;
      cameraSelect.append(opt);
    });

    const pick =
      (prev && [...cameraSelect.options].some((o) => o.value === prev) && prev) ||
      (saved && [...cameraSelect.options].some((o) => o.value === saved) && saved) ||
      "";
    cameraSelect.value = pick;
  } finally {
    fillingCameraSelect = false;
    if (cameraSelect.options.length === 0) {
      const fallback = document.createElement("option");
      fallback.value = "";
      fallback.textContent = "Auto (back camera)";
      cameraSelect.append(fallback);
    }
    updateCameraHint();
    void updateCameraDebug();
  }
}

function rememberCameraChoice(deviceId) {
  if (deviceId) {
    sessionStorage.setItem(CAMERA_STORAGE_KEY, deviceId);
  } else {
    sessionStorage.removeItem(CAMERA_STORAGE_KEY);
  }
}

async function attachStream(newStream) {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
  }
  stream = newStream;
  video.srcObject = stream;
  await video.play();
  setCaptureReady();
  scheduleCameraListRefresh();

  if (typeof video.requestVideoFrameCallback === "function") {
    video.requestVideoFrameCallback(() => {
      void refreshCameraList();
      void updateCameraDebug();
    });
  } else {
    video.addEventListener(
      "loadeddata",
      () => {
        void refreshCameraList();
        void updateCameraDebug();
      },
      { once: true }
    );
  }
  void updateCameraDebug();
}

btnCamera.addEventListener("click", async () => {
  clearError();
  if (stream) return;
  try {
    video.setAttribute("playsinline", "");
    video.playsInline = true;
    video.muted = true;
    const id = cameraSelect.value;
    await attachStream(await getCameraStream(id || undefined));
    rememberCameraChoice(id);
    btnCamera.hidden = true;
    btnStop.hidden = false;
    placeholder.classList.add("hidden");
  } catch (e) {
    showError(
      e instanceof Error ? e.message : "Camera unavailable (need HTTPS or permission)."
    );
  }
});

cameraSelect.addEventListener("change", async () => {
  if (fillingCameraSelect) return;
  const id = cameraSelect.value;
  rememberCameraChoice(id);
  if (!stream) return;
  clearError();
  try {
    video.setAttribute("playsinline", "");
    video.playsInline = true;
    video.muted = true;
    await attachStream(await getCameraStream(id || undefined));
  } catch (e) {
    showError(
      e instanceof Error ? e.message : "Could not switch camera."
    );
  }
});

navigator.mediaDevices?.addEventListener?.("devicechange", () => {
  void refreshCameraList();
  void updateCameraDebug();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    void refreshCameraList();
    void updateCameraDebug();
  }
});

btnRefreshCameras?.addEventListener("click", () => {
  clearCameraRefreshTimers();
  void refreshCameraList();
  scheduleCameraListRefresh();
  void updateCameraDebug();
});

void refreshCameraList();
void updateCameraDebug();

window.addEventListener("load", () => {
  void updateCameraDebug();
});

function setCaptureReady() {
  const ready = Boolean(stream && video.videoWidth > 0);
  btnCapture.hidden = !stream;
  btnCapture.disabled = !ready;
}

/**
 * Crop that matches CSS object-fit: cover on #stage vs video intrinsics.
 */
function captureCoverCrop() {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cw = stage.clientWidth;
  const ch = stage.clientHeight;
  if (!vw || !vh || !cw || !ch) return null;

  const scale = Math.max(cw / vw, ch / vh);
  const viewW = cw / scale;
  const viewH = ch / scale;
  const sx = (vw - viewW) / 2;
  const sy = (vh - viewH) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewW));
  canvas.height = Math.max(1, Math.round(viewH));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (mirrorCameraEl.checked) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, sx, sy, viewW, viewH, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function downloadCanvas(canvas) {
  const name = `ghost-photo-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`;
  canvas.toBlob(
    (blob) => {
      if (!blob) {
        showError("Could not encode image.");
        return;
      }
      clearError();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.rel = "noopener";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    },
    "image/jpeg",
    0.92
  );
}

video.addEventListener("loadedmetadata", setCaptureReady);
video.addEventListener("loadeddata", setCaptureReady);
video.addEventListener("playing", setCaptureReady);

btnCapture.addEventListener("click", () => {
  clearError();
  const canvas = captureCoverCrop();
  if (!canvas) {
    showError("Camera not ready yet.");
    return;
  }
  downloadCanvas(canvas);
});

btnStop.addEventListener("click", () => {
  clearCameraRefreshTimers();
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  video.srcObject = null;
  if (cameraHint) {
    cameraHint.hidden = true;
    cameraHint.textContent = "";
  }
  btnCamera.hidden = false;
  btnStop.hidden = true;
  btnCapture.hidden = true;
  btnCapture.disabled = true;
  const hasGhost = Boolean(ghostObjectUrl && ghost.src);
  placeholder.classList.toggle("hidden", hasGhost);
  void refreshCameraList();
  void updateCameraDebug();
});

applyVideoMirror();
applyGhostStyles();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
