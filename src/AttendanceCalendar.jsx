import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DAY_SHORT, localDateId, Panel, Header } from "./AppShared";

export default function AttendanceCalendar({ dates }) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const visited = new Set(dates);
  const monthName = visibleMonth.toLocaleDateString("sr-RS", { month: "long", year: "numeric" });

  return (
    <Panel className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <Header>Kalendar dolazaka</Header>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Prethodni mesec"
            className="rounded-lg p-2 hover:bg-neutral-100"
            onClick={() => setVisibleMonth(new Date(year, month - 1, 1))}
          ><ChevronLeft size={18} /></button>
          <span className="min-w-32 text-center text-sm font-bold capitalize">{monthName}</span>
          <button
            type="button"
            aria-label="Sledeći mesec"
            className="rounded-lg p-2 hover:bg-neutral-100"
            onClick={() => setVisibleMonth(new Date(year, month + 1, 1))}
          ><ChevronRight size={18} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {DAY_SHORT.map((day) => (
          <span key={day} className="py-2 text-[10px] font-bold uppercase text-neutral-400">{day}</span>
        ))}
        {Array.from({ length: firstWeekday }, (_, index) => (
          <span key={`empty-${index}`} aria-hidden="true" />
        ))}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const dayNumber = index + 1;
          const dateId = localDateId(new Date(year, month, dayNumber));
          const hasAttendance = visited.has(dateId);
          return (
            <div
              key={dateId}
              title={hasAttendance ? "Trening predat" : undefined}
              className={`grid aspect-square place-items-center rounded-xl text-sm ${
                hasAttendance ? "bg-[#3F765D] font-black text-white shadow-sm" : "text-neutral-600"
              }`}
            >
              {dayNumber}
            </div>
          );
        })}
      </div>
      <p className="mt-4 flex items-center gap-2 text-xs text-neutral-500">
        <span className="h-3 w-3 rounded bg-[#3F765D]" /> Predat trening
        <span className="ml-auto font-semibold">{dates.length} {dates.length === 1 ? "dolazak" : "dolazaka"} ukupno</span>
      </p>
    </Panel>
  );
}
