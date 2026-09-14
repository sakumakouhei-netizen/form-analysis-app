const webcam = document.getElementById('webcam');
const refVideo = document.getElementById('refVideo');
let refImage = null;

const videoCanvas = document.getElementById('videoCanvas');
const vCtx = videoCanvas.getContext('2d');
const drawCanvas = document.getElementById('drawCanvas');
const dCtx = drawCanvas.getContext('2d');

const refVideoCanvas = document.getElementById('refVideoCanvas');
const rCtx = refVideoCanvas.getContext('2d');
const refDrawCanvas = document.getElementById('refDrawCanvas');
const rdCtx = refDrawCanvas.getContext('2d');

const startResetBtn = document.getElementById('startResetBtn');
const switchCamBtn = document.getElementById('switchCamBtn');
const pauseBtn = document.getElementById('pauseBtn');
const prevFrameBtn = document.getElementById('prevFrameBtn');
const nextFrameBtn = document.getElementById('nextFrameBtn');
const refControls = document.getElementById('refControls');
const refPrevBtn = document.getElementById('refPrevBtn');
const refNextBtn = document.getElementById('refNextBtn');
const refSeekbar = document.getElementById('refSeekbar');
const refTimeDisplay = document.getElementById('refTimeDisplay');
const opacitySlider = document.getElementById('opacitySlider');
const zoomSlider = document.getElementById('zoomSlider');
const speedBtn = document.getElementById('speedBtn');

const saveBtn = document.getElementById('saveBtn');
const actionModeBtn = document.getElementById('actionModeBtn');
const modeBtn = document.getElementById('modeBtn');
const clearLinesBtn = document.getElementById('clearLinesBtn');
const fileInputLeft = document.getElementById('fileInputLeft');
const fileInputMain = document.getElementById('fileInputMain');
const statusText = document.getElementById('statusText');
const appContainer = document.getElementById('appContainer');
const rightViewTitle = document.getElementById('rightViewTitle');

let frameBuffer = [];
let pausedFrameIndex = -1;
let isRunning = false;
let isPaused = false;

let viewMode = 'single'; 
let interactionMode = 'move'; 
let overlayOpacity = 0.5;

let refScale = 1.0;
let refOffsetX = 0;
let refOffsetY = 0;
let isDraggingRef = false;
let dragStartX = 0, dragStartY = 0;

const playbackRates = [1.0, 0.75, 0.5, 0.25];
let currentRateIndex = 0;

let currentStream = null;
let useFacingMode = "environment";
let selectedDelaySec = 5;
const fps = 30;
const frameTime = 1 / fps;
const maxBufferSec = 15;

let drawMode = 'free';
let isDrawing = false;
let startX = 0, startY = 0;
let currentPath = [];
let lineColor = '#00ff00';
let drawnElements = [];
let refDrawnElements = [];
let activeCanvas = null;

opacitySlider.addEventListener('input', (e) => {
  overlayOpacity = parseFloat(e.target.value);
  renderCurrentState();
});

zoomSlider.addEventListener('input', (e) => {
  refScale = parseFloat(e.target.value);
  renderCurrentState();
});

function resetRefTransform() {
  refScale = 1.0;
  refOffsetX = 0;
  refOffsetY = 0;
  zoomSlider.value = 1.0;
  renderCurrentState();
}

function togglePlaybackRate() {
  currentRateIndex = (currentRateIndex + 1) % playbackRates.length;
  const rate = playbackRates[currentRateIndex];
  refVideo.playbackRate = rate;
  speedBtn.innerText = `🚀 ${rate.toFixed(2)}x`;
}

