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

let currentDateStr = null;

// Abstraction so we can easily check for multiple audio formats
const AUDIO_EXTS = ["mp3", "m4a", "wav", "ogg"];

async function findAudioForDate(dateStr) {
  for (const ext of AUDIO_EXTS) {
    const path = `audio/${dateStr}.${ext}`;
    try {
      const res = await fetch(path, { method: "HEAD" });
      if (res.ok) return path;
    } catch {}
  }
  return null;
}

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

    const audioPath = `audio/${dateStr}.mp3`;

    fetch(audioPath, { method: "HEAD" }).then(r => {
      if (r.ok) dayEl.classList.add("has-audio");
    });

    dayEl.onclick = () => {
      currentDateStr = dateStr;
      playerDate.textContent = dateStr;
      audio.src = audioPath;
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
