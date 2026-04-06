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

  const year = 2026;

  let breakOuter = false;
  for (let month = 0; month < 12; month++) {
    if (breakOuter) break;
    const days = new Date(year, month + 1, 0).getDate();

    for (let day = 1; day <= days; day++) {

      const dateStr =
        `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      // ✅ STOP at today (correct)
      if (dateStr >= todayStr){
        breakOuter = true;
        break;
      }

      statsOutput.textContent = `Analyzing ${dateStr}...`;

      // 👇 FORCE UI update 
      await nextFrame();
      const duration = await getAudioDuration(dateStr);

      if (duration === null) continue;

      if (duration > longest.duration) {
        longest = { duration, date: dateStr };
      }

      if (duration < shortest.duration) {
        shortest = { duration, date: dateStr };
      }
    }
  }

  // 👇 FORCE UI update
  await nextFrame();
  statsOutput.innerHTML = `
    🟢 Longest: ${longest.date} (${formatTime(longest.duration)})<br>
    🔵 Shortest: ${shortest.date} (${formatTime(shortest.duration)})
  `;
};
closeBtn.onclick = () => {
  audio.pause();
  player.classList.add("hidden");
};
