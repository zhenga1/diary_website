const monthsEl = document.getElementById("months");
const player = document.getElementById("player");
const audio = document.getElementById("audio");
const playerDate = document.getElementById("player-date");
const closeBtn = document.getElementById("close");
const recordBtn = document.getElementById("record-btn");

let recorder = null;
let recordedChunks = [];
let recording = false;
let currentDayEl = null;


// check to see if recording works
if (!navigator.mediaDevices || !window.MediaRecorder) {
  recordBtn.disabled = true;
  recordBtn.textContent = "Recording not supported";
}


const year = 2026;
const monthNames = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

const today = new Date();
const todayStr =
  today.getFullYear() + "-" +
  String(today.getMonth() + 1).padStart(2, "0") + "-" +
  String(today.getDate()).padStart(2, "0");

let currentDateStr = null;

// Abstraction so we can easily check for multiple audio formats
const AUDIO_EXTS = ["mp3", "m4a", "wav", "ogg"];

const AUDIO_MIME = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
};

// async function findAudioForDate(dateStr) {
//   for (const ext of AUDIO_EXTS) {
//     const path = `audio/${dateStr}.${ext}`;
//     try {
//       const res = await fetch(path, { method: "HEAD" });
//       if (res.ok) return path;
//     } catch {}
//   }
//   return null;
// }
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
let before_today = true;
monthNames.forEach((name, month) => {
  const monthEl = document.createElement("section");
  monthEl.className = "month";
  monthEl.innerHTML = `<h2>${name}</h2><div class="days"></div>`;
  


  const daysEl = monthEl.querySelector(".days");
  WEEKDAYS.forEach(day => {
        const label = document.createElement("div");
        label.className = "weekday";
        label.textContent = day;
        daysEl.appendChild(label);
  });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.className = "empty";
    daysEl.appendChild(empty);
  }

  
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dayEl = document.createElement("div");
    dayEl.className = "day";
    dayEl.textContent = day;

    if (dateStr === todayStr) {
        dayEl.classList.add("today");
        before_today = false;
    }
    if (before_today) {
        dayEl.classList.add("past");
    } else {
        dayEl.classList.add("future");
    }

    dayEl.onclick = () => {
        currentDayEl = dayEl;
        currentDateStr = dateStr;
        playerDate.textContent = dateStr;

        // Clear previous sources
        audio.pause();
        audio.innerHTML = "";
        
        let hasPlayableAudio = false;
        // if can play then mark
        audio.oncanplay = () => {
            hasPlayableAudio = true;
            dayEl.classList.add("has-audio");
        };
        audio.onerror = () => {
            if (!hasPlayableAudio) {
                showNoAudioMessage();
            }
        }
        // Add sources in priority order
        AUDIO_EXTS.forEach(ext => {
            const source = document.createElement("source");
            source.src = `audio/${dateStr}.${ext}`;
            source.type = AUDIO_MIME[ext];
            audio.appendChild(source);
        });

        // Ask browser to resolve the first valid source
        audio.load();

        // Show player AFTER sources are set
        player.classList.remove("hidden");
    };
    daysEl.appendChild(dayEl);
  }

  monthsEl.appendChild(monthEl);
});

recordBtn.onclick = async () => {
  if (!currentDateStr) return;

  // Stop recording
  if (recording) {
    recorder.stop();
    recordBtn.textContent = "🎙 Record";
    recording = false;
    return;
  }

  // Start recording
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  recorder = new MediaRecorder(stream);
  recordedChunks = [];
  recording = true;

  recordBtn.textContent = "⏹ Stop";

  recorder.ondataavailable = e => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  recorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: recorder.mimeType });
    const url = URL.createObjectURL(blob);

    // Play immediately
    audio.pause();
    audio.innerHTML = "";
    audio.src = url;
    audio.load();
    audio.play();

    // Enable download
    const link = document.getElementById("download-link");
    link.href = url;
    link.download = `${currentDateStr}.webm`;
    link.style.display = "inline-block";

    // Mark day as having audio
    currentDayEl?.classList.add("has-audio");
  };

  recorder.start();
};

const analyzeBtn = document.getElementById("analyze-btn");
const statsOutput = document.getElementById("stats-output");

