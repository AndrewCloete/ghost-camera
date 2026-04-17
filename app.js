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
const exifPanel = document.getElementById("exif-panel");
const exifDl = document.getElementById("exif-dl");
const exifEmpty = document.getElementById("exif-empty");
const cameraSelect = document.getElementById("camera-select");

const CAMERA_STORAGE_KEY = "ghost-photo-device-id";

/** @type {MediaStream | null} */
let stream = null;
/** @type {boolean} */
let fillingCameraSelect = false;
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

/* global exifr */
const exifrLib = typeof globalThis.exifr !== "undefined" ? globalThis.exifr : undefined;

const EXIF_ROWS = [
  ["Make", "Camera make"],
  ["Model", "Camera model"],
  ["LensMake", "Lens make"],
  ["LensModel", "Lens"],
  ["FocalLength", "Focal length"],
  ["FocalLengthIn35mmFormat", "Focal length (35mm)"],
  ["FNumber", "Aperture"],
  ["ExposureTime", "Shutter"],
  ["ISO", "ISO"],
  ["ExposureProgram", "Exposure program"],
  ["ExposureMode", "Exposure mode"],
  ["ExposureCompensation", "Exposure compensation"],
  ["MeteringMode", "Metering"],
  ["WhiteBalance", "White balance"],
  ["Flash", "Flash"],
  ["DateTimeOriginal", "Date (original)"],
  ["CreateDate", "Date (created)"],
  ["ModifyDate", "Date (modified)"],
  ["Orientation", "Orientation"],
];

function formatExifValue(key, val) {
  if (Array.isArray(val) && val.length > 0) {
    val = val[0];
  }
  if (val == null || val === "") return null;
  if (typeof val === "object" && val instanceof Date) {
    return val.toLocaleString();
  }
  if (key === "FNumber" && typeof val === "number") {
    const n = val % 1 ? val.toFixed(1) : String(val);
    return `f/${n}`;
  }
  if (key === "ExposureTime" && typeof val === "number") {
    if (val >= 1) return `${val}s`;
    const inv = Math.round(1 / val);
    return inv > 0 ? `1/${inv}s` : String(val);
  }
  if (
    (key === "FocalLength" || key === "FocalLengthIn35mmFormat") &&
    typeof val === "number"
  ) {
    const n = val % 1 ? val.toFixed(1) : String(val);
    return `${n} mm`;
  }
  if (typeof val === "number" && Number.isFinite(val)) {
    return String(val);
  }
  return String(val);
}

function clearExifPanel() {
  exifDl.innerHTML = "";
  exifEmpty.hidden = true;
  exifEmpty.textContent = "";
  exifPanel.hidden = true;
}

function showExifMessage(message) {
  exifDl.innerHTML = "";
  exifEmpty.textContent = message;
  exifEmpty.hidden = false;
  exifPanel.hidden = false;
}

function renderExifData(data) {
  exifEmpty.hidden = true;
  exifDl.innerHTML = "";
  for (const [key, label] of EXIF_ROWS) {
    if (!(key in data)) continue;
    const formatted = formatExifValue(key, data[key]);
    if (formatted == null) continue;
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = formatted;
    exifDl.append(dt, dd);
  }
  if (data.latitude != null && data.longitude != null) {
    const dt = document.createElement("dt");
    dt.textContent = "GPS";
    const dd = document.createElement("dd");
    dd.textContent = `${data.latitude.toFixed(5)}, ${data.longitude.toFixed(5)}`;
    exifDl.append(dt, dd);
  }
  if (!exifDl.children.length) {
    showExifMessage("No camera fields in EXIF (stripped or minimal).");
    return;
  }
  exifPanel.hidden = false;
}

async function loadExifForFile(f) {
  clearExifPanel();
  if (!exifrLib) {
    showExifMessage("EXIF library missing.");
    return;
  }
  try {
    const data = await exifrLib.parse(f, { mergeOutput: true });
    if (!data || typeof data !== "object") {
      showExifMessage("No EXIF in file (or stripped).");
      return;
    }
    const keys = Object.keys(data).filter((k) => k !== "errors");
    if (keys.length === 0) {
      showExifMessage("No EXIF in file (or stripped).");
      return;
    }
    renderExifData(data);
  } catch {
    showExifMessage("No EXIF (unsupported format like PNG, or stripped).");
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
  void loadExifForFile(f);
  file.value = "";
});

btnClear.addEventListener("click", () => {
  revokeGhostUrl();
  ghost.removeAttribute("src");
  ghost.alt = "";
  setGhostVisible(false);
  clearExifPanel();
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

function scheduleCameraListRefresh() {
  void refreshCameraList();
  setTimeout(() => void refreshCameraList(), 150);
  setTimeout(() => void refreshCameraList(), 500);
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

    try {
      const raw = await navigator.mediaDevices.enumerateDevices();
      const devices = raw.filter((d) => {
        if (d.kind !== "videoinput") return false;
        const id = typeof d.deviceId === "string" ? d.deviceId.trim() : "";
        return id.length > 0;
      });
      devices.forEach((d, i) => {
        const opt = document.createElement("option");
        opt.value = d.deviceId.trim();
        const label = d.label?.trim();
        opt.textContent = label || `Camera ${i + 1}`;
        cameraSelect.append(opt);
      });
    } catch {
      /* keep Auto only */
    }

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
});

void refreshCameraList();

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
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  video.srcObject = null;
  btnCamera.hidden = false;
  btnStop.hidden = true;
  btnCapture.hidden = true;
  btnCapture.disabled = true;
  const hasGhost = Boolean(ghostObjectUrl && ghost.src);
  placeholder.classList.toggle("hidden", hasGhost);
  void refreshCameraList();
});

applyVideoMirror();
applyGhostStyles();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
