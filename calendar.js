const monthsEl = document.getElementById("months");
const player = document.getElementById("player");
const audio = document.getElementById("audio");
const playerDate = document.getElementById("player-date");
const playerAudioStatus = document.getElementById("player-audio-status");
const launchHelp = document.getElementById("launch-help");
const launchHelpStatus = document.getElementById("launch-help-status");
const closeBtn = document.getElementById("close");
const dayNoteInput = document.getElementById("day-note");
const notesDirStatus = document.getElementById("notes-dir-status");
const recordBtn = document.getElementById("record-btn");
const speechBtn = document.getElementById("speech-btn");
const speechAudioBtn = document.getElementById("speech-audio-btn");
const speechStatus = document.getElementById("speech-status");

let recorder = null;
let recordedChunks = [];
let recording = false;
let currentDayEl = null;
let speechRecognition = null;
let speechListening = false;
let speechSupported = false;
let transcribingSavedAudio = false;
let suppressSpeechStoppedStatus = false;

const dayElements = new Map();
const notesByDate = {};

let noteSaveTimeout = null;
let noteSaveRevision = 0;
let lastSavedRevision = -1;


// check to see if recording works
if (!navigator.mediaDevices || !window.MediaRecorder) {
  recordBtn.disabled = true;
  recordBtn.textContent = "Recording not supported";
}

const SpeechRecognitionCtor =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