function setDelay(sec, el) {
  selectedDelaySec = sec;
  document.querySelectorAll('.seg-group .seg-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  updateTitleText();
}

function updateTitleText() {
  const delayTxt = (selectedDelaySec === 0) ? "リアルタイム" : `${selectedDelaySec}秒遅延`;
  if (viewMode === 'overlay') {
    rightViewTitle.innerText = `重ね合わせ表示 (${delayTxt})`;
  } else {
    rightViewTitle.innerText = `カメラ映像 (${delayTxt})`;
  }
}

function setLineColor(color, el) {
  lineColor = color;
  document.querySelectorAll('.btn-color').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}

function setViewMode(mode) {
  viewMode = mode;
  appContainer.classList.remove('mode-single', 'mode-split', 'mode-overlay');
  appContainer.classList.add(`mode-${mode}`);

  document.querySelectorAll('.mode-tab').forEach(tab => tab.classList.remove('active'));
  if (mode === 'single') document.getElementById('tabSingle').classList.add('active');
  if (mode === 'split') document.getElementById('tabSplit').classList.add('active');
  if (mode === 'overlay') document.getElementById('tabOverlay').classList.add('active');

  updateTitleText();
  renderCurrentState();
}

actionModeBtn.addEventListener('click', () => {
  if (interactionMode === 'move') {
    interactionMode = 'draw';
    actionModeBtn.innerText = "✏️ ペン描画";
    actionModeBtn.className = "btn-tool";
    drawCanvas.classList.remove('mode-move');
    drawCanvas.classList.add('mode-draw');
    statusText.innerText = "ペン描画モード：画面をなぞって線を描けます。";
  } else {
    interactionMode = 'move';
    actionModeBtn.innerText = "🖐️ 位置調整";
    actionModeBtn.className = "btn-move";
    drawCanvas.classList.remove('mode-draw');
    drawCanvas.classList.add('mode-move');
    statusText.innerText = "位置調整モード：画面をドラッグして比較映像を移動できます。";
  }
});

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.type.startsWith('image/')) {
    refVideo.pause();
    refVideo.src = "";
    refControls.style.display = "none";
    const img = new Image();
    img.crossOrigin = "anonymous"; // CORS汚染防止
    img.onload = () => {
      refImage = img;
      resetRefTransform();
      drawRefImage();
      if (viewMode === 'single') setViewMode('split');
    };
    img.src = URL.createObjectURL(file);
  } else if (file.type.startsWith('video/')) {
    refImage = null;
    refVideo.crossOrigin = "anonymous"; // CORS汚染防止
    refVideo.src = URL.createObjectURL(file);
    refVideo.onloadedmetadata = () => {
      updateRefSeekbar();
    };
    resetRefTransform();
    refVideo.play();
    if (viewMode === 'single') setViewMode('split');
  }
}

fileInputLeft.addEventListener('change', handleFileSelect);
fileInputMain.addEventListener('change', handleFileSelect);

