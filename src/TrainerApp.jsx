import { useEffect, useRef, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Dumbbell, User, Users, Calendar, Utensils, TrendingUp, Camera, Bell, Plus, Trash2, ChevronRight, ChevronLeft, LogOut, Mail, RefreshCw, Video, X, ArrowUp, Edit3, Save, Lock, Search } from "lucide-react";
import { getClientMembership, getClientNutrition, updateClientMembership, updateClientNutritionPlan } from "./lib/profiles";
import { supabase } from "./lib/supabaseClient";
import { getTrainingProgram, getTrainingPrograms, saveTrainingProgram } from "./lib/training_programs";
import { getWorkoutReports, deleteWorkoutReport } from "./lib/workout_reports";
import { getBodyMeasurements } from "./lib/body_measurements";
import { getNotifications, deleteNotifications } from "./lib/notifications";
import { deleteProgressPhoto, getProgressPhotos } from "./lib/photos";
import Field from "./Field";
import AttendanceCalendar from "./AttendanceCalendar";
import { DAYS, DAY_SHORT, todayIndex, isoMonday, formatWeekRange, localDateId, addCalendarMonth, dateIdFromTimestamp, emptyWeek, newExercise, youtubeEmbed, compressImage, Panel, Header, WeightHistory, Btn, inputCls } from "./AppShared";