// Get the longest and shortest audio descriptions
// HELPER FUNCTION
function getAudioDuration(dateStr) {
  return new Promise((resolve) => {
    let extIndex = 0;

    function tryNext() {
      if (extIndex >= AUDIO_EXTS.length) {
        resolve(null);
        return;
      }

      const ext = AUDIO_EXTS[extIndex++];
      const testAudio = new Audio();
      let done = false;

      const finish = (value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);

        testAudio.onloadedmetadata = null;
        testAudio.onerror = null;
        testAudio.src = "";
        resolve(value);
      };

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        testAudio.onloadedmetadata = null;
        testAudio.onerror = null;
        testAudio.src = "";
        tryNext();
      }, 1200);

      testAudio.preload = "metadata";
      testAudio.onloadedmetadata = () => {
        finish(testAudio.duration);
      };

      testAudio.onerror = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        testAudio.onloadedmetadata = null;
        testAudio.onerror = null;
        testAudio.src = "";
        tryNext();
      };

      testAudio.src = `audio/${dateStr}.${ext}`;
      testAudio.load();
    }

    tryNext();
  });
}

// Force a frame update
function nextFrame() {
  return new Promise(requestAnimationFrame);
} 

// Format time in MM:SS
function formatTime(seconds) {
  if (seconds == null || !isFinite(seconds)) return "0:00";

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

// Main segment
analyzeBtn.onclick = async () => {
  statsOutput.textContent = "Analyzing...";

  let longest = { duration: 0, date: null };
  let shortest = { duration: Infinity, date: null };
  let totalDuration = 0;
  const entries = []; // { date: string, duration: number }

  const year = 2026;
  const recordedDates = new Set();

  let breakOuter = false;
  for (let month = 0; month < 12; month++) {
    if (breakOuter) break;
    const days = new Date(year, month + 1, 0).getDate();

    for (let day = 1; day <= days; day++) {
      const dateStr =
        `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      if (dateStr >= todayStr) { breakOuter = true; break; }

      statsOutput.textContent = `Analyzing ${dateStr}...`;
      await nextFrame();
      const duration = await getAudioDuration(dateStr);

      if (duration === null) continue;

      totalDuration += duration;
      entries.push({ date: dateStr, duration });
      recordedDates.add(dateStr);

      if (duration > longest.duration) longest = { duration, date: dateStr };
      if (duration < shortest.duration) shortest = { duration, date: dateStr };
    }
  }

  await nextFrame();
  const count = entries.length;
  const durations = entries.map(e => e.duration);
  const avgDuration = count > 0 ? totalDuration / count : 0;

  // Std deviation
  const variance = count > 1
    ? durations.reduce((s, d) => s + (d - avgDuration) ** 2, 0) / (count - 1)
    : 0;
  const stdDev = Math.sqrt(variance);

  // Streaks
  const { longest: longestStreak, current: currentStreak } = computeStreaks(recordedDates);

  statsOutput.innerHTML = `
    🟢 Longest: ${longest.date} (${formatTime(longest.duration)})<br>
    🔵 Shortest: ${shortest.date} (${formatTime(shortest.duration)})<br>
    🟡 Average: ${formatTime(avgDuration)} &nbsp;·&nbsp; σ ${formatTime(stdDev)}<br>
    🔥 Longest streak: ${longestStreak} day${longestStreak !== 1 ? "s" : ""}
    &nbsp;·&nbsp; Current streak: ${currentStreak} day${currentStreak !== 1 ? "s" : ""}
  `;

  drawDistributionChart(durations, avgDuration);
  drawCDFChart(durations);
  drawDayOfWeekChart(entries);
};

function computeStreaks(recordedDates) {
  let longest = 0, current = 0, prev = null;
  const sorted = [...recordedDates].sort();
  for (const d of sorted) {
    const dt = new Date(d);
    if (prev) {
      const gap = (dt - prev) / 86400000;
      current = gap === 1 ? current + 1 : 1;
    } else {
      current = 1;
    }
    longest = Math.max(longest, current);
    prev = dt;
  }
  // check if streak is still active (last date is yesterday or today)
  const lastDate = sorted[sorted.length - 1];
  const yesterday = new Date(todayStr);
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);
  if (lastDate !== yStr && lastDate !== todayStr) current = 0;
  return { longest, current };
}

// ── shared canvas helpers ────────────────────────────────────────────────────

function chartBase(canvas, PAD) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, W, H);
  return { ctx, W, H, chartW, chartH };
}

function drawAxes(ctx, PAD, W, H, chartH) {
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top);
  ctx.lineTo(PAD.left, PAD.top + chartH);
  ctx.lineTo(W - PAD.right, PAD.top + chartH);
  ctx.stroke();
}

function drawGridlines(ctx, PAD, chartW, chartH, maxVal, gridLines = 4) {
  for (let g = 0; g <= gridLines; g++) {
    const y = PAD.top + chartH - (g / gridLines) * chartH;
    ctx.strokeStyle = "#2e2e4e";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(PAD.left + chartW, y);
    ctx.stroke();
    ctx.fillStyle = "#888";
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(Math.round((g / gridLines) * maxVal), PAD.left - 4, y + 3);
  }
}

function drawVLine(ctx, x, PAD, chartH, color, label) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(x, PAD.top);
  ctx.lineTo(x, PAD.top + chartH);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.font = "10px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, x, PAD.top - 4);
}

function xLabelsMinutes(ctx, PAD, H, chartW, maxSec) {
  ctx.fillStyle = "#aaa";
  ctx.font = "10px Inter, sans-serif";
  ctx.textAlign = "center";
  for (let s = 0; s <= maxSec; s += 60) {
    const x = PAD.left + (s / maxSec) * chartW;
    ctx.fillText(`${s / 60}m`, x, H - PAD.bottom + 14);
  }
}

// ── 1. Histogram + KDE ───────────────────────────────────────────────────────

function drawDistributionChart(durations, avgDuration) {
  const canvas = document.getElementById("stats-chart");
  if (!canvas || durations.length === 0) return;
  canvas.style.display = "block";

  const PAD = { top: 24, right: 20, bottom: 40, left: 40 };
  const { ctx, W, H, chartW, chartH } = chartBase(canvas, PAD);

  const bucketSize = 30;
  const maxSec = Math.ceil(Math.max(...durations) / bucketSize) * bucketSize;
  const numBuckets = Math.ceil(maxSec / bucketSize);
  const buckets = new Array(numBuckets).fill(0);
  durations.forEach(d => {
    const i = Math.min(Math.floor(d / bucketSize), numBuckets - 1);
    buckets[i]++;
  });
  const maxCount = Math.max(...buckets);
  const barW = chartW / numBuckets;

  // Chart label
  ctx.fillStyle = "#ccc";
  ctx.font = "bold 11px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Distribution (histogram + KDE)", PAD.left, PAD.top - 8);

  drawGridlines(ctx, PAD, chartW, chartH, maxCount);

  // Bars
  buckets.forEach((val, i) => {
    if (val === 0) return;
    const barH = (val / maxCount) * chartH;
    const x = PAD.left + i * barW;
    const y = PAD.top + chartH - barH;
    const hue = 200 + (i / numBuckets) * 60;
    ctx.fillStyle = `hsl(${hue}, 70%, 55%)`;
    ctx.fillRect(x + 1, y, barW - 2, barH);
  });

  // KDE (Gaussian, Silverman bandwidth)
  const n = durations.length;
  const mean = durations.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(durations.reduce((s, d) => s + (d - mean) ** 2, 0) / n);
  const h = 1.06 * std * Math.pow(n, -0.2) || 30;
  const kdeSteps = 200;
  const gaussian = (x, xi) => Math.exp(-0.5 * ((x - xi) / h) ** 2) / (h * Math.sqrt(2 * Math.PI));

  // Sample KDE over [0, maxSec]
  const kdePoints = [];
  for (let s = 0; s <= kdeSteps; s++) {
    const x = (s / kdeSteps) * maxSec;
    const density = durations.reduce((sum, xi) => sum + gaussian(x, xi), 0) / n;
    kdePoints.push(density);
  }
  const kdeMax = Math.max(...kdePoints);
  // Scale KDE to match histogram height
  const kdeScale = maxCount / (kdeMax * (bucketSize * n / durations.length));

  ctx.strokeStyle = "#f472b6";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  kdePoints.forEach((density, s) => {
    const px = PAD.left + (s / kdeSteps) * chartW;
    // KDE density → histogram count scale: density * bucketSize * n
    const scaledVal = Math.min(density * bucketSize * n, maxCount);
    const py = PAD.top + chartH - (scaledVal / maxCount) * chartH;
    s === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  });
  ctx.stroke();

  // Legend for KDE line
  ctx.fillStyle = "#f472b6";
  ctx.font = "10px Inter, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("── KDE", W - PAD.right, PAD.top - 8);

  drawVLine(ctx, PAD.left + (avgDuration / maxSec) * chartW, PAD, chartH, "#fbbf24", "avg");
  xLabelsMinutes(ctx, PAD, H, chartW, maxSec);
  drawAxes(ctx, PAD, W, H, chartH);
}

// ── 2. CDF ───────────────────────────────────────────────────────────────────

function drawCDFChart(durations) {
  const canvas = document.getElementById("stats-cdf");
  if (!canvas || durations.length === 0) return;
  canvas.style.display = "block";

  const PAD = { top: 24, right: 20, bottom: 40, left: 44 };
  const { ctx, W, H, chartW, chartH } = chartBase(canvas, PAD);
  const sorted = [...durations].sort((a, b) => a - b);
  const maxSec = sorted[sorted.length - 1];
  const n = sorted.length;

  ctx.fillStyle = "#ccc";
  ctx.font = "bold 11px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Cumulative Distribution (CDF)", PAD.left, PAD.top - 8);

  // Y gridlines at 25% increments
  for (let g = 0; g <= 4; g++) {
    const y = PAD.top + chartH - (g / 4) * chartH;
    ctx.strokeStyle = "#2e2e4e";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(PAD.left + chartW, y);
    ctx.stroke();
    ctx.fillStyle = "#888";
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${g * 25}%`, PAD.left - 4, y + 3);
  }

  // CDF step line
  ctx.strokeStyle = "#60a5fa";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top + chartH);
  sorted.forEach((d, i) => {
    const px = PAD.left + (d / maxSec) * chartW;
    const py = PAD.top + chartH - ((i + 1) / n) * chartH;
    ctx.lineTo(px, py);
  });
  ctx.stroke();

  // Median line (50%)
  const median = sorted[Math.floor(n / 2)];
  drawVLine(ctx, PAD.left + (median / maxSec) * chartW, PAD, chartH, "#a78bfa", "50%");

  xLabelsMinutes(ctx, PAD, H, chartW, maxSec);
  drawAxes(ctx, PAD, W, H, chartH);
}