function formatTime(seconds) {
  if (isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function updateRefSeekbar() {
  if (!refVideo.duration) return;
  refSeekbar.max = refVideo.duration;
  refSeekbar.value = refVideo.currentTime;
  refTimeDisplay.innerText = `${formatTime(refVideo.currentTime)} / ${formatTime(refVideo.duration)}`;
}

refSeekbar.addEventListener('input', () => {
  if (refVideo.src) {
    refVideo.currentTime = parseFloat(refSeekbar.value);
    rCtx.drawImage(refVideo, 0, 0, refVideoCanvas.width, refVideoCanvas.height);
    refTimeDisplay.innerText = `${formatTime(refVideo.currentTime)} / ${formatTime(refVideo.duration)}`;
    renderCurrentState();
  }
});

function drawRefImage() {
  if (!refImage) return;
  rCtx.fillStyle = "#000";
  rCtx.fillRect(0, 0, refVideoCanvas.width, refVideoCanvas.height);

  const hRatio = refVideoCanvas.width / refImage.width;
  const vRatio = refVideoCanvas.height / refImage.height;
  const ratio = Math.min(hRatio, vRatio);
  const centerShiftX = (refVideoCanvas.width - refImage.width * ratio) / 2;
  const centerShiftY = (refVideoCanvas.height - refImage.height * ratio) / 2;

  rCtx.drawImage(
    refImage, 0, 0, refImage.width, refImage.height,
    centerShiftX, centerShiftY, refImage.width * ratio, refImage.height * ratio
  );
}

function renderRefVideoFrame() {
  if (refVideo.src && !refVideo.paused) {
    rCtx.drawImage(refVideo, 0, 0, refVideoCanvas.width, refVideoCanvas.height);
    updateRefSeekbar();
  }
}

modeBtn.addEventListener('click', () => {
  drawMode = (drawMode === 'free') ? 'line' : 'free';
  modeBtn.innerText = (drawMode === 'free') ? "✏️ フリーハンド" : "📏 直線";
});

startResetBtn.addEventListener('click', () => {
  if (!isRunning) {
    initCamera();
  } else {
    drawnElements.length = 0;
    refDrawnElements.length = 0;
    redrawAllCanvas();
    frameBuffer = [];
    isPaused = false;
    if (refVideo.src) refVideo.play();
    pauseBtn.innerText = "⏸ 一時停止";
    pauseBtn.className = "btn-pause";
    prevFrameBtn.disabled = true;
    nextFrameBtn.disabled = true;
    refControls.style.display = "none";
    statusText.innerText = "リセット完了：撮影を継続しています。";
  }
});

async function initCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }
  try {
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: useFacingMode, width: 1280, height: 720 },
      audio: false
    });
    webcam.srcObject = currentStream;
    await webcam.play();

    const w = webcam.videoWidth || 1280;
    const h = webcam.videoHeight || 720;
    
    videoCanvas.width = w; videoCanvas.height = h;
    drawCanvas.width = w; drawCanvas.height = h;
    refVideoCanvas.width = w; refVideoCanvas.height = h;
    refDrawCanvas.width = w; refDrawCanvas.height = h;

    if (!isRunning) {
      isRunning = true;
      startResetBtn.innerText = "🔄 リセット";
      startResetBtn.className = "btn-reset";

      switchCamBtn.disabled = false;
      pauseBtn.disabled = false;
      actionModeBtn.disabled = false;
      modeBtn.disabled = false;
      clearLinesBtn.disabled = false;
      saveBtn.disabled = false;
      statusText.innerText = "カメラ動作中：「🖐️位置調整」ボタンでドラッグ移動とペン描きを切り替えられます。";
      processFrame();
    }
  } catch (err) {
    alert("カメラの起動に失敗しました。");
  }
}

switchCamBtn.addEventListener('click', () => {
  useFacingMode = (useFacingMode === "environment") ? "user" : "environment";
  initCamera();
});

function drawTransformedRefVideo(ctx) {
  ctx.save();
  ctx.translate(ctx.canvas.width / 2 + refOffsetX, ctx.canvas.height / 2 + refOffsetY);
  ctx.scale(refScale, refScale);
  ctx.translate(-ctx.canvas.width / 2, -ctx.canvas.height / 2);
  ctx.drawImage(refVideoCanvas, 0, 0);
  ctx.restore();
}

function renderCurrentState() {
  vCtx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);

  if (isPaused && pausedFrameIndex >= 0 && frameBuffer[pausedFrameIndex]) {
    vCtx.drawImage(frameBuffer[pausedFrameIndex], 0, 0);
  } else if (selectedDelaySec === 0) {
    vCtx.drawImage(webcam, 0, 0, videoCanvas.width, videoCanvas.height);
  } else {
    const requiredFrames = Math.round(selectedDelaySec * fps);
    if (frameBuffer.length > requiredFrames) {
      const displayIndex = frameBuffer.length - requiredFrames - 1;
      vCtx.drawImage(frameBuffer[displayIndex], 0, 0);
    }
  }

  if (viewMode === 'overlay') {
    vCtx.save();
    vCtx.globalAlpha = overlayOpacity;
    drawTransformedRefVideo(vCtx);
    vCtx.restore();
  }
}

