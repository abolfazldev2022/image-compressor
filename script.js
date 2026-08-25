/* =========================================================
   فشرده‌ساز تصویر آفلاین — script.js
   تمام پردازش‌ها به‌صورت کامل در مرورگر و با Canvas API انجام
   می‌شود. هیچ داده‌ای به هیچ سروری ارسال نمی‌شود.
   ========================================================= */
(() => {
  "use strict";

  /* ---------- DOM references ---------- */
  const dropzone          = document.getElementById("dropzone");
  const fileInput         = document.getElementById("fileInput");
  const pickFileBtn       = document.getElementById("pickFileBtn");
  const errorMsg          = document.getElementById("errorMsg");

  const workspace         = document.getElementById("workspace");

  const qualityRange      = document.getElementById("qualityRange");
  const qualityValue      = document.getElementById("qualityValue");
  const pngHint           = document.getElementById("pngHint");
  const formatSelect      = document.getElementById("formatSelect");
  const maxWidthInput     = document.getElementById("maxWidth");
  const maxHeightInput    = document.getElementById("maxHeight");
  const keepAspect        = document.getElementById("keepAspect");
  const presetChips       = document.querySelectorAll(".preset-chip");

  const compressBtn       = document.getElementById("compressBtn");
  const resetBtn          = document.getElementById("resetBtn");
  const warningMsg        = document.getElementById("warningMsg");

  const originalImg       = document.getElementById("originalImg");
  const origSize          = document.getElementById("origSize");
  const origDims          = document.getElementById("origDims");

  const compressedFrame   = document.getElementById("compressedFrame");
  const compressedPlaceholder = document.getElementById("compressedPlaceholder");
  const placeholderText   = document.getElementById("placeholderText");
  const spinner           = document.getElementById("spinner");
  const compressedImg     = document.getElementById("compressedImg");
  const compSize          = document.getElementById("compSize");
  const compDims          = document.getElementById("compDims");
  const compFormat        = document.getElementById("compFormat");

  const meterBlock        = document.getElementById("meterBlock");
  const meterFill         = document.getElementById("meterFill");
  const meterPercent      = document.getElementById("meterPercent");

  const downloadBtn       = document.getElementById("downloadBtn");

  /* ---------- State ---------- */
  const state = {
    originalFile: null,      // the raw File object, never mutated
    originalObjectUrl: null, // object URL for the original preview
    originalBitmapW: 0,
    originalBitmapH: 0,
    compressedBlob: null,
    compressedObjectUrl: null,
  };

  const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

  const PRESETS = {
    small:    { quality: 45, format: "image/jpeg" },
    balanced: { quality: 75, format: "image/jpeg" },
    high:     { quality: 92, format: "image/jpeg" },
  };

  /* ---------- Utilities ---------- */

  function bytesToReadable(bytes) {
    if (bytes < 1024) return `${bytes} بایت`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} کیلوبایت`;
    const mb = kb / 1024;
    return `${mb.toFixed(2)} مگابایت`;
  }

  function toPersianDigits(input) {
    const map = { "0":"۰","1":"۱","2":"۲","3":"۳","4":"۴","5":"۵","6":"۶","7":"۷","8":"۸","9":"۹" };
    return String(input).replace(/[0-9]/g, d => map[d]);
  }

  function showError(message) {
    errorMsg.textContent = message;
    errorMsg.hidden = false;
  }

  function clearError() {
    errorMsg.hidden = true;
    errorMsg.textContent = "";
  }

  function showWarning(message) {
    warningMsg.textContent = message;
    warningMsg.hidden = false;
  }

  function clearWarning() {
    warningMsg.hidden = true;
    warningMsg.textContent = "";
  }

  function revokeIfSet(urlKey) {
    if (state[urlKey]) {
      URL.revokeObjectURL(state[urlKey]);
      state[urlKey] = null;
    }
  }

  function extensionForFormat(mime) {
    switch (mime) {
      case "image/jpeg": return "jpg";
      case "image/webp": return "webp";
      case "image/png":  return "png";
      default: return "img";
    }
  }

  /* ---------- Preset handling ---------- */

  function applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;

    presetChips.forEach(chip => {
      chip.classList.toggle("is-active", chip.dataset.preset === name);
    });

    qualityRange.value = preset.quality;
    updateQualityLabel();
    formatSelect.value = preset.format;
    updateFormatDependentUI();
  }

  function clearPresetSelection() {
    presetChips.forEach(chip => chip.classList.remove("is-active"));
  }

  presetChips.forEach(chip => {
    chip.addEventListener("click", () => applyPreset(chip.dataset.preset));
  });

  /* ---------- Quality / format UI ---------- */

  function updateQualityLabel() {
    qualityValue.textContent = `${toPersianDigits(qualityRange.value)}٪`;
  }

  function updateFormatDependentUI() {
    pngHint.hidden = formatSelect.value !== "image/png";
  }

  qualityRange.addEventListener("input", () => {
    updateQualityLabel();
    clearPresetSelection();
  });

  formatSelect.addEventListener("change", () => {
    updateFormatDependentUI();
    clearPresetSelection();
  });

  maxWidthInput.addEventListener("input", clearPresetSelection);
  maxHeightInput.addEventListener("input", clearPresetSelection);
  keepAspect.addEventListener("change", clearPresetSelection);

  /* ---------- File selection ---------- */

  pickFileBtn.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("click", (e) => {
    // Avoid double-trigger when the inner button itself was clicked.
    if (e.target === pickFileBtn) return;
    fileInput.click();
  });
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files[0]) {
      handleFile(fileInput.files[0]);
    }
  });

  ["dragenter", "dragover"].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("is-dragover");
    });
  });

  ["dragleave", "drop"].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("is-dragover");
    });
  });

  dropzone.addEventListener("drop", (e) => {
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files[0]) handleFile(files[0]);
  });

  function handleFile(file) {
    clearError();

    if (!ACCEPTED_TYPES.includes(file.type)) {
      showError("فرمت انتخاب‌شده پشتیبانی نمی‌شود. لطفاً یک فایل JPG، PNG یا WebP انتخاب کنید.");
      return;
    }

    // A generous sanity cap to avoid the browser tab locking up on huge files.
    const MAX_BYTES = 60 * 1024 * 1024; // 60MB
    if (file.size > MAX_BYTES) {
      showError("حجم فایل بسیار زیاد است. لطفاً تصویری کوچک‌تر از ۶۰ مگابایت انتخاب کنید.");
      return;
    }

    // Reset any previous session's derived data before loading the new one.
    resetCompressedOutputOnly();
    revokeIfSet("originalObjectUrl");

    state.originalFile = file;
    state.originalObjectUrl = URL.createObjectURL(file);

    const probeImg = new Image();
    probeImg.onload = () => {
      state.originalBitmapW = probeImg.naturalWidth;
      state.originalBitmapH = probeImg.naturalHeight;

      originalImg.src = state.originalObjectUrl;
      origSize.textContent = bytesToReadable(file.size);
      origDims.textContent = `${toPersianDigits(probeImg.naturalWidth)} × ${toPersianDigits(probeImg.naturalHeight)} پیکسل`;

      // Pre-fill max width/height with the original dimensions so the user
      // has a sensible, non-destructive starting point.
      maxWidthInput.placeholder = String(probeImg.naturalWidth);
      maxHeightInput.placeholder = String(probeImg.naturalHeight);

      workspace.hidden = false;
      workspace.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    probeImg.onerror = () => {
      showError("خواندن این تصویر ممکن نشد. ممکن است فایل خراب یا نامعتبر باشد.");
      revokeIfSet("originalObjectUrl");
      state.originalFile = null;
    };
    probeImg.src = state.originalObjectUrl;
  }

  /* ---------- Compression ---------- */

  compressBtn.addEventListener("click", runCompression);

  function runCompression() {
    if (!state.originalFile) return;

    clearError();
    clearWarning();
    setBusy(true);

    // Let the loading state paint before the (potentially heavy) synchronous
    // canvas work begins.
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          compressImage();
        } catch (err) {
          console.error(err);
          showError("در حین فشرده‌سازی خطایی رخ داد. لطفاً دوباره تلاش کنید.");
          setBusy(false);
        }
      }, 30);
    });
  }

  function compressImage() {
    const img = new Image();
    img.onload = () => {
      const targetFormat = formatSelect.value;
      const quality = Math.min(1, Math.max(0.1, Number(qualityRange.value) / 100));

      const { width, height } = computeTargetDimensions(
        img.naturalWidth,
        img.naturalHeight,
        maxWidthInput.value ? Number(maxWidthInput.value) : null,
        maxHeightInput.value ? Number(maxHeightInput.value) : null,
        keepAspect.checked
      );

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");

      // PNG can have transparency; fill white first for JPEG since JPEG has
      // no alpha channel and would otherwise turn transparent areas black.
      if (targetFormat === "image/jpeg") {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            showError("تولید فایل خروجی ممکن نشد. لطفاً فرمت دیگری را امتحان کنید.");
            setBusy(false);
            return;
          }
          onCompressionDone(blob, width, height, targetFormat);
        },
        targetFormat,
        targetFormat === "image/png" ? undefined : quality
      );
    };

    img.onerror = () => {
      showError("بارگذاری تصویر برای پردازش ممکن نشد.");
      setBusy(false);
    };

    img.src = state.originalObjectUrl;
  }

  function computeTargetDimensions(naturalW, naturalH, maxW, maxH, keep) {
    let width = naturalW;
    let height = naturalH;

    if (!maxW && !maxH) {
      return { width, height };
    }

    if (keep) {
      const widthRatio = maxW ? maxW / naturalW : Infinity;
      const heightRatio = maxH ? maxH / naturalH : Infinity;
      const ratio = Math.min(widthRatio, heightRatio, 1); // never upscale
      width = Math.round(naturalW * ratio);
      height = Math.round(naturalH * ratio);
    } else {
      if (maxW) width = Math.min(naturalW, maxW);
      if (maxH) height = Math.min(naturalH, maxH);
    }

    return { width: Math.max(1, width), height: Math.max(1, height) };
  }

  function onCompressionDone(blob, width, height, format) {
    revokeIfSet("compressedObjectUrl");
    state.compressedBlob = blob;
    state.compressedObjectUrl = URL.createObjectURL(blob);

    compressedImg.src = state.compressedObjectUrl;
    compressedImg.hidden = false;
    compressedPlaceholder.hidden = true;

    compSize.textContent = bytesToReadable(blob.size);
    compDims.textContent = `${toPersianDigits(width)} × ${toPersianDigits(height)} پیکسل`;
    compFormat.textContent = formatLabel(format);

    const originalBytes = state.originalFile.size;
    const reductionPct = ((originalBytes - blob.size) / originalBytes) * 100;

    meterBlock.hidden = false;
    const clampedForBar = Math.max(0, Math.min(100, reductionPct));
    // Allow the browser to register width:0 before animating to the target.
    meterFill.style.width = "0%";
    requestAnimationFrame(() => {
      meterFill.style.width = `${clampedForBar}%`;
    });
    meterPercent.textContent = `${toPersianDigits(reductionPct >= 0 ? reductionPct.toFixed(1) : "0")}٪`;

    if (blob.size >= originalBytes) {
      showWarning(
        "حجم فایل فشرده‌شده بزرگ‌تر یا برابر با فایل اصلی است. می‌توانید کیفیت را کاهش دهید یا فایل اصلی را دانلود کنید."
      );
      meterFill.style.background = "linear-gradient(90deg, #c4622a, var(--warn))";
      meterPercent.textContent = "۰٪";
      meterFill.style.width = "0%";
    } else {
      meterFill.style.background = "";
    }

    downloadBtn.hidden = false;
    setBusy(false);
  }

  function formatLabel(mime) {
    switch (mime) {
      case "image/jpeg": return "JPEG";
      case "image/webp": return "WebP";
      case "image/png":  return "PNG";
      default: return mime;
    }
  }

  function setBusy(isBusy) {
    compressBtn.disabled = isBusy;
    compressBtn.textContent = isBusy ? "در حال فشرده‌سازی..." : "فشرده‌سازی تصویر";
    spinner.hidden = !isBusy;
    placeholderText.textContent = isBusy
      ? "در حال پردازش تصویر، لطفاً صبر کنید..."
      : "برای شروع، دکمهٔ «فشرده‌سازی تصویر» را بزنید";
    if (isBusy) {
      compressedImg.hidden = true;
      compressedPlaceholder.hidden = false;
    }
  }

  /* ---------- Download ---------- */

  downloadBtn.addEventListener("click", () => {
    if (!state.compressedBlob) return;

    const originalName = state.originalFile.name.replace(/\.[^/.]+$/, "");
    const ext = extensionForFormat(formatSelect.value);
    const filename = `${originalName || "image"}-compressed.${ext}`;

    const a = document.createElement("a");
    a.href = state.compressedObjectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  /* ---------- Reset ---------- */

  resetBtn.addEventListener("click", fullReset);

  function resetCompressedOutputOnly() {
    revokeIfSet("compressedObjectUrl");
    state.compressedBlob = null;

    compressedImg.hidden = true;
    compressedImg.removeAttribute("src");
    compressedPlaceholder.hidden = false;
    placeholderText.textContent = "برای شروع، دکمهٔ «فشرده‌سازی تصویر» را بزنید";

    compSize.textContent = "—";
    compDims.textContent = "—";
    compFormat.textContent = "—";

    meterBlock.hidden = true;
    meterFill.style.width = "0%";
    meterFill.style.background = "";

    downloadBtn.hidden = true;
    clearWarning();
  }

  function fullReset() {
    revokeIfSet("originalObjectUrl");
    revokeIfSet("compressedObjectUrl");

    state.originalFile = null;
    state.compressedBlob = null;
    state.originalBitmapW = 0;
    state.originalBitmapH = 0;

    fileInput.value = "";
    originalImg.removeAttribute("src");
    origSize.textContent = "—";
    origDims.textContent = "—";

    resetCompressedOutputOnly();

    qualityRange.value = 75;
    updateQualityLabel();
    formatSelect.value = "image/jpeg";
    updateFormatDependentUI();
    maxWidthInput.value = "";
    maxHeightInput.value = "";
    keepAspect.checked = true;
    applyPreset("balanced");

    clearError();
    clearWarning();

    workspace.hidden = true;
    dropzone.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- Init ---------- */
  updateQualityLabel();
  updateFormatDependentUI();
})();
