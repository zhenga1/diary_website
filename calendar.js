const monthsEl = document.getElementById("months");
const player = document.getElementById("player");
const audio = document.getElementById("audio");
const playerDate = document.getElementById("player-date");
const closeBtn = document.getElementById("close");
const recordBtn = document.getElementById("record-btn");

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

monthNames.forEach((name, month) => {
  const monthEl = document.createElement("section");
  monthEl.className = "month";
  monthEl.innerHTML = `<h2>${name}</h2><div class="days"></div>`;
  const daysEl = monthEl.querySelector(".days");

  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dayEl = document.createElement("div");
    dayEl.className = "day";
    dayEl.textContent = day;

    if (dateStr === todayStr) {
        dayEl.classList.add("today");
    }

    dayEl.onclick = () => {
        currentDateStr = dateStr;
        playerDate.textContent = dateStr;

        // Clear previous sources
        audio.pause();
        audio.innerHTML = "";
        
        // if can play then mark
        audio.oncanplay = () => {
            dayEl.classList.add("has-audio");
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

closeBtn.onclick = () => {
  audio.pause();
  player.classList.add("hidden");
};
