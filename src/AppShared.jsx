const DAYS = ["Ponedeljak", "Utorak", "Sreda", "Četvrtak", "Petak", "Subota", "Nedelja"];
const DAY_SHORT = ["Pon", "Uto", "Sre", "Čet", "Pet", "Sub", "Ned"];
function todayIndex() {
  const d = new Date().getDay(); // 0 = Sunday
  return d === 0 ? 6 : d - 1;
}

function isoMonday(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - (day === 0 ? 6 : day - 1);
  const monday = new Date(d.setDate(diff));
  return localDateId(monday);
}

function formatWeekRange(weekId) {
  const [year, month, day] = weekId.split("-").map(Number);
  const start = new Date(year, month - 1, day);
  const end = new Date(year, month - 1, day + 6);
  const format = (date) => date.toLocaleDateString("sr-RS");
  return `${format(start)} - ${format(end)}`;
}

function localDateId(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addCalendarMonth(dateId) {
  const [year, month, day] = dateId.split("-").map(Number);
  const nextMonth = new Date(year, month, 1);
  const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
  nextMonth.setDate(Math.min(day, lastDay));
  return localDateId(nextMonth);
}

function dateIdFromTimestamp(timestamp) {
  return localDateId(new Date(timestamp));
}

function emptyWeek(weekId) {
  return {
    weekId,
    label: formatWeekRange(weekId),
    days: DAYS.map((day) => ({ day, exercises: [] })),
  };
}

function newExercise() {
  return {
    id: Math.random().toString(36).slice(2, 9),
    name: "",
    videoUrl: "",
    sets: 3,
    repsMin: 6,
    repsMax: 12,
    weight: 0,
    rest: 90,
    done: false,
    note: "",
  };
}

function youtubeEmbed(url) {
  if (!url) return null;
  let id = null;
  const m1 = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
  const m2 = url.match(/[?&]v=([a-zA-Z0-9_-]+)/);
  if (m1) id = m1[1];
  else if (m2) id = m2[1];
  return id ? `https://www.youtube.com/embed/${id}` : null;
}

async function compressImage(file, maxDim = 1200, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h && w > maxDim) { h = (h * maxDim) / w; w = maxDim; }
        else if (h > maxDim) { w = (w * maxDim) / h; h = maxDim; }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Could not prepare image for upload."));
          return;
        }
        context.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("Could not compress image."));
            return;
          }
          resolve(blob);
        }, "image/jpeg", quality);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- UI atoms ----------
function Panel({ children, className = "" }) {
  return (
    <div className={`app-panel bg-white ${className}`}>
      {children}
    </div>
  );
}
function Header({ children }) {
  return (
    <h2 className="app-section-title font-black uppercase tracking-wide text-neutral-900 text-lg mb-3">
      {children}
    </h2>
  );
}
function WeightHistory({ bodylog }) {
  const entries = bodylog.slice().sort((a, b) =>
    (b.measured_at || b.date).localeCompare(a.measured_at || a.date)
  );
  return (
    <div className="mt-4 border-t border-neutral-100 pt-4">
      <h3 className="mb-2 text-sm font-bold text-[#19352c]">Istorija merenja</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-neutral-500">Još nema unetih merenja.</p>
      ) : (
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {entries.map((entry, index) => (
            <div key={entry.id || `${entry.measured_at || entry.date}-${index}`} className="flex items-start justify-between gap-3 rounded-xl bg-[#f6f8f5] px-3 py-2">
              <div>
                <p className="text-sm font-bold text-[#19352c]">{new Date(`${entry.measured_at || entry.date}T00:00:00`).toLocaleDateString("sr-RS")}</p>
                {entry.note && <p className="mt-0.5 whitespace-pre-wrap text-xs text-neutral-500">{entry.note}</p>}
              </div>
              <span className="shrink-0 font-mono text-sm font-bold">{entry.weight} kg</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function Btn({ children, onClick, color = "blue", className = "", type = "button", disabled }) {
  const colors = {
    blue: "bg-[#2F6FB0] hover:bg-[#255a8f] text-white",
    red: "bg-[#E14B4B] hover:bg-[#c93d3d] text-white",
    green: "bg-[#3F9142] hover:bg-[#337536] text-white",
    ghost: "bg-transparent border-2 border-neutral-900 text-neutral-900 hover:bg-neutral-100",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`app-button px-3 py-2 rounded-lg font-bold text-sm transition disabled:opacity-40 disabled:cursor-not-allowed ${colors[color]} ${className}`}
    >
      {children}
    </button>
  );
}
const inputCls = "w-full mt-1 px-2 py-1.5 border-2 border-neutral-300 rounded-lg focus:border-neutral-900 outline-none font-mono text-sm";

export { DAYS, DAY_SHORT, todayIndex, isoMonday, formatWeekRange, localDateId, addCalendarMonth, dateIdFromTimestamp, emptyWeek, newExercise, youtubeEmbed, compressImage, Panel, Header, WeightHistory, Btn, inputCls };