function processFrame() {
  if (!isRunning) return;

  if (!isPaused) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = videoCanvas.width;
    tempCanvas.height = videoCanvas.height;
    tempCanvas.getContext('2d').drawImage(webcam, 0, 0, videoCanvas.width, videoCanvas.height);

    frameBuffer.push(tempCanvas);
    if (frameBuffer.length > maxBufferSec * fps) frameBuffer.shift();

    if (refImage) {
      drawRefImage();
    } else if (refVideo.src) {
      renderRefVideoFrame();
    }

    renderCurrentState();
  }

  setTimeout(() => { requestAnimationFrame(processFrame); }, 1000 / fps);
}

pauseBtn.addEventListener('click', () => {
  isPaused = !isPaused;
  if (isPaused) {
    if (selectedDelaySec === 0) {
      pausedFrameIndex = frameBuffer.length - 1;
    } else {
      const requiredFrames = Math.round(selectedDelaySec * fps);
      pausedFrameIndex = Math.max(0, frameBuffer.length - requiredFrames - 1);
    }

    if (refVideo.src) {
      refVideo.pause();
      refControls.style.display = "flex";
      updateRefSeekbar();
    }

    pauseBtn.innerText = "▶ 再生再開";
    pauseBtn.className = "btn-main";
    prevFrameBtn.disabled = false;
    nextFrameBtn.disabled = false;
    statusText.innerText = "一時停止中：「🖐️位置調整」で画面を動かすか「✏️ペン描画」で線を引けます。";
  } else {
    if (refVideo.src) refVideo.play();
    pauseBtn.innerText = "⏸ 一時停止";
    pauseBtn.className = "btn-pause";
    prevFrameBtn.disabled = true;
    nextFrameBtn.disabled = true;
    refControls.style.display = "none";
    statusText.innerText = "カメラ動作中：映像が表示されます。";
  }
});

function setupLongPress(element, action) {
  let timer = null, accelTimer = null, interval = null;

  const start = (e) => {
    e.preventDefault();
    action(1);
    timer = setTimeout(() => {
      interval = setInterval(() => action(1), 50);
      accelTimer = setTimeout(() => {
        clearInterval(interval);
        interval = setInterval(() => action(3), 30);
      }, 4600);
    }, 400);
  };

  const stop = () => {
    if (timer) clearTimeout(timer);
    if (accelTimer) clearTimeout(accelTimer);
    if (interval) clearInterval(interval);
    timer = null; accelTimer = null; interval = null;
  };

  element.addEventListener('mousedown', start);
  element.addEventListener('mouseup', stop);
  element.addEventListener('mouseleave', stop);
  element.addEventListener('touchstart', start, { passive: false });
  element.addEventListener('touchend', stop);
  element.addEventListener('touchcancel', stop);
}

const stepMainPrev = (step = 1) => {
  if (pausedFrameIndex > 0) {
    pausedFrameIndex = Math.max(0, pausedFrameIndex - step);
    renderCurrentState();
  }
};

const stepMainNext = (step = 1) => {
  if (pausedFrameIndex < frameBuffer.length - 1) {
    pausedFrameIndex = Math.min(frameBuffer.length - 1, pausedFrameIndex + step);
    renderCurrentState();
  }
};

const stepRefPrev = (step = 1) => {
  if (refVideo.src && isPaused) {
    refVideo.currentTime = Math.max(0, refVideo.currentTime - (frameTime * step));
    rCtx.drawImage(refVideo, 0, 0, refVideoCanvas.width, refVideoCanvas.height);
    updateRefSeekbar();
    renderCurrentState();
  }
};

const stepRefNext = (step = 1) => {
  if (refVideo.src && isPaused) {
    refVideo.currentTime = Math.min(refVideo.duration, refVideo.currentTime + (frameTime * step));
    rCtx.drawImage(refVideo, 0, 0, refVideoCanvas.width, refVideoCanvas.height);
    updateRefSeekbar();
    renderCurrentState();
  }
};