if (!SpeechRecognitionCtor) {
  speechBtn.disabled = true;
  speechAudioBtn.disabled = true;
  speechBtn.textContent = "Dictation unavailable";
} else {
  speechSupported = true;
  speechRecognition = new SpeechRecognitionCtor();
  speechRecognition.continuous = true;
  speechRecognition.interimResults = true;
  speechRecognition.lang = navigator.language || "en-US";
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

function normalizeNote(note) {
  return note.replace(/\r\n/g, "\n");
}

function noteHasContent(note) {
  return note.trim().length > 0;
}

function getNotePreview(note) {
  return note.replace(/\s+/g, " ").trim().slice(0, 36);
}

function updateDayNoteUI(dayEl, note) {
  const previewEl = dayEl.querySelector(".day-note-preview");
  const normalized = normalizeNote(note || "");
  const hasNote = noteHasContent(normalized);

  dayEl.classList.toggle("has-note", hasNote);
  previewEl.textContent = hasNote ? getNotePreview(normalized) : "";
  dayEl.title = hasNote ? normalized : "";
}

function setNoteForDate(dateStr, note) {
  const normalized = normalizeNote(note);
  if (noteHasContent(normalized)) {
    notesByDate[dateStr] = normalized;
  } else {
    delete notesByDate[dateStr];
  }

  const dayEl = dayElements.get(dateStr);
  if (dayEl) {
    updateDayNoteUI(dayEl, notesByDate[dateStr] || "");
  }
}

function showAudioStatus(message) {
  playerAudioStatus.textContent = message;
  playerAudioStatus.classList.remove("hidden");
}

function hideAudioStatus() {
  playerAudioStatus.textContent = "";
  playerAudioStatus.classList.add("hidden");
}

function setNotesStatus(message) {
  notesDirStatus.textContent = message;
}

function setLaunchHelpStatus(message, isWarning = false) {
  launchHelpStatus.innerHTML = message;
  launchHelp.classList.toggle("warning", isWarning);
}

function setNotesInputEnabled(enabled) {
  dayNoteInput.disabled = !enabled;
  speechBtn.disabled = !enabled || !speechSupported;
  speechAudioBtn.disabled = !enabled || !speechSupported;
  if (!enabled) {
    stopSpeechRecognition();
    dayNoteInput.value = "";
  }
}

function setSpeechStatus(message) {
  speechStatus.textContent = message;
  speechStatus.classList.remove("hidden");
}

function hideSpeechStatus() {
  speechStatus.textContent = "";
  speechStatus.classList.add("hidden");
}

function updateSpeechButton() {
  speechBtn.classList.toggle("is-listening", speechListening);
  speechAudioBtn.classList.toggle("is-listening", transcribingSavedAudio);
  speechBtn.textContent = speechListening && !transcribingSavedAudio ? "Stop Dictation" : "Start Dictation";
  speechAudioBtn.textContent = transcribingSavedAudio ? "Stop Audio Transcription" : "Transcribe Saved Audio";
}

function appendTranscriptToNote(transcript) {
  const clean = transcript.replace(/\s+/g, " ").trim();
  if (!clean || !currentDateStr) return;

  const separator = dayNoteInput.value.trim().length > 0 ? " " : "";
  dayNoteInput.value += `${separator}${clean}`;
  dayNoteInput.dispatchEvent(new Event("input", { bubbles: true }));
}

function stopSpeechRecognition() {
  transcribingSavedAudio = false;
  audio.onended = null;
  updateSpeechButton();
  if (!speechRecognition || !speechListening) return;
  suppressSpeechStoppedStatus = true;
  speechRecognition.stop();
}

async function startSavedAudioTranscription() {
  console.log("[saved-audio-transcription] start", {
    hasSpeechRecognition: Boolean(speechRecognition),
    currentDateStr,
    noteInputDisabled: dayNoteInput.disabled,
    currentSrc: audio.currentSrc,
    src: audio.src,
    readyState: audio.readyState,
    paused: audio.paused,
  });

  if (!speechRecognition || !currentDateStr || dayNoteInput.disabled) return;

  const playableSource = audio.currentSrc || audio.src;
  console.log("[saved-audio-transcription] resolved playable source", {
    playableSource,
  });

  if (!playableSource) {
    console.log("[saved-audio-transcription] abort: no playable source");
    setSpeechStatus("No saved audio is loaded for this day yet.");
    return;
  }

  transcribingSavedAudio = true;
  console.log("[saved-audio-transcription] marked transcribingSavedAudio=true");
  updateSpeechButton();
  hideSpeechStatus();
  speechRecognition.lang = navigator.language || "en-US";
  console.log("[saved-audio-transcription] configured speech recognition", {
    lang: speechRecognition.lang,
  });

  audio.pause();
  audio.currentTime = 0;
  console.log("[saved-audio-transcription] reset audio before playback", {
    currentTime: audio.currentTime,
    paused: audio.paused,
  });
  audio.onended = () => {
    console.log("[saved-audio-transcription] audio ended", {
      transcribingSavedAudio,
      currentTime: audio.currentTime,
      duration: audio.duration,
    });
    if (!transcribingSavedAudio) return;
    transcribingSavedAudio = false;
    console.log("[saved-audio-transcription] marked transcribingSavedAudio=false from onended");
    updateSpeechButton();
    stopSpeechRecognition();
    setSpeechStatus("Saved-audio transcription finished. Review the note text for accuracy.");
  };

  try {
    console.log("[saved-audio-transcription] attempting audio.play()");
    await audio.play();
    console.log("[saved-audio-transcription] audio.play() resolved", {
      currentTime: audio.currentTime,
      paused: audio.paused,
      readyState: audio.readyState,
    });
  } catch {
    console.log("[saved-audio-transcription] audio.play() failed", {
      currentTime: audio.currentTime,
      paused: audio.paused,
      readyState: audio.readyState,
    });
    transcribingSavedAudio = false;
    updateSpeechButton();
    setSpeechStatus("Audio playback could not start. Click play once, then try saved-audio transcription again.");
    return;
  }

  try {
    console.log("[saved-audio-transcription] attempting speechRecognition.start()", {
      speechListening,
      transcribingSavedAudio,
    });
    speechRecognition.start();
    console.log("[saved-audio-transcription] speechRecognition.start() returned without throwing");
    setSpeechStatus("Playing the saved entry and listening for dictated text. Speakers or Stereo Mix work better than headphones.");
  } catch (error) {
    console.log("[saved-audio-transcription] speechRecognition.start() threw", {
      error,
      speechListening,
      transcribingSavedAudio,
    });
    transcribingSavedAudio = false;
    updateSpeechButton();
    audio.pause();
    setSpeechStatus("Saved-audio transcription could not start. If dictation is already active, stop it and try again.");
  }
}

function initSpeechRecognition() {
  if (!speechRecognition) return;

  speechRecognition.onstart = () => {
    console.log("[speech-recognition] onstart", {
      currentDateStr,
      speechListening,
      transcribingSavedAudio,
      lang: speechRecognition.lang,
    });
    speechListening = true;
    updateSpeechButton();
    setSpeechStatus("Listening. Speak now and your words will be added to the note.");
  };

  speechRecognition.onend = () => {
    console.log("[speech-recognition] onend", {
      currentDateStr,
      speechListening,
      transcribingSavedAudio,
      suppressSpeechStoppedStatus,
      audioCurrentTime: audio.currentTime,
      audioDuration: audio.duration,
      audioPaused: audio.paused,
    });
    speechListening = false;
    transcribingSavedAudio = false;
    audio.onended = null;
    updateSpeechButton();
    if (suppressSpeechStoppedStatus) {
      console.log("[speech-recognition] onend suppressed status update");
      suppressSpeechStoppedStatus = false;
      return;
    }
    if (!speechStatus.textContent.includes("added")) {
      console.log("[speech-recognition] onend setting default stopped status");
      setSpeechStatus("Dictation stopped.");
    }
  };

  speechRecognition.onerror = (event) => {
    console.log("[speech-recognition] onerror", {
      error: event.error,
      message: event.message,
      currentDateStr,
      speechListening,
      transcribingSavedAudio,
      audioCurrentTime: audio.currentTime,
      audioDuration: audio.duration,
      audioPaused: audio.paused,
    });
    speechListening = false;
    transcribingSavedAudio = false;
    audio.onended = null;
    audio.pause();
    updateSpeechButton();

    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      setSpeechStatus("Microphone permission was blocked. Allow mic access for this site and try again.");
      return;
    }

    if (event.error === "no-speech") {
      setSpeechStatus("No speech detected. Try again and speak a little closer to the microphone.");
      return;
    }

    if (event.error === "audio-capture") {
      setSpeechStatus("No microphone was available for browser dictation.");
      return;
    }

    setSpeechStatus(`Dictation error: ${event.error}.`);
  };

  speechRecognition.onresult = (event) => {
    console.log("[speech-recognition] onresult received", {
      resultIndex: event.resultIndex,
      resultsLength: event.results.length,
      currentDateStr,
      transcribingSavedAudio,
    });
    let finalTranscript = "";
    let interimTranscript = "";

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0]?.transcript || "";
      console.log("[speech-recognition] result item", {
        index: i,
        isFinal: event.results[i].isFinal,
        transcript,
        confidence: event.results[i][0]?.confidence,
      });
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    if (finalTranscript.trim()) {
      console.log("[speech-recognition] final transcript", {
        finalTranscript: finalTranscript.trim(),
      });
      appendTranscriptToNote(finalTranscript);
      setSpeechStatus("Latest phrase added to the note. Keep speaking or stop dictation.");
      return;
    }

    if (interimTranscript.trim()) {
      console.log("[speech-recognition] interim transcript", {
        interimTranscript: interimTranscript.trim(),
      });
      setSpeechStatus(`Hearing: "${interimTranscript.trim()}"`);
    }
  };
}

