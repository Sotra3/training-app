import { useEffect, useRef, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Dumbbell, User, Users, Calendar, Utensils, TrendingUp, Camera, Bell, Plus, Trash2, ChevronRight, ChevronLeft, LogOut, Mail, RefreshCw, Video, X, ArrowUp, Edit3, Save, Lock, Search } from "lucide-react";
import { storeGet, storeSet } from "./lib/storage";
import { getClientNutrition, updateClientNutritionPlan } from "./lib/profiles";
import { supabase } from "./lib/supabaseClient";
import { getTrainingProgram, getTrainingPrograms, saveTrainingProgram } from "./lib/training_programs";
import Field from "./Field";
import AttendanceCalendar from "./AttendanceCalendar";
import { DAYS, DAY_SHORT, todayIndex, isoMonday, formatWeekRange, localDateId, addCalendarMonth, dateIdFromTimestamp, emptyWeek, newExercise, youtubeEmbed, compressImage, Panel, Header, WeightHistory, Btn, inputCls } from "./AppShared";


export default function TrainerApp({ me, onLogout }) {
  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);
  const [tab, setTab] = useState("program");
  const [section, setSection] = useState("clients");
  const [notifications, setNotifications] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [showUidAdd, setShowUidAdd] = useState(false);
  const [newClientId, setNewClientId] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [addError, setAddError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    const [{ data: cl }, n] = await Promise.all([
      supabase.from("profiles").select("id, name").eq("role", "client").order("name"),
      storeGet(`notifications-${me.id}`),
    ]);
    const clientList = cl || [];
    const clientNotifications = await Promise.all(
      clientList.map((client) => storeGet(`notifications-${client.id}`))
    );
    setClients(clientList);
    setNotifications(
      [...(n || []), ...clientNotifications.flatMap((items) => items || [])]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
    );
    setLoading(false);
  }
  useEffect(() => { loadAll(); }, []);

  async function inviteClient(event) {
    event.preventDefault();
    setInviteError("");
    setInviteSuccess("");
    const email = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInviteError("Unesi ispravnu email adresu.");
      return;
    }

    setSendingInvite(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-client", {
        body: { email },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Pozivnica nije poslata.");
      setInviteSuccess(`Pozivnica je poslata na ${email}. Klijent će se pojaviti na listi kada aktivira nalog.`);
      setInviteEmail("");
    } catch (error) {
      console.error("Client invitation failed", error);
      let message = error.message || "Pozivnica nije poslata. Proveri Edge Function podešavanja.";
      if (error.context && typeof error.context.json === "function") {
        try {
          const responseBody = await error.context.json();
          if (typeof responseBody.error === "string") message = responseBody.error;
        } catch {
          // Keep the original error when the response body is not readable.
        }
      }
      setInviteError(message);
    } finally {
      setSendingInvite(false);
    }
  }

  async function addExistingClient() {
    setAddError("");
    const id = newClientId.trim();
    const name = newClientName.trim();
    if (!id || !name) {
      setAddError("Unesi UID i ime.");
      return;
    }
    const { error } = await supabase.from("profiles").insert({ id, role: "client", name });
    if (error) {
      setAddError("Greška: proveri da li je UID tačan i da li klijent već postoji.");
      return;
    }
    setNewClientId("");
    setNewClientName("");
    setShowUidAdd(false);
    setShowAddClient(false);
    await loadAll();
  }

  const unread = notifications.filter((n) => !n.read).length;
  const filteredClients = clients.filter((client) =>
    (client.name || "").toLocaleLowerCase("sr-RS").includes(clientSearch.trim().toLocaleLowerCase("sr-RS"))
  );

  async function markAllRead() {
    const updated = notifications.map((n) => ({ ...n, read: true }));
    const writes = await Promise.all([
      ...clients.map(async (client) => {
        const key = `notifications-${client.id}`;
        const items = await storeGet(key) || [];
        return storeSet(key, items.map((item) => ({ ...item, read: true })));
      }),
      storeSet(`notifications-${me.id}`, updated.filter((item) => !clients.some((client) => item.id.startsWith(`${client.id}-`)))),
    ]);
    if (writes.some((success) => !success)) {
      setNotificationError("Neka obaveštenja nisu mogla biti ažurirana. Pokušaj ponovo.");
      return;
    }
    setNotificationError("");
    setNotifications(updated);
  }

  async function resetWorkoutReport(report) {
    const clientId = report.clientId;
    if (!clientId || !clients.some((client) => client.id === clientId)) {
      return { ok: false, error: "Nije pronađen klijent za ovaj izveštaj." };
    }

    const reportIdParts = report.id.startsWith(`${clientId}-`)
      ? report.id.slice(clientId.length + 1).split("-")
      : [];
    const weekId = report.weekId || reportIdParts.slice(0, 3).join("-");
    const dayIdx = Number.isInteger(report.dayIdx) ? report.dayIdx : Number(reportIdParts[3]);
    if (!weekId || !Number.isInteger(dayIdx) || dayIdx < 0 || dayIdx >= DAYS.length) {
      return { ok: false, error: "Ne mogu pouzdano da pronađem dan treninga za reset." };
    }

    const reportsKey = `reports-${clientId}`;
    const notificationsKey = `notifications-${clientId}`;
    const [storedProgram, storedReports, storedNotifications] = await Promise.all([
      getTrainingProgram(clientId, weekId),
      storeGet(reportsKey),
      storeGet(notificationsKey),
    ]);
    if (!storedProgram) return { ok: false, error: "Nije moguće učitati program za ovaj izveštaj." };

    const program = {
      ...storedProgram,
      days: storedProgram.days.map((day) => ({ ...day, exercises: day.exercises.map((exercise) => ({ ...exercise })) })),
    };
    const day = program.days?.[dayIdx];
    if (!day) return { ok: false, error: "Dan treninga za ovaj izveštaj više ne postoji." };
    if (day.submittedAt && report.date && day.submittedAt !== report.date) {
      return { ok: false, error: "Izveštaj ne odgovara više trenutnom predatom treningu." };
    }

    day.submittedAt = null;
    day.exercises = day.exercises.map((exercise) => {
      const { actualWeight, actualReps, ...plannedExercise } = exercise;
      return { ...plannedExercise, done: false, note: "" };
    });

    const previousReports = storedReports || [];
    const previousNotifications = storedNotifications || [];
    const nextReports = previousReports.filter((item) => item.id !== report.id);
    const nextNotifications = previousNotifications.filter((item) => item.id !== report.id);
    const savedProgram = await saveTrainingProgram(clientId, weekId, program);
    if (!savedProgram) {
      return { ok: false, error: "Reset nije sačuvan. Pokušaj ponovo." };
    }
    const writes = await Promise.all([
      storeSet(reportsKey, nextReports),
      storeSet(notificationsKey, nextNotifications),
    ]);
    if (writes.some((success) => !success)) {
      const rollbacks = await Promise.all([
        saveTrainingProgram(clientId, weekId, storedProgram),
        storeSet(reportsKey, previousReports),
        storeSet(notificationsKey, previousNotifications),
      ]);
      return {
        ok: false,
        error: rollbacks.every(Boolean)
          ? "Reset nije sačuvan. Pokušaj ponovo."
          : "Reset nije uspeo, a vraćanje svih podataka nije potvrđeno. Proveri stanje u bazi.",
      };
    }
    setNotifications((current) => current.filter((item) => item.id !== report.id));
    return { ok: true };
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center font-mono text-neutral-400">Učitavanje...</div>;

  return (
    <div className="app-shell app-trainer min-h-screen bg-[#F3F4F1]">
      <div className="app-header text-white px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="app-brand flex items-center gap-2 font-black uppercase tracking-wide">
          <span className="app-brand-icon"><Dumbbell size={18} /></span> {me.name} <span className="text-[10px] font-normal opacity-60">(trener)</span>
        </div>
        <div className="flex items-center gap-3">
          <button className="app-icon-button relative" onClick={() => setShowNotifs(!showNotifs)} aria-label="Obaveštenja">
            <Bell size={18} />
            {unread > 0 && <span className="absolute -top-2 -right-2 bg-[#E14B4B] text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{unread}</span>}
          </button>
          <button className="app-icon-button" onClick={onLogout} aria-label="Odjavi se"><LogOut size={18} /></button>
        </div>
      </div>

      {showNotifs && (
        <div className="max-w-4xl mx-auto p-3">
          <Panel className="p-3">
            <div className="flex justify-between items-center mb-2">
              <Header>Obaveštenja</Header>
              {unread > 0 && <button onClick={markAllRead} className="text-xs font-bold text-[#2F6FB0]">Označi sve pročitano</button>}
            </div>
            {notificationError && <p role="alert" className="mb-2 text-xs font-bold text-red-700">{notificationError}</p>}
            {notifications.length === 0 && <p className="text-xs text-neutral-400 font-mono">Nema obaveštenja.</p>}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {notifications.map((n) => (
                <div key={n.id} className={`text-xs p-2 rounded-lg ${n.read ? "bg-neutral-50 text-neutral-500" : "bg-neutral-100 font-bold"}`}>
                  <p>{n.message}</p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">{new Date(n.date).toLocaleString("sr-RS")}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      <div className="app-trainer-layout max-w-5xl mx-auto p-4 flex gap-5">
        <div className="app-client-list w-48 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <Header>Klijenti</Header>
            <div className="flex items-center gap-1">
              <button onClick={loadAll} className="rounded-lg p-2 text-[#2F6FB0] hover:bg-neutral-100" aria-label="Osveži listu klijenata">
                <RefreshCw size={15} />
              </button>
              <button
                onClick={() => {
                  setShowAddClient(!showAddClient);
                  setInviteError("");
                  setInviteSuccess("");
                  setAddError("");
                }}
                className="rounded-lg p-2 text-[#2F6FB0] hover:bg-neutral-100"
                aria-label="Pozovi klijenta"
              ><Plus size={18} /></button>
            </div>
          </div>

          {showAddClient && (
            <Panel className="mb-2 p-3">
              <form onSubmit={inviteClient}>
                <p className="mb-2 text-xs text-neutral-500">
                  Pošalji pozivnicu. Klijent postavlja svoje ime i lozinku; profil se doda nakon aktivacije.
                </p>
                <label className="mb-2 block text-[10px] font-bold uppercase text-neutral-500">
                  Email klijenta
                  <input
                    className={inputCls}
                    type="email"
                    autoComplete="email"
                    required
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="klijent@example.com"
                  />
                </label>
                {inviteError && <p role="alert" className="mb-2 text-xs font-bold text-red-700">{inviteError}</p>}
                {inviteSuccess && <p role="status" className="mb-2 text-xs font-semibold text-green-800">{inviteSuccess}</p>}
                <Btn color="green" type="submit" disabled={sendingInvite} className="w-full text-xs">
                  <Mail size={14} className="mr-1 inline" />
                  {sendingInvite ? "Šaljem pozivnicu..." : "Pošalji pozivnicu"}
                </Btn>
              </form>
              <button
                type="button"
                onClick={() => setShowUidAdd(!showUidAdd)}
                className="mt-3 w-full text-left text-[10px] font-semibold text-neutral-500 underline"
              >
                {showUidAdd ? "Sakrij dodavanje preko UID-a" : "Dodaj već postojeći nalog preko UID-a"}
              </button>
              {showUidAdd && (
                <div className="mt-2 border-t border-neutral-200 pt-2">
                  <input
                    className={inputCls + " mb-1"}
                    placeholder="UID postojećeg Auth naloga"
                    value={newClientId}
                    onChange={(event) => setNewClientId(event.target.value)}
                  />
                  <input
                    className={inputCls}
                    placeholder="Ime i prezime"
                    value={newClientName}
                    onChange={(event) => setNewClientName(event.target.value)}
                  />
                  {addError && <p role="alert" className="mt-1 text-[10px] font-bold text-red-700">{addError}</p>}
                  <Btn color="ghost" onClick={addExistingClient} className="mt-2 w-full text-xs">Dodaj postojeći nalog</Btn>
                </div>
              )}
            </Panel>
          )}

          <label className="app-client-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={clientSearch}
              onChange={(event) => setClientSearch(event.target.value)}
              placeholder="Traži klijenta"
              aria-label="Pretraži klijente po imenu"
            />
          </label>

          <div className="space-y-1">
            {clients.length === 0 && <p className="text-xs text-neutral-400">Još nema klijenata.</p>}
            {clients.length > 0 && filteredClients.length === 0 && (
              <p className="px-2 py-3 text-xs text-neutral-500">Nema klijenta sa tim imenom.</p>
            )}
            {filteredClients.map((c) => (
              <button key={c.id} onClick={() => { setSection("clients"); setSelectedClient(c.id); setTab("program"); }}
                className={`w-full text-left px-2 py-2 rounded-lg text-sm font-bold border-2 ${selectedClient === c.id ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200"}`}>
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="app-trainer-workspace flex-1 min-w-0">
          <div className="app-trainer-main-tabs mb-4 flex gap-2 text-xs font-bold">
            <button
              onClick={() => setSection("clients")}
              className={`rounded-lg border-2 px-3 py-2 ${section === "clients" ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white"}`}
            >Klijenti i programi</button>
            <button
              onClick={() => setSection("reports")}
              className={`rounded-lg border-2 px-3 py-2 ${section === "reports" ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white"}`}
            >Izveštaji</button>
          </div>
          {section === "reports" ? (
            <TrainerReports clients={clients} onResetReport={resetWorkoutReport} />
          ) : !selectedClient ? (
            <Panel className="app-empty-state p-8 text-center text-neutral-400 font-mono">Izaberi klijenta sa leve strane i kreni sa planiranjem.</Panel>
          ) : (
            <>
              <div className="app-trainer-client-tabs flex gap-2 mb-3 text-xs font-bold flex-wrap">
                {[["program", "Program"], ["ishrana", "Ishrana"], ["napredak", "Napredak"], ["dolasci", "Dolasci"], ["clanarina", "Članarina"]].map(([k, l]) => (
                  <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-lg border-2 border-neutral-900 ${tab === k ? "bg-neutral-900 text-white" : "bg-white"}`}>{l}</button>
                ))}
              </div>
              {tab === "program" && <TrainerProgram client={selectedClient} />}
              {tab === "ishrana" && <TrainerNutrition clientId={selectedClient} />}
              {tab === "napredak" && <TrainerProgress client={selectedClient} />}
              {tab === "dolasci" && <TrainerAttendance client={selectedClient} />}
              {tab === "clanarina" && <TrainerMembership client={selectedClient} clientName={clients.find((client) => client.id === selectedClient)?.name} adminName={me.name} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TrainerMembership({ client, clientName, adminName }) {
  const [membership, setMembership] = useState(null);
  const [dateDraft, setDateDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    (async () => {
      const saved = await storeGet(`membership-${client}`);
      if (active) {
        setMembership(saved || { paidUntil: "", history: [] });
        setDateDraft(saved?.paidUntil || "");
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [client]);

  async function savePaidUntil(paidUntil, action) {
    setError("");
    setSuccess("");
    setSaving(true);
    const previous = membership || { paidUntil: "", history: [] };
    const updated = {
      paidUntil,
      history: [{
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        changedAt: new Date().toISOString(),
        changedBy: adminName,
        previousUntil: previous.paidUntil || null,
        newUntil: paidUntil || null,
        action,
      }, ...(previous.history || [])],
    };
    const saved = await storeSet(`membership-${client}`, updated);
    setSaving(false);
    if (!saved) {
      setError("Nije moguće sačuvati članarinu. Proveri vezu i pokušaj ponovo.");
      return false;
    }
    setMembership(updated);
    setDateDraft(paidUntil);
    setSuccess("Članarina je ažurirana.");
    return true;
  }

  async function extendOneMonth() {
    const today = localDateId();
    const start = membership?.paidUntil && membership.paidUntil >= today
      ? membership.paidUntil
      : today;
    await savePaidUntil(addCalendarMonth(start), "Produženo za mesec dana");
  }

  if (loading) return <p className="text-sm text-neutral-400">Učitavanje članarine...</p>;

  const today = localDateId();
  const active = Boolean(membership?.paidUntil && membership.paidUntil >= today);

  return (
    <div className="space-y-4">
      <Panel className="p-4">
        <Header>Članarina - {clientName || "klijent"}</Header>
        <p className={`mb-4 text-sm font-bold ${active ? "text-green-700" : "text-orange-700"}`}>
          {active
            ? `Aktivna do ${new Date(`${membership.paidUntil}T00:00:00`).toLocaleDateString("sr-RS")}`
            : "Nema aktivne članarine"}
        </p>
        <Btn color="green" onClick={extendOneMonth} disabled={saving} className="w-full sm:w-auto">
          {saving ? "Čuvam..." : "Produži za mesec dana"}
        </Btn>
        <div className="mt-4 border-t border-neutral-100 pt-4">
          <label className="block text-xs font-bold text-neutral-600">
            Ručno podesi datum isteka
            <input
              type="date"
              value={dateDraft}
              onChange={(event) => setDateDraft(event.target.value)}
              className="mt-1 block w-full sm:max-w-xs"
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <Btn
              onClick={() => savePaidUntil(dateDraft, "Ručno podešen datum")}
              disabled={saving || !dateDraft}
            >Sačuvaj datum</Btn>
            {membership?.paidUntil && (
              <Btn
                color="ghost"
                onClick={() => savePaidUntil("", "Članarina uklonjena")}
                disabled={saving}
              >Ukloni članarinu</Btn>
            )}
          </div>
        </div>
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
        {success && <p role="status" className="mt-3 text-sm font-semibold text-green-700">{success}</p>}
      </Panel>

      <Panel className="p-4">
        <Header>Istorija članarine</Header>
        {!membership?.history?.length ? (
          <p className="text-sm text-neutral-500">Još nema izmena članarine.</p>
        ) : (
          <div className="space-y-2">
            {membership.history.map((entry) => (
              <div key={entry.id} className="rounded-xl bg-[#f6f8f5] p-3 text-sm">
                <p className="font-bold">{entry.action}</p>
                <p className="mt-1 text-neutral-600">
                  {entry.previousUntil
                    ? new Date(`${entry.previousUntil}T00:00:00`).toLocaleDateString("sr-RS")
                    : "Nije aktivna"}
                  {" → "}
                  {entry.newUntil
                    ? new Date(`${entry.newUntil}T00:00:00`).toLocaleDateString("sr-RS")
                    : "Nije aktivna"}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  {new Date(entry.changedAt).toLocaleString("sr-RS")} · {entry.changedBy}
                </p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function TrainerAttendance({ client }) {
  const [dates, setDates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      const [reports, weeks] = await Promise.all([
        storeGet(`reports-${client}`),
        getTrainingPrograms(client),
      ]);
      const submittedDates = new Set([
        ...(reports || []).map((report) => dateIdFromTimestamp(report.date)),
        ...(weeks || []).flatMap((week) => week.days.flatMap((day) =>
          day.submittedAt ? [dateIdFromTimestamp(day.submittedAt)] : []
        )),
      ]);
      if (active) {
        setDates([...submittedDates]);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [client]);

  if (loading) return <p className="text-sm text-neutral-400">Učitavanje dolazaka...</p>;
  return <AttendanceCalendar dates={dates} />;
}

function TrainerReports({ clients, onResetReport }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resettingId, setResettingId] = useState(null);
  const [confirmResetId, setConfirmResetId] = useState(null);
  const [resetError, setResetError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      const clientReports = await Promise.all(clients.map(async (client) => {
        const [savedReports, weeks] = await Promise.all([
          storeGet(`reports-${client.id}`),
          getTrainingPrograms(client.id),
        ]);
        const archived = savedReports || [];
        const archivedIds = new Set(archived.map((report) => report.id));
        const previousSubmissions = (weeks || []).flatMap((week) =>
          week.days.flatMap((day, dayIdx) => {
            if (!day.submittedAt) return [];
            const date = dateIdFromTimestamp(day.submittedAt);
            const id = `${client.id}-${week.weekId}-${dayIdx}-${date}`;
            if (archivedIds.has(id)) return [];
            return [{
              id,
              clientId: client.id,
              clientName: client.name,
              weekId: week.weekId,
              dayIdx,
              date: day.submittedAt,
              day: day.day,
              exercises: day.exercises,
            }];
          })
        );
        return [...archived, ...previousSubmissions].map((report) => ({
          ...report,
          clientName: report.clientName || client.name,
        }));
      }));
      if (active) {
        setReports(clientReports.flat().sort((a, b) => new Date(b.date) - new Date(a.date)));
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [clients]);

  if (loading) return <p className="text-sm text-neutral-400">Učitavanje izveštaja...</p>;
  if (reports.length === 0 && !resetError) {
    return <Panel className="p-8 text-center text-neutral-500">Još nema predatih treninga.</Panel>;
  }

  async function handleReset(report) {
    setResetError("");
    setResettingId(report.id);
    try {
      const result = await onResetReport(report);
      if (!result.ok) {
        setResetError(result.error);
        return;
      }
      setReports((current) => current.filter((item) => item.id !== report.id));
      setConfirmResetId(null);
    } catch (error) {
      console.error("Could not reset workout report", error);
      setResetError("Došlo je do greške pri resetovanju treninga. Pokušaj ponovo.");
    } finally {
      setResettingId(null);
    }
  }

  return (
    <div className="space-y-3">
      {reports.length > 0 && <div className="mb-4 flex items-center justify-between">
        <Header>Predati treninzi</Header>
        <span className="app-progress-chip px-3 py-1 text-xs">{reports.length} izveštaja</span>
      </div>}
      {resetError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{resetError}</p>}
      {reports.length === 0 && <Panel className="p-8 text-center text-neutral-500">Još nema predatih treninga.</Panel>}
      {reports.map((report) => (
        <Panel key={report.id} className="p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-bold text-[#19352c]">{report.clientName}</h3>
              <p className="mt-1 text-sm text-neutral-500">{report.day} · {new Date(report.date).toLocaleString("sr-RS")}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-800">Trening završen</span>
              {confirmResetId === report.id ? (
                <div className="w-full rounded-xl border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-semibold text-red-900">
                    Obrisaće se izveštaj i resetovati {report.day} za {report.clientName}.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Btn color="red" disabled={resettingId === report.id} onClick={() => handleReset(report)} className="text-xs">
                      {resettingId === report.id ? "Resetujem..." : "Da, restartuj dan"}
                    </Btn>
                    <Btn color="ghost" disabled={resettingId === report.id} onClick={() => setConfirmResetId(null)} className="text-xs">
                      Otkaži
                    </Btn>
                  </div>
                </div>
              ) : (
                <Btn
                  color="red"
                  disabled={resettingId === report.id}
                  onClick={() => setConfirmResetId(report.id)}
                  className="text-xs"
                >
                  Obriši i restartuj dan
                </Btn>
              )}
            </div>
          </div>
          <div className="space-y-2">
            {report.exercises.map((exercise) => (
              <div key={exercise.id} className="rounded-xl bg-[#f6f8f5] p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{exercise.name}</p>
                  <span className={`shrink-0 text-xs font-bold ${exercise.done ? "text-green-700" : "text-neutral-400"}`}>
                    {exercise.done ? "Urađeno" : "Nije urađeno"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-neutral-600">
                  {exercise.done
                    ? `${exercise.actualWeight || exercise.weight} kg × ${exercise.actualReps || "-"} ponavljanja`
                    : `Plan: ${exercise.weight} kg · ${exercise.repsMin}-${exercise.repsMax} ponavljanja`}
                </p>
                {exercise.note && <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-500">Napomena: {exercise.note}</p>}
              </div>
            ))}
          </div>
        </Panel>
      ))}
    </div>
  );
}

function TrainerProgram({ client, clientName }) {
  const [weeks, setWeeks] = useState([]);
  const weeksRef = useRef([]);
  const [weekId, setWeekId] = useState(isoMonday());
  const [loading, setLoading] = useState(true);
  const [weekMessage, setWeekMessage] = useState("");
  const saveQueue = useRef(Promise.resolve());
  const pendingSave = useRef(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getTrainingProgram(client, weekId).then((program) => {
      if (!active) return;
      const currentWeek = program ? [{ ...program, weekId }] : [];
      weeksRef.current = currentWeek;
      setWeeks(currentWeek);
      setLoading(false);
    });
    return () => { active = false; };
  }, [client, weekId]);

  const week = weeks.find((w) => w.weekId === weekId);

  function persist(weekStart, program) {
    const operation = saveQueue.current.then(async () => {
      const saved = await saveTrainingProgram(client, weekStart, program);
      return Boolean(saved);
    });
    saveQueue.current = operation.then(() => undefined, () => undefined);
    return operation;
  }

  function flushPendingSave() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const pending = pendingSave.current;
    pendingSave.current = null;
    return pending ? persist(pending.weekStart, pending.program) : Promise.resolve(true);
  }

  function scheduleSave(program) {
    pendingSave.current = { weekStart: weekId, program };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const pending = pendingSave.current;
      pendingSave.current = null;
      if (pending) persist(pending.weekStart, pending.program);
    }, 350);
  }

  async function save(updatedWeeks, targetWeekId = weekId) {
    const updatedProgram = updatedWeeks.find((item) => item.weekId === targetWeekId);
    if (!updatedProgram) return false;
    const nextWeeks = targetWeekId === weekId
      ? updatedWeeks.filter((item) => item.weekId === targetWeekId)
      : weeksRef.current;
    if (targetWeekId === weekId) {
      weeksRef.current = nextWeeks;
      setWeeks(nextWeeks);
    }
    const pendingSaved = await flushPendingSave();
    if (!pendingSaved) return false;
    const saved = await persist(targetWeekId, updatedProgram);
    return saved;
  }

  function ensureWeek() {
    if (weeksRef.current.some((item) => item.weekId === weekId)) return weeksRef.current;
    return [emptyWeek(weekId)];
  }

  async function addExercise(dayIdx) {
    const list = ensureWeek();
    const w = list.find((w) => w.weekId === weekId);
    w.days[dayIdx].exercises.push(newExercise());
    await save([...list]);
  }
  async function updateExercise(dayIdx, exId, field, value) {
    return updateExerciseFields(dayIdx, exId, { [field]: value }, true);
  }
  async function updateExerciseFields(dayIdx, exId, fields, debounce = false) {
    const list = ensureWeek();
    const w = list.find((w) => w.weekId === weekId);
    const ex = w.days[dayIdx].exercises.find((e) => e.id === exId);
    Object.assign(ex, fields);
    const updatedWeeks = [...list];
    weeksRef.current = updatedWeeks;
    setWeeks(updatedWeeks);
    if (debounce) {
      scheduleSave(w);
      return true;
    }
    return save(updatedWeeks);
  }
  async function removeExercise(dayIdx, exId) {
    const list = ensureWeek();
    const w = list.find((w) => w.weekId === weekId);
    w.days[dayIdx].exercises = w.days[dayIdx].exercises.filter((e) => e.id !== exId);
    await save([...list]);
  }

  async function copyFromPreviousWeek() {
    setWeekMessage("");
    const pendingSaved = await flushPendingSave();
    if (!pendingSaved) {
      setWeekMessage("Nije moguće sačuvati trenutne izmene. Pokušaj ponovo.");
      return;
    }
    const [year, month, day] = weekId.split("-").map(Number);
    const prevDate = new Date(year, month - 1, day);
    prevDate.setDate(prevDate.getDate() - 7);
    const prevId = localDateId(prevDate);
    const prevWeek = await getTrainingProgram(client, prevId);
    if (!prevWeek) { setWeekMessage("Nema prethodne nedelje za ovog klijenta."); return; }
    const cloned = {
      ...emptyWeek(weekId),
      days: prevWeek.days.map((d) => ({
        day: d.day,
        exercises: d.exercises.map(({ actualWeight, actualReps, ...exercise }) => ({
          ...exercise,
          id: Math.random().toString(36).slice(2, 9),
          done: false,
          note: "",
        })),
      })),
    };
    const saved = await save([cloned]);
    setWeekMessage(saved ? "Program prethodne nedelje je kopiran." : "Nije moguće sačuvati kopirani program.");
  }

  async function progressExercise(dayIdx, exId) {
    const list = ensureWeek();
    const w = list.find((w) => w.weekId === weekId);
    const ex = w.days[dayIdx].exercises.find((e) => e.id === exId);
    if (ex.repsMax < 12) {
      ex.repsMin = Math.min(ex.repsMin + 1, 12);
      ex.repsMax = Math.min(ex.repsMax + 1, 12);
    } else {
      ex.weight = (parseFloat(ex.weight) + 2.5).toString();
      ex.repsMin = 6; ex.repsMax = 12;
    }
    await save([...list]);
  }

  async function shiftWeek(days) {
    const pendingSaved = await flushPendingSave();
    if (!pendingSaved) {
      setWeekMessage("Nije moguće sačuvati trenutne izmene. Pokušaj ponovo.");
      return;
    }
    const [year, month, day] = weekId.split("-").map(Number);
    const d = new Date(year, month - 1, day);
    d.setDate(d.getDate() + days);
    setWeekId(isoMonday(d));
  }

  if (loading) return <p className="text-xs text-neutral-400 font-mono">Učitavanje...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button onClick={() => shiftWeek(-7)}><ChevronLeft size={18} /></button>
          <span className="font-mono text-sm font-bold">{formatWeekRange(weekId)}</span>
          <button onClick={() => shiftWeek(7)}><ChevronRight size={18} /></button>
        </div>
        <Btn color="ghost" onClick={copyFromPreviousWeek} className="text-xs">Kopiraj prošlu nedelju</Btn>
      </div>
      {weekMessage && (
        <p role="status" className={`mb-3 rounded-lg p-3 text-sm font-semibold ${
          weekMessage.startsWith("Nije") || weekMessage.startsWith("Nema")
            ? "bg-amber-50 text-amber-900"
            : "bg-green-50 text-green-800"
        }`}>{weekMessage}</p>
      )}

      <div className="space-y-3">
        {(week ? week.days : emptyWeek(weekId).days).map((d, dayIdx) => (
          <Panel key={d.day} className="p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="font-bold text-sm">{d.day}</p>
              <button onClick={() => addExercise(dayIdx)} className="text-[#2F6FB0]"><Plus size={18} /></button>
            </div>
            <div className="space-y-2">
              {d.exercises.map((ex) => (
                <div key={ex.id} className="border-2 border-neutral-200 rounded-lg p-2">
                  <div className="flex gap-2 items-start">
                    <input className={inputCls + " flex-1"} placeholder="naziv vežbe" value={ex.name} onChange={(e) => updateExercise(dayIdx, ex.id, "name", e.target.value)} />
                    <button onClick={() => removeExercise(dayIdx, ex.id)} className="text-[#E14B4B] mt-1.5"><Trash2 size={16} /></button>
                  </div>
                  <input className={inputCls + " mt-1"} placeholder="YouTube link vežbe (opciono)" value={ex.videoUrl} onChange={(e) => updateExercise(dayIdx, ex.id, "videoUrl", e.target.value)} />
                  <div className="grid grid-cols-4 gap-1 mt-1">
                    <div><span className="text-[9px] text-neutral-400">serije</span><input className={inputCls} type="number" value={ex.sets} onChange={(e) => updateExercise(dayIdx, ex.id, "sets", e.target.value)} /></div>
                    <div><span className="text-[9px] text-neutral-400">min pon.</span><input className={inputCls} type="number" min={6} max={12} value={ex.repsMin} onChange={(e) => updateExercise(dayIdx, ex.id, "repsMin", e.target.value)} /></div>
                    <div><span className="text-[9px] text-neutral-400">max pon.</span><input className={inputCls} type="number" min={6} max={12} value={ex.repsMax} onChange={(e) => updateExercise(dayIdx, ex.id, "repsMax", e.target.value)} /></div>
                    <div><span className="text-[9px] text-neutral-400">kg</span><input className={inputCls} type="number" value={ex.weight} onChange={(e) => updateExercise(dayIdx, ex.id, "weight", e.target.value)} /></div>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] text-neutral-400">pauza (s)</span>
                    <input className={inputCls + " w-20"} type="number" value={ex.rest} onChange={(e) => updateExercise(dayIdx, ex.id, "rest", e.target.value)} />
                    <button onClick={() => progressExercise(dayIdx, ex.id)} className="ml-auto flex items-center gap-1 text-[10px] font-bold text-[#3F9142]"><ArrowUp size={12} /> Napreduj (1 klik)</button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function TrainerNutrition({ clientId }) {
  const [nutrition, setNutrition] = useState({ plan: "", calories: "", protein: "", carbs: "", fat: "" });
  const [calc, setCalc] = useState({ weight: "", height: "", age: "", gender: "muško", activity: "1.4", goal: "održavanje" });
  const [loading, setLoading] = useState(true);
  const [calcError, setCalcError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    (async () => {
      const n = await getClientNutrition(clientId);
      if (n) setNutrition(n);
      setLoading(false);
    })();
  }, [clientId]);

  function calculate() {
    const w = parseFloat(calc.weight), h = parseFloat(calc.height), a = parseFloat(calc.age);
    setCalcError("");
    if (!Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(a) || w <= 0 || h <= 0 || a <= 0) {
      setCalcError("Unesi ispravnu težinu, visinu i godine da izračunam makroe.");
      return;
    }
    let bmr = calc.gender === "muško" ? 10 * w + 6.25 * h - 5 * a + 5 : 10 * w + 6.25 * h - 5 * a - 161;
    let tdee = bmr * parseFloat(calc.activity);
    if (calc.goal === "mršavljenje") tdee -= 400;
    if (calc.goal === "masa") tdee += 300;
    const protein = Math.round(w * 2);
    const fat = Math.round((tdee * 0.25) / 9);
    const carbs = Math.round((tdee - protein * 4 - fat * 9) / 4);
    setNutrition((n) => ({ ...n, calories: Math.round(tdee), protein, carbs, fat }));
  }

  async function save() {
    setSaveMessage("");
    setSaveError("");
    const updated = { ...nutrition, updatedAt: new Date().toISOString() };
    const saved = await updateClientNutritionPlan(clientId, updated);
    if (!saved) {
      setSaveError("Plan nije sačuvan. Proveri vezu i pokušaj ponovo.");
      return;
    }
    setNutrition(updated);
    setSaveMessage("Plan ishrane je sačuvan.");
  }

  if (loading) return <p className="text-xs text-neutral-400 font-mono">Učitavanje...</p>;

  return (
    <div className="space-y-3">
      <Panel className="p-3">
        <Header>Kalkulator makroa (opciono)</Header>
        <div className="grid grid-cols-3 gap-2">
          <input className={inputCls} placeholder="kg" value={calc.weight} onChange={(e) => setCalc({ ...calc, weight: e.target.value })} />
          <input className={inputCls} placeholder="cm" value={calc.height} onChange={(e) => setCalc({ ...calc, height: e.target.value })} />
          <input className={inputCls} placeholder="godine" value={calc.age} onChange={(e) => setCalc({ ...calc, age: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <select className={inputCls} value={calc.gender} onChange={(e) => setCalc({ ...calc, gender: e.target.value })}>
            <option>muško</option><option>žensko</option>
          </select>
          <select className={inputCls} value={calc.goal} onChange={(e) => setCalc({ ...calc, goal: e.target.value })}>
            <option>mršavljenje</option><option>održavanje</option><option>masa</option>
          </select>
        </div>
        <select className={inputCls + " mt-2"} value={calc.activity} onChange={(e) => setCalc({ ...calc, activity: e.target.value })}>
          <option value="1.2">Sedeći način života</option>
          <option value="1.4">Lagana aktivnost</option>
          <option value="1.6">Umerena aktivnost</option>
          <option value="1.8">Visoka aktivnost</option>
        </select>
        <Btn color="blue" onClick={calculate} className="mt-2 w-full">Izračunaj</Btn>
        {calcError && <p role="alert" className="mt-2 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">{calcError}</p>}
      </Panel>

      <Panel className="p-3">
        <Header>Plan ishrane klijenta</Header>
        <div className="grid grid-cols-4 gap-2 mb-2">
          <Field label="kcal"><input className={inputCls} value={nutrition.calories} onChange={(e) => setNutrition({ ...nutrition, calories: e.target.value })} /></Field>
          <Field label="protein"><input className={inputCls} value={nutrition.protein} onChange={(e) => setNutrition({ ...nutrition, protein: e.target.value })} /></Field>
          <Field label="ugljeni h."><input className={inputCls} value={nutrition.carbs} onChange={(e) => setNutrition({ ...nutrition, carbs: e.target.value })} /></Field>
          <Field label="masti"><input className={inputCls} value={nutrition.fat} onChange={(e) => setNutrition({ ...nutrition, fat: e.target.value })} /></Field>
        </div>
        <textarea className="w-full border-2 border-neutral-300 rounded-lg p-2 text-sm focus:border-neutral-900 outline-none" rows={8}
          placeholder="Opiši obroke, namirnice, raspored ishrane..." value={nutrition.plan} onChange={(e) => setNutrition({ ...nutrition, plan: e.target.value })} />
        <Btn color="green" onClick={save} className="mt-2 flex items-center gap-1"><Save size={14} /> Sačuvaj plan</Btn>
        {saveError && <p role="alert" className="mt-2 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{saveError}</p>}
        {saveMessage && <p role="status" className="mt-2 rounded-lg bg-green-50 p-3 text-sm font-semibold text-green-800">{saveMessage}</p>}
      </Panel>
    </div>
  );
}

function TrainerProgress({ client }) {
  const [bodylog, setBodylog] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [b, p] = await Promise.all([storeGet(`bodylog-${client}`), storeGet(`photos-${client}`)]);
      setBodylog(b || []);
      setPhotos(p || []);
      setLoading(false);
    })();
  }, [client]);

  if (loading) return <p className="text-xs text-neutral-400 font-mono">Učitavanje...</p>;
  const chartData = bodylog.map((b) => ({ date: b.date.slice(5), kg: parseFloat(b.weight) }));

  return (
    <div className="space-y-3">
      <Panel className="p-3">
        <Header>Telesna težina</Header>
        {chartData.length > 0 ? (
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="date" fontSize={10} />
                <YAxis fontSize={10} domain={["auto", "auto"]} />
                <Tooltip />
                <Line type="monotone" dataKey="kg" stroke="#E14B4B" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : null}
        <WeightHistory bodylog={bodylog} />
      </Panel>
      <Panel className="p-3">
        <Header>Fotografije napretka</Header>
        {photos.length === 0 ? <p className="text-xs text-neutral-400 font-mono">Nema fotografija još.</p> : (
          <div className="grid grid-cols-4 gap-2">
            {photos.slice().reverse().map((p, i) => (
              <div key={i} className="text-center">
                <img src={p.img} className="rounded-lg border-2 border-neutral-900 aspect-square object-cover" />
                <p className="text-[9px] font-mono text-neutral-500 mt-1">{p.date}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