setupLongPress(prevFrameBtn, stepMainPrev);
setupLongPress(nextFrameBtn, stepMainNext);
setupLongPress(refPrevBtn, stepRefPrev);
setupLongPress(refNextBtn, stepRefNext);

// --- 画面保存処理（Web Share API + Blob によるマルチデバイス対応） ---
saveBtn.addEventListener('click', () => {
  try {
    const saveCanvas = document.createElement('canvas');
    
    if (viewMode === 'split') {
      saveCanvas.width = videoCanvas.width * 2 + 10;
      saveCanvas.height = videoCanvas.height;
      const sCtx = saveCanvas.getContext('2d');
      sCtx.fillStyle = "#121212";
      sCtx.fillRect(0, 0, saveCanvas.width, saveCanvas.height);

      sCtx.drawImage(refVideoCanvas, 0, 0);
      sCtx.drawImage(refDrawCanvas, 0, 0);
      sCtx.drawImage(videoCanvas, videoCanvas.width + 10, 0);
      sCtx.drawImage(drawCanvas, videoCanvas.width + 10, 0);
    } else {
      saveCanvas.width = videoCanvas.width;
      saveCanvas.height = videoCanvas.height;
      const sCtx = saveCanvas.getContext('2d');
      sCtx.drawImage(videoCanvas, 0, 0);
      sCtx.drawImage(drawCanvas, 0, 0);
      if (viewMode === 'overlay') {
        sCtx.drawImage(refDrawCanvas, 0, 0);
      }
    }

    const now = new Date();
    const fileName = `analysis_${now.getHours()}${now.getMinutes()}${now.getSeconds()}.png`;

    saveCanvas.toBlob(async (blob) => {
      if (!blob) {
        alert("画像の生成に失敗しました。");
        return;
      }

      // スマホの共有メニュー（LINE・写真アプリ保存など）に対応
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], fileName, { type: 'image/png' })] })) {
        try {
          const file = new File([blob], fileName, { type: 'image/png' });
          await navigator.share({
            files: [file],
            title: 'フォーム分析画像',
            text: '分析画像を保存・共有します。'
          });
          statusText.innerText = "画像を共有・保存しました！";
          return;
        } catch (shareErr) {
          if (shareErr.name === 'AbortError') return;
        }
      }

      // PC・標準ブラウザ用ダウンロード処理
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = fileName;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      statusText.innerText = "分析画像を保存しました！";
    }, 'image/png');

  } catch (err) {
    console.error(err);
    alert("画像の書き出しに失敗しました。");
  }
});

clearLinesBtn.addEventListener('click', () => {
  drawnElements.length = 0;
  refDrawnElements.length = 0;
  redrawAllCanvas();
  statusText.innerText = "描画した線をすべて消去しました。";
});