initSpeechRecognition();

function noteFilename(dateStr) {
  return `${dateStr}.txt`;
}

function parseDiaryDate(dateStr) {
  const [yearPart, monthPart, dayPart] = dateStr.split("-").map(Number);
  return new Date(yearPart, monthPart - 1, dayPart);
}

function refreshAllNotePreviews() {
  for (const [dateStr, dayEl] of dayElements.entries()) {
    updateDayNoteUI(dayEl, notesByDate[dateStr] || "");
  }
}

async function loadAllNotes() {
  const response = await fetch("/api/notes", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load notes index");
  }

  const payload = await response.json();
  Object.keys(notesByDate).forEach((key) => delete notesByDate[key]);

  for (const [dateStr, note] of Object.entries(payload)) {
    const normalized = normalizeNote(String(note || ""));
    if (noteHasContent(normalized)) {
      notesByDate[dateStr] = normalized;
    }
  }

  refreshAllNotePreviews();

  if (currentDateStr) {
    dayNoteInput.value = notesByDate[currentDateStr] || "";
  }
}

async function saveNoteFile(dateStr, note) {
  const response = await fetch(`/api/notes/${dateStr}`, {
    method: "PUT",
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
    body: note,
  });

  if (!response.ok) {
    throw new Error(`Could not save ${noteFilename(dateStr)}`);
  }
}

