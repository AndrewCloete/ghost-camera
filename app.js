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