function setupDrawing(targetCanvas, elementsArray, context) {
  let lastValidPos = { x: 0, y: 0, clientX: 0, clientY: 0, scaleX: 1, scaleY: 1 };

  function getPos(e) {
    const rect = targetCanvas.getBoundingClientRect();
    let clientX = e.clientX;
    let clientY = e.clientY;

    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    }

    if (rect.width === 0 || rect.height === 0) return lastValidPos;

    const canvasAspect = targetCanvas.width / targetCanvas.height;
    const rectAspect = rect.width / rect.height;

    let renderWidth, renderHeight, renderLeft, renderTop;

    if (rectAspect > canvasAspect) {
      renderHeight = rect.height;
      renderWidth = rect.height * canvasAspect;
      renderTop = rect.top;
      renderLeft = rect.left + (rect.width - renderWidth) / 2;
    } else {
      renderWidth = rect.width;
      renderHeight = rect.width / canvasAspect;
      renderLeft = rect.left;
      renderTop = rect.top + (rect.height - renderHeight) / 2;
    }

    const scaleX = targetCanvas.width / renderWidth;
    const scaleY = targetCanvas.height / renderHeight;

    const x = (clientX - renderLeft) * scaleX;
    const y = (clientY - renderTop) * scaleY;

    lastValidPos = { x, y, clientX, clientY, scaleX, scaleY };
    return lastValidPos;
  }

  function startDraw(e) {
    if (e.cancelable) e.preventDefault();

    const pos = getPos(e);

    if (interactionMode === 'move' || (viewMode === 'overlay' && interactionMode === 'move')) {
      isDraggingRef = true;
      dragStartX = pos.clientX * pos.scaleX - refOffsetX;
      dragStartY = pos.clientY * pos.scaleY - refOffsetY;
      return;
    }

    if (!isPaused) return;

    isDrawing = true;
    activeCanvas = targetCanvas;
    startX = pos.x; startY = pos.y;
    if (drawMode === 'free') {
      currentPath = [{ x: pos.x, y: pos.y }];
    }
  }

  function moveDraw(e) {
    if (e.cancelable) e.preventDefault();

    const pos = getPos(e);

    if (isDraggingRef) {
      refOffsetX = pos.clientX * pos.scaleX - dragStartX;
      refOffsetY = pos.clientY * pos.scaleY - dragStartY;
      renderCurrentState();
      return;
    }

    if (!isDrawing || activeCanvas !== targetCanvas) return;

    redrawCanvas(targetCanvas, context, elementsArray);
    if (drawMode === 'free') {
      currentPath.push({ x: pos.x, y: pos.y });
      drawPath(context, currentPath, lineColor);
    } else {
      drawLine(context, startX, startY, pos.x, pos.y, lineColor);
    }
  }

  function endDraw(e) {
    if (e.cancelable) e.preventDefault();

    if (isDraggingRef) {
      isDraggingRef = false;
      return;
    }

    if (!isDrawing || activeCanvas !== targetCanvas) return;
    isDrawing = false;

    const pos = getPos(e);

    if (drawMode === 'free') {
      if (currentPath.length > 1) {
        elementsArray.push({ type: 'free', path: [...currentPath], color: lineColor });
      }
    } else {
      elementsArray.push({ type: 'line', sX: startX, sY: startY, eX: pos.x, eY: pos.y, color: lineColor });
    }
    redrawCanvas(targetCanvas, context, elementsArray);
  }

  targetCanvas.addEventListener('mousedown', startDraw);
  targetCanvas.addEventListener('mousemove', moveDraw);
  targetCanvas.addEventListener('mouseup', endDraw);

  targetCanvas.addEventListener('touchstart', startDraw, { passive: false });
  targetCanvas.addEventListener('touchmove', moveDraw, { passive: false });
  targetCanvas.addEventListener('touchend', endDraw, { passive: false });
  targetCanvas.addEventListener('touchcancel', endDraw, { passive: false });
}

setupDrawing(drawCanvas, drawnElements, dCtx);
setupDrawing(refDrawCanvas, refDrawnElements, rdCtx);

function drawLine(ctx, x1, y1, x2, y2, color) {
  ctx.beginPath(); 
  ctx.moveTo(x1, y1); 
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color; 
  ctx.lineWidth = 5; 
  ctx.lineCap = 'round'; 
  ctx.stroke();
}

function drawPath(ctx, path, color) {
  if (!path || path.length < 2) return;
  ctx.beginPath(); 
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) {
    ctx.lineTo(path[i].x, path[i].y);
  }
  ctx.strokeStyle = color; 
  ctx.lineWidth = 5; 
  ctx.lineCap = 'round'; 
  ctx.lineJoin = 'round'; 
  ctx.stroke();
}

function redrawCanvas(canvas, ctx, elements) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  elements.forEach(el => {
    if (el.type === 'free') drawPath(ctx, el.path, el.color);
    else if (el.type === 'line') drawLine(ctx, el.sX, el.sY, el.eX, el.eY, el.color);
  });
}

function redrawAllCanvas() {
  redrawCanvas(drawCanvas, dCtx, drawnElements);
  redrawCanvas(refDrawCanvas, rdCtx, refDrawnElements);
}