async function deleteNoteFile(dateStr) {
  const response = await fetch(`/api/notes/${dateStr}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`Could not delete ${noteFilename(dateStr)}`);
  }
}

async function persistNoteForDate(dateStr) {
  if (!dateStr) return;

  const note = notesByDate[dateStr] || "";
  if (noteHasContent(note)) {
    await saveNoteFile(dateStr, note);
  } else {
    await deleteNoteFile(dateStr);
  }

  lastSavedRevision = noteSaveRevision;
  setNotesStatus(`Saved ${noteFilename(dateStr)}.`);
}

function primeNotesFromFolder() {
  if (window.location.protocol === "file:") {
    setNotesStatus("Open this diary through http://127.0.0.1:8765, not as a file:// page. Notes cannot load or save over file://.");
    setLaunchHelpStatus("You opened this page as <code>file://</code>. Use <code>start_diary.cmd</code>, then open <code>http://127.0.0.1:8765</code>.", true);
    setNotesInputEnabled(false);
    return;
  }

  setNotesStatus("Notes load automatically from notes/YYYY-MM-DD.txt.");
  setLaunchHelpStatus(`Connected through <code>${window.location.origin}</code>. This is the correct way to run the diary.`);
  setNotesInputEnabled(true);
  loadAllNotes()
    .then(() => {
      setNotesStatus("Loaded notes from notes/YYYY-MM-DD.txt.");
    })
    .catch(() => {
      setNotesStatus("Failed to load notes from the notes folder.");
    });
}

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
    dayEl.innerHTML = `
      <span class="day-number">${day}</span>
      <span class="day-note-preview"></span>
    `;
    dayElements.set(dateStr, dayEl);

    if (dateStr === todayStr) {
        dayEl.classList.add("today");
        before_today = false;
    }
    if (before_today) {
        dayEl.classList.add("past");
    } else {
        dayEl.classList.add("future");
    }

    updateDayNoteUI(dayEl, notesByDate[dateStr] || "");

    dayEl.onclick = () => {
        currentDayEl = dayEl;
        currentDateStr = dateStr;
        stopSpeechRecognition();
        hideSpeechStatus();
        speechAudioBtn.disabled = !speechSupported;
        playerDate.textContent = dateStr;
        dayNoteInput.value = notesByDate[dateStr] || "";
        hideAudioStatus();

        // Clear previous sources
        audio.pause();
        audio.innerHTML = "";
        
        let hasPlayableAudio = false;
        // if can play then mark
        audio.oncanplay = () => {
            hasPlayableAudio = true;
            dayEl.classList.add("has-audio");
            speechAudioBtn.disabled = dayNoteInput.disabled || !speechSupported;
            hideAudioStatus();
        };
        audio.onerror = () => {
            if (!hasPlayableAudio) {
                speechAudioBtn.disabled = true;
                showAudioStatus("No saved audio for this day yet. Use the addendum below if you forgot to mention something.");
            }
        };
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

dayNoteInput.oninput = () => {
  if (!currentDateStr) return;
  const dateStr = currentDateStr;
  setNoteForDate(dateStr, dayNoteInput.value);
  noteSaveRevision += 1;

  clearTimeout(noteSaveTimeout);
  noteSaveTimeout = setTimeout(async () => {
    try {
      await persistNoteForDate(dateStr);
    } catch {
      setNotesStatus(`Failed to save ${noteFilename(dateStr)}.`);
    }
  }, 250);
};

dayNoteInput.onblur = async () => {
  if (!currentDateStr) return;

  clearTimeout(noteSaveTimeout);
  try {
    await persistNoteForDate(currentDateStr);
  } catch {
    setNotesStatus(`Failed to save ${noteFilename(currentDateStr)}.`);
  }
};

speechBtn.onclick = () => {
  if (!speechRecognition || !currentDateStr || dayNoteInput.disabled) return;

  if (speechListening || transcribingSavedAudio) {
    stopSpeechRecognition();
    return;
  }

  hideSpeechStatus();
  speechRecognition.lang = navigator.language || "en-US";
  speechRecognition.start();
};


speechAudioBtn.onclick = async () => {
  console.log("Speech AUDIO button || Speech audio button clicked. Listening:", speechListening, "Transcribing saved audio:", transcribingSavedAudio);
  
  if (!speechRecognition || !currentDateStr || dayNoteInput.disabled) return;
  console.log("Speech AUDIO button || Speech Recognition available")
  if (speechListening || transcribingSavedAudio) {
    stopSpeechRecognition();
    audio.pause();
    setSpeechStatus("Speech AUDIO button || Saved-audio transcription stopped.");
    return;
  }

   console.log("Speech AUDIO button || Preparing to start speech recognition. ")


  await startSavedAudioTranscription();
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
    ? durations.reduce((sum, d) => sum + (d - avgDuration) ** 2, 0) / (count - 1)
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
  drawMonthlyAverageChart(entries);
};

function computeStreaks(recordedDates) {
  let longest = 0, current = 0, prev = null;
  const sorted = [...recordedDates].sort();
  for (const d of sorted) {
    const dt = parseDiaryDate(d);
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
  const yesterday = parseDiaryDate(todayStr);
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr =
    yesterday.getFullYear() + "-" +
    String(yesterday.getMonth() + 1).padStart(2, "0") + "-" +
    String(yesterday.getDate()).padStart(2, "0");
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
    const dow = parseDiaryDate(date).getDay();
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

function drawMonthlyAverageChart(entries) {
  const canvas = document.getElementById("stats-monthly");
  if (!canvas || entries.length === 0) return;
  canvas.style.display = "block";

  const PAD = { top: 24, right: 20, bottom: 40, left: 50 };
  const { ctx, W, H, chartW, chartH } = chartBase(canvas, PAD);

  const sums = new Array(12).fill(0);
  const counts = new Array(12).fill(0);
  entries.forEach(({ date, duration }) => {
    const month = Number(date.slice(5, 7)) - 1;
    sums[month] += duration;
    counts[month] += 1;
  });

  const avgs = sums.map((sum, i) => counts[i] > 0 ? sum / counts[i] : 0);
  const maxAvg = Math.max(...avgs);
  if (maxAvg <= 0) return;

  ctx.fillStyle = "#ccc";
  ctx.font = "bold 11px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Average Length by Month", PAD.left, PAD.top - 8);

  drawGridlines(ctx, PAD, chartW, chartH, maxAvg / 60, 4);
  for (let g = 0; g <= 4; g++) {
    const y = PAD.top + chartH - (g / 4) * chartH;
    ctx.fillStyle = "#888";
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${Math.round((g / 4) * maxAvg / 60)}m`, PAD.left - 4, y + 3);
  }

  const barW = chartW / 12;
  avgs.forEach((avg, i) => {
    if (avg === 0) return;
    const barH = (avg / maxAvg) * chartH;
    const x = PAD.left + i * barW;
    const y = PAD.top + chartH - barH;
    const hue = 190 + i * 9;
    ctx.fillStyle = `hsl(${hue}, 70%, 56%)`;
    ctx.fillRect(x + 4, y, barW - 8, barH);

    ctx.fillStyle = "#eee";
    ctx.font = "9px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(formatTime(avg), x + barW / 2, y - 3);
  });

  ctx.fillStyle = "#aaa";
  ctx.font = "11px Inter, sans-serif";
  ctx.textAlign = "center";
  monthNames.forEach((month, i) => {
    const x = PAD.left + i * barW + barW / 2;
    ctx.fillText(month.slice(0, 3), x, H - PAD.bottom + 14);
  });

  drawAxes(ctx, PAD, W, H, chartH);
}
closeBtn.onclick = () => {
  audio.pause();
  stopSpeechRecognition();
  hideSpeechStatus();
  speechAudioBtn.disabled = !speechSupported;
  player.classList.add("hidden");
};

window.addEventListener("beforeunload", () => {
  if (!currentDateStr || lastSavedRevision === noteSaveRevision) return;

  const note = notesByDate[currentDateStr] || "";
  const url = `/api/notes/${currentDateStr}`;

  try {
    if (noteHasContent(note)) {
      fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
        body: note,
        keepalive: true,
      }).catch(() => {});
    } else {
      fetch(url, { method: "DELETE", keepalive: true }).catch(() => {});
    }
  } catch {}
});

primeNotesFromFolder();
