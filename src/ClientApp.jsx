import { useEffect, useRef, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Dumbbell, User, Users, Calendar, Utensils, TrendingUp, Camera, Bell, Plus, Trash2, ChevronRight, ChevronLeft, LogOut, Mail, RefreshCw, Video, X, ArrowUp, Edit3, Save, Lock } from "lucide-react";
import { storeGet, storeSet } from "./lib/storage";
import { supabase } from "./lib/supabaseClient";
import { getClientNutrition } from "./lib/profiles";
import { getTrainingProgram, getTrainingPrograms } from "./lib/training_programs";
import { getWorkoutReports, submitWorkoutReport } from "./lib/workout_reports";
import { createNotification } from "./lib/notifications";
import AttendanceCalendar from "./AttendanceCalendar";
import { DAYS, DAY_SHORT, todayIndex, isoMonday, formatWeekRange, localDateId, addCalendarMonth, dateIdFromTimestamp, emptyWeek, newExercise, youtubeEmbed, compressImage, Panel, Header, WeightHistory, Btn, inputCls } from "./AppShared";

export default function ClientApp({ me, onLogout }) {
  const [tab, setTab] = useState("danas");
  const [selectedDay, setSelectedDay] = useState(null);
  const [program, setProgram] = useState(null);
  const [nutrition, setNutrition] = useState(null);
  const [bodylog, setBodylog] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [adminId, setAdminId] = useState(null);
  const [membership, setMembership] = useState(null);
  const [attendanceDates, setAttendanceDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exerciseUpdates, setExerciseUpdates] = useState({});

  async function loadAll() {
    setLoading(true);
    const [progs, nutr, blog, phs, adminRow, savedReports, savedMembership] = await Promise.all([
      getTrainingPrograms(me.id),
      getClientNutrition(me.id),
      storeGet(`bodylog-${me.id}`),
      storeGet(`photos-${me.id}`),
      supabase.from("profiles").select("id").eq("role", "admin").limit(1).maybeSingle(),
      getWorkoutReports(me.id),
      storeGet(`membership-${me.id}`),
    ]);
    const weeks = progs || [];
    const currentWeekId = isoMonday();
    const currentWeek = weeks.find((week) => week.weekId === currentWeekId);
    const cur = currentWeek
      ? {
          ...currentWeek,
          days: currentWeek.days.map((day, dayIdx) => {
            const report = (savedReports || []).find(
              (item) => item.week_start === currentWeekId && item.day_index === dayIdx
            );
            return report ? { ...day, submittedAt: report.submitted_at } : day;
          }),
        }
      : null;
    setProgram(cur);
    setNutrition(nutr);
    setBodylog(blog || []);
    setPhotos(phs || []);
    setAdminId(adminRow?.data?.id || null);
    setMembership(savedMembership);
    const submittedDates = new Set([
      ...(savedReports || []).map((report) => report.workout_date),
      ...weeks.flatMap((week) => week.days.flatMap((day) =>
        day.submittedAt ? [dateIdFromTimestamp(day.submittedAt)] : []
      )),
    ]);
    setAttendanceDates([...submittedDates]);
    const savedExerciseUpdates = {};
    (savedReports || []).forEach((report) => {
      report.exercises.forEach((exercise) => {
        savedExerciseUpdates[exercise.id] = {
          done: Boolean(exercise.done),
          actualWeight: exercise.actualWeight ?? "",
          actualReps: exercise.actualReps ?? "",
          note: exercise.note ?? "",
        };
      });
    });
    setExerciseUpdates(savedExerciseUpdates);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (!program) return;
    setExerciseUpdates((current) => {
      const updates = { ...current };
      program.days.forEach((day) => day.exercises.forEach((exercise) => {
        if (!updates[exercise.id]) {
          updates[exercise.id] = {
            done: Boolean(exercise.done),
            actualWeight: exercise.actualWeight ?? "",
            actualReps: exercise.actualReps ?? "",
            note: exercise.note ?? "",
          };
        }
      }));
      return updates;
    });
  }, [program?.weekId]);

  function updateExerciseDraft(exId, field, value) {
    setExerciseUpdates((current) => ({
      ...current,
      [exId]: { ...current[exId], [field]: value },
    }));
  }

  async function submitWorkout(dayIdx) {
    if (!adminId) return { ok: false, error: "Nije pronađen trener kome izveštaj treba poslati." };
    const weekId = isoMonday();
    const w = await getTrainingProgram(me.id, weekId);
    if (!w) return { ok: false, error: "Nema programa za ovu nedelju." };
    const day = w.days[dayIdx];
    if (!day) return { ok: false, error: "Nije pronađen trening za ovaj dan." };
    const submittedExercises = day.exercises.map((exercise) => ({
      ...exercise,
      ...exerciseUpdates[exercise.id],
    }));
    const submittedAt = new Date().toISOString();
    const submittedDate = localDateId(new Date(submittedAt));
    const savedReport = await submitWorkoutReport(
      me.id,
      weekId,
      dayIdx,
      day.day,
      submittedDate,
      submittedExercises
    );
    if (!savedReport) {
      return { ok: false, error: "Nije moguće sačuvati izveštaj. Proveri vezu i pokušaj ponovo." };
    }

    const summary = submittedExercises.map((e) => {
      const actual = e.done
        ? `${e.actualWeight || e.weight}kg × ${e.actualReps || "ponavljanja nisu uneta"} pon.`
        : "nije odrađeno";
      return `${e.name}: ${actual}${e.note ? ` (napomena: ${e.note})` : ""}`;
    }).join("; ");
    const notification = await createNotification(
      adminId,
      savedReport.id,
      `${me.name} je predao/la izveštaj o treningu (${day.day}). ${summary}`
    );
    setProgram({
      ...w,
      days: w.days.map((existingDay, index) =>
        index === dayIdx ? { ...existingDay, submittedAt } : existingDay
      ),
    });
    setAttendanceDates((current) => [...new Set([...current, dateIdFromTimestamp(submittedAt)])]);
    let notificationWarning = null;
    if (!notification.ok) {
      const error = notification.error;
      console.error("Workout report was saved but its notification failed", error);
      notificationWarning = error.code === "42501"
        ? "Trening je sačuvan, ali Supabase je odbio upis obaveštenja (RLS). Proveri INSERT politiku za notifications."
        : `Trening je sačuvan, ali obaveštenje nije upisano${error.message ? `: ${error.message}` : "."}`;
    }
    return {
      ok: true,
      warning: notificationWarning,
    };
  }

  async function addBodylog(entry) {
    const list = await storeGet(`bodylog-${me.id}`) || [];
    list.push({ ...entry, date: localDateId() });
    await storeSet(`bodylog-${me.id}`, list);
    setBodylog(list);
  }

  async function addPhoto(imgData, note) {
    const list = await storeGet(`photos-${me.id}`) || [];
    list.push({ date: localDateId(), img: imgData, note });
    await storeSet(`photos-${me.id}`, list);
    setPhotos(list);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center font-mono text-neutral-400">Učitavanje...</div>;

  const tabDefs = [
    { key: "danas", label: "Danas", icon: <Dumbbell size={16} /> },
    { key: "nedelja", label: "Nedelja", icon: <Calendar size={16} /> },
    { key: "dolasci", label: "Dolasci", icon: <Calendar size={16} /> },
    { key: "ishrana", label: "Ishrana", icon: <Utensils size={16} /> },
    { key: "napredak", label: "Napredak", icon: <TrendingUp size={16} /> },
  ];
  const today = localDateId();
  const paidUntil = membership?.paidUntil || "";
  const membershipDaysLeft = paidUntil
    ? Math.ceil((new Date(`${paidUntil}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000)
    : null;
  const membershipActive = Boolean(paidUntil && paidUntil >= today);

  return (
    <div className="app-shell app-client min-h-screen bg-[#F3F4F1] pb-24">
      <div className="app-header text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="app-brand flex items-center gap-2 font-black uppercase tracking-wide">
          <span className="app-brand-icon"><Dumbbell size={18} /></span> {me.name}
        </div>
        <button className="app-icon-button" onClick={onLogout} aria-label="Odjavi se"><LogOut size={18} /></button>
      </div>

      <div className="app-content max-w-2xl mx-auto p-4">
        {membershipActive ? (
          <>
            <MembershipNotice paidUntil={paidUntil} daysLeft={membershipDaysLeft} />
            {tab === "danas" && (
          <section className="app-welcome mb-5">
            <p className="app-eyebrow">PLAN ZA DANAS</p>
            <h1>Današnji trening</h1>
            <span className="app-day-chip"><Calendar size={14} /> {DAYS[todayIndex()]}</span>
          </section>
        )}
            {tab === "danas" && (
          <ClientToday
            program={program}
            exerciseUpdates={exerciseUpdates}
            onUpdateExercise={updateExerciseDraft}
            onSubmit={submitWorkout}
          />
        )}
            {tab === "nedelja" && (
          selectedDay === null ? (
            <ClientWeek program={program} onSelectDay={setSelectedDay} />
          ) : (
            <ClientDayDetail
              program={program}
              dayIdx={selectedDay}
              locked={selectedDay !== todayIndex()}
              exerciseUpdates={exerciseUpdates}
              onUpdateExercise={updateExerciseDraft}
              onSubmit={submitWorkout}
              onBack={() => setSelectedDay(null)}
            />
          )
        )}
        {tab === "dolasci" && <AttendanceCalendar dates={attendanceDates} />}
        {tab === "ishrana" && <ClientNutrition nutrition={nutrition} />}
            {tab === "napredak" && <ClientProgress bodylog={bodylog} photos={photos} onAddLog={addBodylog} onAddPhoto={addPhoto} />}
          </>
        ) : (
          <Panel className="p-6 text-center">
            <h1 className="text-xl font-black text-[#19352c]">Članarina nije aktivna</h1>
            <p className="mt-2 text-sm text-neutral-600">
              {paidUntil
                ? `Članarina je važila do ${new Date(`${paidUntil}T00:00:00`).toLocaleDateString("sr-RS")}.`
                : "Nemate evidentiranu uplatu članarine."}
            </p>
            <p className="mt-2 text-sm text-neutral-500">Nalog i podaci su sačuvani. Obratite se treneru radi obnove članarine.</p>
          </Panel>
        )}
      </div>

      {membershipActive && <div className="app-bottom-nav app-client-bottom-nav fixed bottom-0 left-0 right-0">
        <div className="app-nav max-w-2xl mx-auto flex">
          {tabDefs.map((t) => (
            <button key={t.key} onClick={() => { setTab(t.key); setSelectedDay(null); }}
              className={`app-nav-item flex-1 py-2.5 flex flex-col items-center gap-0.5 text-[11px] font-bold ${tab === t.key ? "active" : ""}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>}
    </div>
  );
}

function MembershipNotice({ paidUntil, daysLeft }) {
  if (!paidUntil || daysLeft < 0) return null;
  const expiringSoon = daysLeft <= 7;
  return (
    <div className={`mb-4 rounded-xl border p-3 text-sm font-semibold ${
      expiringSoon
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-green-200 bg-green-50 text-green-900"
    }`}>
      Članarina važi do {new Date(`${paidUntil}T00:00:00`).toLocaleDateString("sr-RS")}
      {expiringSoon && (
        <>
          {" "}{daysLeft === 0
            ? "Ističe danas."
            : `Ističe za ${daysLeft} ${daysLeft === 1 ? "dan" : "dana"}.`}
          {" "}Za produženje se obratite treneru.
        </>
      )}
    </div>
  );
}

function ClientToday({ program, exerciseUpdates, onUpdateExercise, onSubmit }) {
  const idx = todayIndex();
  return (
    <ClientDayDetail
      program={program}
      dayIdx={idx}
      locked={false}
      exerciseUpdates={exerciseUpdates}
      onUpdateExercise={onUpdateExercise}
      onSubmit={onSubmit}
    />
  );
}

function ClientDayDetail({ program, dayIdx, locked, exerciseUpdates, onUpdateExercise, onSubmit, onBack }) {
  const day = program?.days?.[dayIdx];
  const [openVideo, setOpenVideo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitWarning, setSubmitWarning] = useState("");
  const submittedToday = day?.submittedAt
    ? dateIdFromTimestamp(day.submittedAt) === localDateId()
    : false;

  function toggleVideo(exercise) {
    setOpenVideo((current) => current === exercise.id ? null : exercise.id);
  }

  async function handleSubmit() {
    setSubmitError("");
    setSubmitWarning("");
    setSubmitting(true);
    try {
      const result = await onSubmit(dayIdx);
      if (!result.ok) setSubmitError(result.error);
      else setSubmitWarning(result.warning || "");
    } catch (error) {
      console.error("Workout report submission failed", error);
      setSubmitError("Došlo je do greške pri slanju. Proveri vezu i pokušaj ponovo.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!program) return <Panel className="p-6 text-center text-neutral-400 font-mono">Trener ti još nije napravio program za ovu nedelju.</Panel>;

  const Back = () => onBack ? (
    <button onClick={onBack} className="flex items-center gap-1 text-xs font-bold text-neutral-500 mb-2">
      <ChevronLeft size={14} /> Nazad na nedelju
    </button>
  ) : null;

  if (!day || day.exercises.length === 0) return (
    <div>
      <Back />
      <Panel className="p-6 text-center text-neutral-400 font-mono">{DAYS[dayIdx]} - nema zakazanih vežbi. Odmor 💪</Panel>
    </div>
  );

  const doneCount = day.exercises.filter((e) => exerciseUpdates[e.id]?.done).length;

  return (
    <div>
      <Back />
      <div className="flex items-center justify-between mb-3">
        <Header>{DAYS[dayIdx]}{locked ? " - pregled" : " - Tvoj trening"}</Header>
        <span className="app-progress-chip font-mono text-xs px-2 py-1 rounded">{doneCount} / {day.exercises.length} urađeno</span>
      </div>
      {locked && (
        <p className="text-xs bg-neutral-100 border-2 border-neutral-200 rounded-lg p-2 mb-2 font-mono text-neutral-500 flex items-center gap-1">
          <Lock size={12} /> Samo pregled - ovaj trening se otključava na sam dan ({DAYS[dayIdx]}).
        </p>
      )}
      <div className="space-y-3">
        {day.exercises.map((ex) => {
          const embed = youtubeEmbed(ex.videoUrl);
          return (
            <Panel key={ex.id} className={`app-exercise-card p-3 ${exerciseUpdates[ex.id]?.done ? "is-done" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                      <p className="font-bold">{ex.name}</p>
                  <p className="font-mono text-sm text-neutral-600">{ex.sets} serije × {ex.repsMin}-{ex.repsMax} ponavljanja · {ex.weight}kg · odmor {ex.rest}s</p>
                </div>
                    <label className="flex items-center gap-2 text-xs font-bold text-neutral-600">
                      <input
                        type="checkbox"
                        checked={Boolean(exerciseUpdates[ex.id]?.done)}
                        onChange={(event) => onUpdateExercise(ex.id, "done", event.target.checked)}
                        disabled={locked || submittedToday}
                        className="h-5 w-5 accent-[#3F765D]"
                      />
                      Urađeno
                    </label>
              </div>
              {ex.videoUrl && (
                <button onClick={() => toggleVideo(ex)} className="mt-2 flex items-center gap-1 text-xs font-bold text-[#2F6FB0]">
                  <Video size={14} /> {openVideo === ex.id ? "Sakrij snimak" : "Pogledaj snimak"}
                </button>
              )}
              {openVideo === ex.id && ex.videoUrl && (
                embed ? (
                  <iframe className="w-full aspect-video rounded-lg mt-2 border-2 border-neutral-900" src={embed} title={ex.name} allowFullScreen />
                ) : (
                  <a href={ex.videoUrl} target="_blank" rel="noreferrer" className="block mt-2 text-xs underline text-[#2F6FB0]">Otvori snimak vežbe</a>
                )
              )}
              {!locked && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="text-[11px] font-bold text-neutral-500">
                    Stvarna težina (kg)
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder={`${ex.weight} kg`}
                      value={exerciseUpdates[ex.id]?.actualWeight ?? ""}
                      onChange={(event) => onUpdateExercise(ex.id, "actualWeight", event.target.value)}
                      disabled={submittedToday}
                      className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
                    />
                  </label>
                  <label className="text-[11px] font-bold text-neutral-500">
                    Stvarno ponavljanja
                    <input
                      type="number"
                      min="0"
                      placeholder={`${ex.repsMin}-${ex.repsMax}`}
                      value={exerciseUpdates[ex.id]?.actualReps ?? ""}
                      onChange={(event) => onUpdateExercise(ex.id, "actualReps", event.target.value)}
                      disabled={submittedToday}
                      className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
                    />
                  </label>
                  <textarea
                    placeholder="Napomena (opciono)"
                    className="col-span-2 w-full rounded-lg border p-2 text-xs"
                    rows={2}
                    value={exerciseUpdates[ex.id]?.note ?? ""}
                    onChange={(event) => onUpdateExercise(ex.id, "note", event.target.value)}
                    disabled={submittedToday}
                  />
                </div>
              )}
            </Panel>
          );
        })}
      </div>
      {!locked && (
        <div className="mt-4">
          {submittedToday ? (
            <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-center text-sm font-bold text-green-800">
              <p>Izveštaj o treningu je sačuvan.</p>
              {submitWarning && <p role="status" className="mt-1 font-medium text-amber-800">{submitWarning}</p>}
            </div>
          ) : (
            <>
              {submitError && <p role="alert" className="mb-2 text-sm font-semibold text-red-700">{submitError}</p>}
              <Btn color="green" onClick={handleSubmit} disabled={submitting} className="w-full py-3">
                {submitting ? "Šaljem izveštaj..." : "Završi trening i pošalji treneru"}
              </Btn>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ClientWeek({ program, onSelectDay }) {
  const idx = todayIndex();
  if (!program) return <Panel className="p-6 text-center text-neutral-400 font-mono">Nema programa za ovu nedelju.</Panel>;
  return (
    <div className="space-y-3">
      <Header>{formatWeekRange(program.weekId)}</Header>
      {program.days.map((d, i) => (
        <button key={d.day} onClick={() => onSelectDay(i)} className="w-full text-left block">
          <Panel className={`p-3 ${i === idx ? "border-[#2F6FB0]" : ""}`}>
            <div className="flex items-center justify-between mb-1">
              <p className="font-bold text-sm flex items-center gap-1.5">
                {d.day} {i === idx && <span className="text-[9px] bg-[#2F6FB0] text-white px-1.5 py-0.5 rounded">DANAS</span>}
              </p>
              {i !== idx && <Lock size={12} className="text-neutral-300" />}
            </div>
            {d.exercises.length === 0 ? (
              <p className="text-xs text-neutral-400 font-mono">Odmor</p>
            ) : (
              <ul className="text-xs font-mono text-neutral-600 space-y-0.5">
                {d.exercises.map((e) => (
                  <li key={e.id} className="flex items-center gap-1">
                      {e.name} - {e.sets}×{e.repsMin}-{e.repsMax} @ {e.weight}kg
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </button>
      ))}
    </div>
  );
}

function ClientNutrition({ nutrition }) {
  if (!nutrition) return <Panel className="p-6 text-center text-neutral-400 font-mono">Trener ti još nije zadao plan ishrane.</Panel>;
  return (
    <Panel className="p-4">
      <Header>Tvoj plan ishrane</Header>
      {(nutrition.calories || nutrition.protein) && (
        <div className="grid grid-cols-4 gap-2 mb-3 text-center">
          <div className="bg-neutral-100 rounded-lg p-2"><p className="font-mono font-bold">{nutrition.calories}</p><p className="text-[10px] text-neutral-500">kcal</p></div>
          <div className="bg-neutral-100 rounded-lg p-2"><p className="font-mono font-bold">{nutrition.protein}g</p><p className="text-[10px] text-neutral-500">protein</p></div>
          <div className="bg-neutral-100 rounded-lg p-2"><p className="font-mono font-bold">{nutrition.carbs}g</p><p className="text-[10px] text-neutral-500">ugljeni h.</p></div>
          <div className="bg-neutral-100 rounded-lg p-2"><p className="font-mono font-bold">{nutrition.fat}g</p><p className="text-[10px] text-neutral-500">masti</p></div>
        </div>
      )}
      <p className="text-sm whitespace-pre-wrap">{nutrition.plan}</p>
    </Panel>
  );
}

function ClientProgress({ bodylog, photos, onAddLog, onAddPhoto }) {
  const [weight, setWeight] = useState("");
  const [note, setNote] = useState("");
  const fileRef = useRef();
  const [photoNote, setPhotoNote] = useState("");

  const chartData = bodylog.map((b) => ({ date: b.date.slice(5), kg: parseFloat(b.weight) }));

  async function handlePhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    const data = await compressImage(file);
    await onAddPhoto(data, photoNote);
    setPhotoNote("");
    e.target.value = "";
  }

  return (
    <div className="space-y-4">
      <Panel className="p-4">
        <Header>Unesi telesnu težinu</Header>
        <div className="flex gap-2 mb-2">
          <input className={inputCls} placeholder="kg" value={weight} onChange={(e) => setWeight(e.target.value)} />
          <Btn color="green" onClick={() => { if (weight) { onAddLog({ weight, note }); setWeight(""); setNote(""); } }}>Sačuvaj</Btn>
        </div>
        <input
          className={inputCls}
          placeholder="Napomena uz merenje (opciono)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {chartData.length > 0 && (
          <div className="h-40 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="date" fontSize={10} />
                <YAxis fontSize={10} domain={["auto", "auto"]} />
                <Tooltip />
                <Line type="monotone" dataKey="kg" stroke="#2F6FB0" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <WeightHistory bodylog={bodylog} />
      </Panel>

      <Panel className="p-4">
        <Header>Nedeljna fotografija</Header>
        <input className={inputCls + " mb-2"} placeholder="napomena (opciono)" value={photoNote} onChange={(e) => setPhotoNote(e.target.value)} />
        <input type="file" accept="image/*" ref={fileRef} onChange={handlePhoto} className="text-xs" />
        <div className="grid grid-cols-3 gap-2 mt-3">
          {photos.slice().reverse().map((p, i) => (
            <div key={i} className="text-center">
              <img src={p.img} className="rounded-lg border-2 border-neutral-900 aspect-square object-cover" />
              <p className="text-[10px] font-mono text-neutral-500 mt-1">{p.date}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