// ── 3. Day-of-week average ────────────────────────────────────────────────────

function drawDayOfWeekChart(entries) {
  const canvas = document.getElementById("stats-dow");
  if (!canvas || entries.length === 0) return;
  canvas.style.display = "block";

  const PAD = { top: 24, right: 20, bottom: 40, left: 50 };
  const { ctx, W, H, chartW, chartH } = chartBase(canvas, PAD);

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const sums = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  entries.forEach(({ date, duration }) => {
    const dow = new Date(date).getDay();
    sums[dow] += duration;
    counts[dow]++;
  });
  const avgs = sums.map((s, i) => counts[i] > 0 ? s / counts[i] : 0);
  const maxAvg = Math.max(...avgs);

  ctx.fillStyle = "#ccc";
  ctx.font = "bold 11px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Average Length by Day of Week", PAD.left, PAD.top - 8);

  drawGridlines(ctx, PAD, chartW, chartH, maxAvg / 60, 4);
  // Override gridline labels to show minutes
  for (let g = 0; g <= 4; g++) {
    const y = PAD.top + chartH - (g / 4) * chartH;
    ctx.fillStyle = "#888";
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${Math.round((g / 4) * maxAvg / 60)}m`, PAD.left - 4, y + 3);
  }

  const barW = chartW / 7;
  avgs.forEach((avg, i) => {
    if (avg === 0) return;
    const barH = (avg / maxAvg) * chartH;
    const x = PAD.left + i * barW;
    const y = PAD.top + chartH - barH;
    const hue = 140 + i * 20;
    ctx.fillStyle = `hsl(${hue}, 65%, 52%)`;
    ctx.fillRect(x + 4, y, barW - 8, barH);

    // Duration label on top of bar
    ctx.fillStyle = "#eee";
    ctx.font = "9px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(formatTime(avg), x + barW / 2, y - 3);
  });

  // X labels
  ctx.fillStyle = "#aaa";
  ctx.font = "11px Inter, sans-serif";
  ctx.textAlign = "center";
  DAYS.forEach((day, i) => {
    const x = PAD.left + i * barW + barW / 2;
    ctx.fillText(day, x, H - PAD.bottom + 14);
  });

  drawAxes(ctx, PAD, W, H, chartH);
}
closeBtn.onclick = () => {
  audio.pause();
  player.classList.add("hidden");
};