export default function TrainerApp({ me, onLogout }) {
  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);
  const [notificationTarget, setNotificationTarget] = useState(null);
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
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    const [{ data: cl }, currentUserNotifications] = await Promise.all([
      supabase.from("profiles").select("id, name").eq("role", "client").order("name"),
      getNotifications(),
    ]);
    const clientList = cl || [];
    setClients(clientList);
    if (currentUserNotifications === null) {
      setNotificationError("Notifikacije nisu mogle da se učitaju.");
      setNotifications([]);
    } else {
      setNotifications(currentUserNotifications);
    }
    setLoading(false);
  }
  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`trainer-notifications-${me.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${me.id}`,
        },
        ({ new: notification }) => {
          setNotifications((current) => {
            if (current.some((item) => item.id === notification.id)) return current;
            return [notification, ...current].sort(
              (a, b) => new Date(b.created_at) - new Date(a.created_at)
            );
          });
        }
      )
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Trainer notification subscription failed", error);
          setNotificationError("Obaveštenja uživo nisu dostupna. Osveži panel obaveštenja.");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [me.id]);

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

  const unread = showNotifs ? 0 : notifications.length;
  const filteredClients = clients.filter((client) =>
    (client.name || "").toLocaleLowerCase("sr-RS").includes(clientSearch.trim().toLocaleLowerCase("sr-RS"))
  );

  async function toggleNotifications() {
    if (showNotifs) {
      setShowNotifs(false);
      setNotifications([]);
      return;
    }

    setNotificationError("");
    setShowNotifs(true);
    setNotificationBusy(true);
    const latestNotifications = await getNotifications();
    if (latestNotifications === null) {
      setNotificationError("Notifikacije nisu mogle da se učitaju. Pokušaj ponovo.");
      setNotificationBusy(false);
      return;
    }

    setNotifications(latestNotifications);
    if (latestNotifications.length > 0) {
      const deletedNotifications = await deleteNotifications(latestNotifications.map((item) => item.id));
      if (deletedNotifications === null) {
        setNotificationError("Notifikacije su učitane, ali nisu mogle biti obrisane.");
      }
    }
    setNotificationBusy(false);
  }

  function openNotification(notification) {
    if (!notification.workout_report_id || !notification.sender_id) {
      setNotificationError("Ova notifikacija nema povezani izveštaj.");
      return;
    }
    setNotificationTarget({
      reportId: notification.workout_report_id,
      clientId: notification.sender_id,
    });
    setSelectedClient(notification.sender_id);
    setSection("reports");
    setShowNotifs(false);
    setNotifications([]);
  }

  async function resetWorkoutReport(report) {
    const clientId = report.clientId || report.client_id;
    if (!clientId || !clients.some((client) => client.id === clientId)) {
      return { ok: false, error: "Nije pronađen klijent za ovaj izveštaj." };
    }

    const weekId = report.weekId || report.week_start;
    const dayIdx = report.dayIdx ?? report.day_index;
    if (!weekId || !Number.isInteger(dayIdx) || dayIdx < 0 || dayIdx >= DAYS.length) {
      return { ok: false, error: "Ne mogu pouzdano da pronađem dan treninga za reset." };
    }

    const storedProgram = await getTrainingProgram(clientId, weekId);
    if (!storedProgram) return { ok: false, error: "Nije moguće učitati program za ovaj izveštaj." };

    const program = {
      ...storedProgram,
      days: storedProgram.days.map((day) => ({ ...day, exercises: day.exercises.map((exercise) => ({ ...exercise })) })),
    };
    const day = program.days?.[dayIdx];
    if (!day) return { ok: false, error: "Dan treninga za ovaj izveštaj više ne postoji." };
    const reportDate = report.workout_date || dateIdFromTimestamp(report.date || report.submitted_at);
    if (day.submittedAt && reportDate && dateIdFromTimestamp(day.submittedAt) !== reportDate) {
      return { ok: false, error: "Izveštaj ne odgovara više trenutnom predatom treningu." };
    }

    day.submittedAt = null;
    day.exercises = day.exercises.map((exercise) => {
      const { actualWeight, actualReps, ...plannedExercise } = exercise;
      return { ...plannedExercise, done: false, note: "" };
    });

    const savedProgram = await saveTrainingProgram(clientId, weekId, program);
    if (!savedProgram) {
      return { ok: false, error: "Reset nije sačuvan. Pokušaj ponovo." };
    }

    if (report.isPersisted) {
      const deleted = await deleteWorkoutReport(report.id);
      if (!deleted) {
        const rolledBack = await saveTrainingProgram(clientId, weekId, storedProgram);
        return {
          ok: false,
          error: rolledBack
            ? "Izveštaj nije obrisan iz baze, trening je vraćen na prethodno stanje."
            : "Izveštaj nije obrisan, a vraćanje programa nije potvrđeno. Proveri stanje u bazi.",
        };
      }
    }

    setNotifications((current) => current.filter((item) => item.workout_report_id !== report.id));
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
          <button className="app-icon-button relative" onClick={toggleNotifications} aria-label="Obaveštenja" disabled={notificationBusy}>
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
            </div>
            {notificationError && <p role="alert" className="mb-2 text-xs font-bold text-red-700">{notificationError}</p>}
            {notificationBusy && <p className="mb-2 text-xs text-neutral-500">Učitavanje notifikacija...</p>}
            {notifications.length === 0 && <p className="text-xs text-neutral-400 font-mono">Nema obaveštenja.</p>}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openNotification(n)}
                  disabled={notificationBusy}
                  className="w-full rounded-lg bg-neutral-100 p-2 text-left text-xs font-bold hover:bg-neutral-200"
                >
                  <p>{n.message}</p>
                  <p className="mt-0.5 text-[10px] font-normal text-neutral-400">{new Date(n.created_at).toLocaleString("sr-RS")}</p>
                  <p className="mt-1 text-[10px] font-semibold text-[#2F6FB0]">Otvori izveštaj</p>
                </button>
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
              <button key={c.id} onClick={() => { if (section !== "reports") setSection("clients"); setSelectedClient(c.id); setTab("program"); }}
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
            <TrainerReports
              clients={clients}
              onResetReport={resetWorkoutReport}
              focusReport={notificationTarget}
            />
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
              {tab === "clanarina" && <TrainerMembership client={selectedClient} clientName={clients.find((client) => client.id === selectedClient)?.name} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TrainerMembership({ client, clientName }) {
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
      const saved = await getClientMembership(client);
      if (active) {
        if (saved === null) {
          setError("Članarina nije mogla da se učita. Pokušaj ponovo.");
        } else {
          setMembership(saved);
          setDateDraft(saved);
        }
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [client]);

  async function savePaidUntil(paidUntil) {
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const saved = await updateClientMembership(client, paidUntil);
      if (!saved) {
        setError("Članarina nije sačuvana. Proveri vezu i pokušaj ponovo.");
        return false;
      }
      setMembership(paidUntil);
      setDateDraft(paidUntil);
      setSuccess("Članarina je ažurirana.");
      return true;
    } catch (saveError) {
      console.error("Could not update client membership", client, saveError);
      setError("Članarina nije sačuvana. Proveri vezu i pokušaj ponovo.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function extendOneMonth() {
    const today = localDateId();
    const start = membership && membership >= today
      ? membership
      : today;
    await savePaidUntil(addCalendarMonth(start));
  }

  if (loading) return <p className="text-sm text-neutral-400">Učitavanje članarine...</p>;

  const today = localDateId();
  const active = Boolean(membership && membership >= today);

  return (
    <div className="space-y-4">
      <Panel className="p-4">
        <Header>Članarina - {clientName || "klijent"}</Header>
        <p className={`mb-4 text-sm font-bold ${active ? "text-green-700" : "text-orange-700"}`}>
          {active
            ? `Aktivna do ${new Date(`${membership}T00:00:00`).toLocaleDateString("sr-RS")}`
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
              onClick={() => savePaidUntil(dateDraft)}
              disabled={saving || !dateDraft}
            >Sačuvaj datum</Btn>
            {membership && (
              <Btn
                color="ghost"
                onClick={() => savePaidUntil("")}
                disabled={saving}
              >Ukloni članarinu</Btn>
            )}
          </div>
        </div>
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
        {success && <p role="status" className="mt-3 text-sm font-semibold text-green-700">{success}</p>}
      </Panel>
    </div>
  );
}

function TrainerAttendance({ client }) {
  const [dates, setDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const [reports, weeks] = await Promise.all([
          getWorkoutReports(client),
          getTrainingPrograms(client),
        ]);
        if (reports === null || weeks === null) {
          throw new Error("Could not load workout attendance data.");
        }
        const submittedDates = new Set([
          ...reports.map((report) => report.workout_date),
          ...weeks.flatMap((week) => week.days.flatMap((day) =>
            day.submittedAt ? [dateIdFromTimestamp(day.submittedAt)] : []
          )),
        ]);
        if (active) setDates([...submittedDates]);
      } catch (loadError) {
        console.error("Could not load trainer attendance", client, loadError);
        if (active) setError("Dolazci nisu mogli da se učitaju. Pokušaj ponovo.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [client]);

  if (loading) return <p className="text-sm text-neutral-400">Učitavanje dolazaka...</p>;
  if (error) return <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>;
  return <AttendanceCalendar dates={dates} />;
}

function TrainerReports({ clients, onResetReport, focusReport }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resettingId, setResettingId] = useState(null);
  const [confirmResetId, setConfirmResetId] = useState(null);
  const [expandedReportId, setExpandedReportId] = useState(null);
  const [clientFilter, setClientFilter] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetWarning, setResetWarning] = useState("");
  const [loadError, setLoadError] = useState("");

  const filteredReports = clientFilter
    ? reports.filter((report) => report.clientId === clientFilter)
    : reports;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    (async () => {
      try {
        const clientReports = await Promise.all(clients.map(async (client) => {
          const [savedReports, weeks] = await Promise.all([
            getWorkoutReports(client.id),
            getTrainingPrograms(client.id),
          ]);
          if (savedReports === null || weeks === null) {
            throw new Error(`Could not load reports for client ${client.id}.`);
          }
          const archived = savedReports.map((report) => ({
            ...report,
            clientId: report.client_id,
            clientName: client.name,
            weekId: report.week_start,
            dayIdx: report.day_index,
            date: report.submitted_at,
            day: report.day_name,
            notificationId: `${report.client_id}-${report.week_start}-${report.day_index}-${report.workout_date}`,
            isPersisted: true,
          }));
          const archivedDays = new Set(archived.map((report) =>
            `${report.weekId}-${report.dayIdx}-${report.workout_date}`
          ));
          const previousSubmissions = weeks.flatMap((week) =>
            week.days.flatMap((day, dayIdx) => {
              if (!day.submittedAt) return [];
              const date = dateIdFromTimestamp(day.submittedAt);
              if (archivedDays.has(`${week.weekId}-${dayIdx}-${date}`)) return [];
              const id = `${client.id}-${week.weekId}-${dayIdx}-${date}`;
              return [{
                id,
                clientId: client.id,
                clientName: client.name,
                weekId: week.weekId,
                dayIdx,
                date: day.submittedAt,
                day: day.day,
                exercises: day.exercises,
                notificationId: id,
                isPersisted: false,
              }];
            })
          );
          return [...archived, ...previousSubmissions].map((report) => ({
            ...report,
            clientName: report.clientName || client.name,
          }));
        }));
        if (active) setReports(clientReports.flat().sort((a, b) => new Date(b.date) - new Date(a.date)));
      } catch (loadError) {
        console.error("Could not load trainer workout reports", loadError);
        if (active) setLoadError("Izveštaji treninga nisu mogli da se učitaju. Pokušaj ponovo.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [clients]);

  useEffect(() => {
    if (!focusReport) return;
    setClientFilter(focusReport.clientId);
    const report = reports.find((item) => item.id === focusReport.reportId);
    if (report) setExpandedReportId(report.id);
  }, [focusReport, reports]);

  if (loading) return <p className="text-sm text-neutral-400">Učitavanje izveštaja...</p>;
  if (loadError) return <p role="alert" className="text-sm font-semibold text-red-700">{loadError}</p>;

  async function handleReset(report) {
    setResetError("");
    setResetWarning("");
    setResettingId(report.id);
    try {
      const result = await onResetReport(report);
      if (!result.ok) {
        setResetError(result.error);
        return;
      }
      setReports((current) => current.filter((item) => item.id !== report.id));
      setResetWarning(result.warning || "");
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
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Header>Predati treninzi</Header>
          <label className="block text-xs font-bold text-neutral-600">
            Prikaži izveštaje
            <select
              className={inputCls + " min-w-52"}
              value={clientFilter}
              onChange={(event) => {
                setClientFilter(event.target.value);
                setExpandedReportId(null);
                setConfirmResetId(null);
              }}
            >
              <option value="">Svi klijenti</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </label>
        </div>
        <span className="app-progress-chip px-3 py-1 text-xs">{filteredReports.length} izveštaja</span>
      </div>
      {resetError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{resetError}</p>}
      {resetWarning && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">{resetWarning}</p>}
      {filteredReports.length === 0 && <Panel className="p-8 text-center text-neutral-500">Nema izveštaja za izabranog filtera.</Panel>}
      {filteredReports.map((report) => (
        <Panel key={report.id} className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-[#19352c]">{report.clientName}</h3>
              <p className="mt-1 text-sm text-neutral-500">{report.day} · {new Date(report.date).toLocaleString("sr-RS")}</p>
            </div>
            <Btn
              color="ghost"
              onClick={() => setExpandedReportId((current) => current === report.id ? null : report.id)}
              className="text-xs"
            >
              {expandedReportId === report.id ? "Sakrij detalje" : "Prikaži detalje"}
            </Btn>
          </div>
          {expandedReportId === report.id && (
            <div className="mt-3 border-t border-neutral-100 pt-3">
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
              <div className="mt-3 flex justify-end">
                {confirmResetId === report.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-600">Potvrdi brisanje?</span>
                    <button
                      type="button"
                      disabled={resettingId === report.id}
                      onClick={() => handleReset(report)}
                      className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
                    >
                      {resettingId === report.id ? "Resetujem..." : "Potvrdi"}
                    </button>
                    <button
                      type="button"
                      disabled={resettingId === report.id}
                      onClick={() => setConfirmResetId(null)}
                      className="rounded-md px-2 py-1.5 text-xs font-semibold text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-50"
                    >
                      Otkaži
                    </button>
                  </div>
                ) : (
                  <Btn color="red" disabled={resettingId === report.id} onClick={() => setConfirmResetId(report.id)} className="text-xs">
                    Obriši izveštaj i restartuj dan
                  </Btn>
                )}
              </div>
            </div>
          )}
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
  const [measurementError, setMeasurementError] = useState("");
  const [photosError, setPhotosError] = useState("");
  const [deletingPhotoId, setDeletingPhotoId] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMeasurementError("");
    setPhotosError("");
    (async () => {
      const [measurements, p] = await Promise.all([
        getBodyMeasurements(client),
        getProgressPhotos(client),
      ]);
      if (!active) return;
      setBodylog(measurements || []);
      setPhotos(p || []);
      if (measurements === null) setMeasurementError("Merenja nisu mogla da se učitaju.");
      if (p === null) setPhotosError("Fotografije napretka nisu mogle da se učitaju.");
      setLoading(false);
    })();
    return () => { active = false; };
  }, [client]);

  if (loading) return <p className="text-xs text-neutral-400 font-mono">Učitavanje...</p>;
  const chartData = bodylog.slice().reverse().map((measurement) => ({
    date: measurement.measured_at.slice(5),
    kg: parseFloat(measurement.weight),
  }));

  async function handleDeletePhoto(photo) {
    setPhotosError("");
    setDeletingPhotoId(photo.id);
    try {
      const deleted = await deleteProgressPhoto(photo);
      if (!deleted) {
        setPhotosError("Fotografija nije obrisana. Proveri dozvole i pokušaj ponovo.");
        return;
      }
      setPhotos((current) => current.filter((item) => item.id !== photo.id));
    } catch (error) {
      console.error("Could not delete client progress photo", photo.id, error);
      setPhotosError("Fotografija nije obrisana. Proveri dozvole i pokušaj ponovo.");
    } finally {
      setDeletingPhotoId(null);
    }
  }

  return (
    <div className="space-y-3">
      <Panel className="p-3">
        <Header>Telesna težina</Header>
        {measurementError && <p role="alert" className="mb-2 text-sm font-semibold text-red-700">{measurementError}</p>}
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
        {photosError && <p role="alert" className="mb-2 text-sm font-semibold text-red-700">{photosError}</p>}
        {photos.length === 0 ? <p className="text-xs text-neutral-400 font-mono">Nema fotografija još.</p> : (
          <div className="grid grid-cols-4 gap-2">
            {photos.slice().reverse().map((p, i) => (
              <div key={p.id || i} className="relative text-center">
                <img src={p.img} alt="Fotografija napretka klijenta" className="rounded-lg border-2 border-neutral-900 aspect-square object-cover" />
                <button
                  type="button"
                  onClick={() => handleDeletePhoto(p)}
                  disabled={deletingPhotoId === p.id}
                  aria-label="Obriši fotografiju klijenta"
                  title="Obriši fotografiju"
                  className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white shadow transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X size={15} />
                </button>
                <p className="text-[9px] font-mono text-neutral-500 mt-1">{p.date}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
