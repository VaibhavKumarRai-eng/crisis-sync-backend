import React, { useEffect, useMemo, useRef, useState, startTransition } from "react";
import {
  addTimelineEvent,
  ApiError,
  buildWebSocketUrl,
  clearStoredToken,
  createAlert,
  createSos,
  createVenue,
  dashboardSummary,
  fetchHealth,
  getStoredToken,
  listAlerts,
  listSos,
  listUsers,
  listVenues,
  login,
  me,
  register,
  updateSos,
} from "./lib/api";
import { formatCoordinatePair, formatCountLabel, formatDateTime, formatShortTime, roleLabel, statusTone, toTitleCase } from "./lib/format";
import {
  ALERT_SEVERITIES,
  CRISIS_SEVERITIES,
  EMERGENCY_TYPES,
  SOS_STATUSES,
  TIMELINE_EVENT_TYPES,
  USER_ROLES,
  type AlertResponse,
  type DashboardSummary,
  type HealthResponse,
  type Session,
  type SOSResponse,
  type SOSStatus,
  type UserResponse,
  type VenueResponse,
} from "./lib/types";

type BannerKind = "success" | "error" | "info";

interface Banner {
  id: string;
  kind: BannerKind;
  title: string;
  message: string;
}

interface LiveEvent {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  payload?: unknown;
}

interface AuthLoginForm {
  email: string;
  password: string;
}

interface AuthRegisterForm {
  name: string;
  email: string;
  password: string;
  phone: string;
  venue_id: string;
}

interface SosFormState {
  venue_id: string;
  emergency_type: string;
  latitude: string;
  longitude: string;
  message: string;
  address: string;
}

interface AlertFormState {
  venue_id: string;
  title: string;
  message: string;
  severity: string;
  location: string;
}

interface VenueFormState {
  venue_id: string;
  name: string;
  address: string;
}

interface IncidentUpdateForm {
  status: SOSStatus | string;
  assigned_to: string;
  note: string;
}

const initialLoginForm: AuthLoginForm = {
  email: "",
  password: "",
};

const initialRegisterForm: AuthRegisterForm = {
  name: "",
  email: "",
  password: "",
  phone: "",
  venue_id: "default",
};

const initialSosForm: SosFormState = {
  venue_id: "default",
  emergency_type: "security",
  latitude: "",
  longitude: "",
  message: "",
  address: "",
};

const initialAlertForm: AlertFormState = {
  venue_id: "default",
  title: "",
  message: "",
  severity: "medium",
  location: "",
};

const initialVenueForm: VenueFormState = {
  venue_id: "",
  name: "",
  address: "",
};

const initialIncidentForm: IncidentUpdateForm = {
  status: "acknowledged",
  assigned_to: "",
  note: "",
};

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);

  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [incidents, setIncidents] = useState<SOSResponse[]>([]);
  const [alerts, setAlerts] = useState<AlertResponse[]>([]);
  const [venues, setVenues] = useState<VenueResponse[]>([]);
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);

  const [bootstrapping, setBootstrapping] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [selectedPane, setSelectedPane] = useState<"overview" | "incidents" | "admin">("overview");
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [socketState, setSocketState] = useState<"connecting" | "open" | "closed" | "error">("connecting");
  const [banner, setBanner] = useState<Banner | null>(null);

  const [loginForm, setLoginForm] = useState<AuthLoginForm>(initialLoginForm);
  const [registerForm, setRegisterForm] = useState<AuthRegisterForm>(initialRegisterForm);
  const [sosForm, setSosForm] = useState<SosFormState>(initialSosForm);
  const [alertForm, setAlertForm] = useState<AlertFormState>(initialAlertForm);
  const [venueForm, setVenueForm] = useState<VenueFormState>(initialVenueForm);
  const [incidentForm, setIncidentForm] = useState<IncidentUpdateForm>(initialIncidentForm);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const isAuthenticated = Boolean(session);
  const role = session?.user.role ?? "guest";
  const canManageOperations = role === "staff" || role === "admin";
  const canManageAdmin = role === "admin";
  const scopeVenueId = canManageAdmin ? undefined : session?.user.venue_id ?? undefined;
  const visibleIncidents = useMemo(() => incidents.length > 0 ? incidents : dashboard?.recent_incidents ?? [], [dashboard?.recent_incidents, incidents]);
  const selectedIncident = useMemo(
    () => visibleIncidents.find((incident) => incident.id === selectedIncidentId) ?? visibleIncidents[0] ?? null,
    [selectedIncidentId, visibleIncidents],
  );

  useEffect(() => {
    if (session?.user.venue_id) {
      setSosForm((current) => ({
        ...current,
        venue_id: current.venue_id === "default" ? session.user.venue_id : current.venue_id,
      }));
      setAlertForm((current) => ({
        ...current,
        venue_id: current.venue_id === "default" ? session.user.venue_id : current.venue_id,
      }));
    }
    if (!canManageOperations) {
      setSelectedPane("overview");
    }
    if (!canManageAdmin && selectedPane === "admin") {
      setSelectedPane("overview");
    }
  }, [canManageAdmin, canManageOperations, selectedPane, session?.user.venue_id]);

  useEffect(() => {
    if (selectedIncident) {
      setIncidentForm((current) => ({
        ...current,
        status: selectedIncident.status,
        assigned_to: selectedIncident.assigned_to ?? current.assigned_to,
      }));
    }
  }, [selectedIncident?.assigned_to, selectedIncident?.id, selectedIncident?.status]);

  useEffect(() => {
    let timer: number | undefined;

    const connect = () => {
      setSocketState("connecting");
      const socket = new WebSocket(buildWebSocketUrl("/api/v1/ws/alerts"));

      socket.onopen = () => {
        setSocketState("open");
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { type?: string; message?: string; data?: unknown };
          if (payload.type === "connection.ready") {
            return;
          }
          const message = payload.message ?? (payload.data && typeof payload.data === "object" && "title" in payload.data
            ? String((payload.data as { title?: unknown }).title ?? "Live update")
            : "Live update received");

          setLiveEvents((current) => [
            {
              id: crypto.randomUUID(),
              type: payload.type ?? "event",
              message,
              timestamp: new Date().toISOString(),
              payload: payload.data,
            },
            ...current,
          ].slice(0, 12));

          if (payload.type && payload.type !== "connection.ready") {
            timer = window.setTimeout(() => {
              void syncWorkspace({ quiet: true });
            }, 250);
          }
        } catch {
          setLiveEvents((current) => [
            {
              id: crypto.randomUUID(),
              type: "message",
              message: String(event.data),
              timestamp: new Date().toISOString(),
            },
            ...current,
          ].slice(0, 12));
        }
      };

      socket.onerror = () => {
        setSocketState("error");
      };

      socket.onclose = () => {
        setSocketState((current) => (current === "error" ? "error" : "closed"));
      };

      return () => socket.close();
    };

    const cleanup = connect();
    return () => {
      if (timer) {
        window.clearTimeout(timer);
      }
      cleanup();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      setBootstrapping(true);
      try {
        const currentHealth = await fetchHealth();
        if (!cancelled) {
          setHealth(currentHealth);
        }
      } catch {
        if (!cancelled) {
          setHealth(null);
        }
      }

      const token = getStoredToken();
      if (!token || cancelled) {
        setBootstrapping(false);
        return;
      }

      try {
        const currentUser = await me();
        if (cancelled) {
          return;
        }
        const nextSession: Session = { token, user: currentUser };
        sessionRef.current = nextSession;
        startTransition(() => {
          setSession(nextSession);
          setAuthMode("login");
        });
        await syncWorkspace({ quiet: true, session: nextSession });
      } catch (error) {
        clearStoredToken();
        if (!cancelled) {
          clearWorkspace();
          setSession(null);
          pushBanner("error", "Session expired", error instanceof Error ? error.message : "Please sign in again.");
        }
      } finally {
        if (!cancelled) {
          setBootstrapping(false);
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!banner) {
      return;
    }

    const timer = window.setTimeout(() => {
      setBanner(null);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [banner]);

  async function syncWorkspace(options: { quiet?: boolean; session?: Session } = {}) {
    const activeSession = options.session ?? sessionRef.current;
    if (!activeSession) {
      return;
    }

    if (!options.quiet) {
      setBusyAction("sync");
    }

    const scopeVenue = activeSession.user.role === "admin" ? undefined : activeSession.user.venue_id;

    const guarded = async <T,>(label: string, task: Promise<T>, onSuccess: (value: T) => void) => {
      try {
        const value = await task;
        if (sessionRef.current?.token !== activeSession.token) {
          return;
        }
        onSuccess(value);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          handleSignOut("Your session expired. Please sign in again.");
          return;
        }
        if (error instanceof ApiError && error.status === 403) {
          return;
        }
        if (!options.quiet) {
          pushBanner("error", label, error instanceof Error ? error.message : "Request failed");
        }
      }
    };

    clearWorkspace({ keepLiveFeed: true, keepForms: true });

    await Promise.all([
      guarded("Dashboard could not be loaded", dashboardSummary(scopeVenue), (summary) => {
        setDashboard(summary);
      }),
      guarded("SOS incidents could not be loaded", listSos({ venue_id: scopeVenue, limit: 40 }), (items) => {
        setIncidents(items);
        setSelectedIncidentId((current) => current || items[0]?.id || "");
      }),
      guarded("Alerts could not be loaded", listAlerts({ venue_id: scopeVenue, limit: 40 }), (items) => {
        setAlerts(items);
      }),
      activeSession.user.role === "admin"
        ? guarded("Venues could not be loaded", listVenues({ limit: 100 }), (items) => {
            setVenues(items);
          })
        : Promise.resolve(),
      activeSession.user.role === "admin"
        ? guarded("Users could not be loaded", listUsers({ limit: 100 }), (items) => {
            setUsers(items);
          })
        : Promise.resolve(),
    ]);

    if (sessionRef.current?.token === activeSession.token) {
      setLastSyncAt(new Date().toISOString());
    }

    if (!options.quiet) {
      setBusyAction(null);
    }
  }

  function clearWorkspace(options: { keepLiveFeed?: boolean; keepForms?: boolean } = {}) {
    setDashboard(null);
    setIncidents([]);
    setAlerts([]);
    setVenues([]);
    setUsers([]);
    setSelectedIncidentId("");
    setLastSyncAt(null);
    if (!options.keepForms) {
      setLoginForm(initialLoginForm);
      setRegisterForm(initialRegisterForm);
      setSosForm(initialSosForm);
      setAlertForm(initialAlertForm);
      setVenueForm(initialVenueForm);
      setIncidentForm(initialIncidentForm);
    }
    if (!options.keepLiveFeed) {
      setLiveEvents([]);
    }
  }

  function pushBanner(kind: BannerKind, title: string, message: string) {
    setBanner({
      id: crypto.randomUUID(),
      kind,
      title,
      message,
    });
  }

  function handleSignOut(message?: string) {
    clearStoredToken();
    sessionRef.current = null;
    setSession(null);
    clearWorkspace();
    setSelectedPane("overview");
    if (message) {
      pushBanner("info", "Signed out", message);
    }
  }

  async function handleLoginSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("login");
    try {
      await login(loginForm);
      const currentUser = await me();
      const token = getStoredToken();
      if (!token) {
        throw new Error("Authentication token was not stored");
      }
      const nextSession: Session = { token, user: currentUser };
      sessionRef.current = nextSession;
      startTransition(() => {
        setSession(nextSession);
        setAuthMode("login");
        setSelectedPane("overview");
      });
      await syncWorkspace({ quiet: true, session: nextSession });
      pushBanner("success", "Welcome back", `Signed in as ${currentUser.name}.`);
    } catch (error) {
      pushBanner("error", "Login failed", error instanceof Error ? error.message : "Unable to sign in");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRegisterSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("register");
    try {
      await register({
        ...registerForm,
        phone: registerForm.phone.trim() || undefined,
      });
      pushBanner("success", "Account created", "We signed you up. Signing in now.");
      setLoginForm({
        email: registerForm.email,
        password: registerForm.password,
      });
      setAuthMode("login");
      await handleLoginWithCredentials(registerForm.email, registerForm.password);
    } catch (error) {
      pushBanner("error", "Registration failed", error instanceof Error ? error.message : "Unable to create the account");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleLoginWithCredentials(email: string, password: string) {
    await login({ email, password });
    const currentUser = await me();
    const token = getStoredToken();
    if (!token) {
      throw new Error("Authentication token was not stored");
    }
    const nextSession: Session = { token, user: currentUser };
    sessionRef.current = nextSession;
    startTransition(() => {
      setSession(nextSession);
      setAuthMode("login");
      setSelectedPane("overview");
    });
    await syncWorkspace({ quiet: true, session: nextSession });
  }

  async function handleSosSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionRef.current) {
      pushBanner("info", "Sign in required", "Report an emergency after signing in.");
      return;
    }

    const latitude = Number.parseFloat(sosForm.latitude);
    const longitude = Number.parseFloat(sosForm.longitude);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      pushBanner("error", "Invalid coordinates", "Add a valid latitude and longitude.");
      return;
    }

    setBusyAction("create-sos");
    try {
      await createSos({
        venue_id: sosForm.venue_id.trim() || sessionRef.current.user.venue_id || "default",
        emergency_type: sosForm.emergency_type as (typeof EMERGENCY_TYPES)[number],
        latitude,
        longitude,
        message: sosForm.message.trim() || undefined,
        address: sosForm.address.trim() || undefined,
      });
      pushBanner("success", "SOS sent", "The incident has been added to the queue.");
      setSosForm((current) => ({
        ...current,
        latitude: "",
        longitude: "",
        message: "",
        address: "",
      }));
      await syncWorkspace({ quiet: true });
    } catch (error) {
      pushBanner("error", "SOS submission failed", error instanceof Error ? error.message : "Unable to create the incident");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAlertSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageOperations) {
      pushBanner("info", "Permission needed", "Only staff and admins can broadcast alerts.");
      return;
    }

    setBusyAction("create-alert");
    try {
      await createAlert({
        venue_id: alertForm.venue_id.trim() || session?.user.venue_id || "default",
        title: alertForm.title.trim(),
        message: alertForm.message.trim(),
        severity: alertForm.severity as (typeof ALERT_SEVERITIES)[number],
        location: alertForm.location.trim() || undefined,
      });
      pushBanner("success", "Alert broadcast", "Staff and guests will see the new notice.");
      setAlertForm((current) => ({
        ...current,
        title: "",
        message: "",
        location: "",
      }));
      await syncWorkspace({ quiet: true });
    } catch (error) {
      pushBanner("error", "Alert failed", error instanceof Error ? error.message : "Unable to create the alert");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleVenueSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageAdmin) {
      pushBanner("info", "Permission needed", "Only admins can create venues.");
      return;
    }

    setBusyAction("create-venue");
    try {
      await createVenue({
        venue_id: venueForm.venue_id.trim(),
        name: venueForm.name.trim(),
        address: venueForm.address.trim() || undefined,
      });
      pushBanner("success", "Venue created", `${venueForm.name} has been added.`);
      setVenueForm(initialVenueForm);
      await syncWorkspace({ quiet: true });
    } catch (error) {
      pushBanner("error", "Venue creation failed", error instanceof Error ? error.message : "Unable to create the venue");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleIncidentUpdateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageOperations || !selectedIncident) {
      pushBanner("info", "Selection required", "Pick an incident before updating it.");
      return;
    }

    setBusyAction("update-incident");
    try {
      await updateSos(selectedIncident.id, {
        status: incidentForm.status as SOSStatus,
        assigned_to: incidentForm.assigned_to.trim() || undefined,
        note: incidentForm.note.trim() || undefined,
      });
      pushBanner("success", "Incident updated", `${toTitleCase(incidentForm.status)} has been saved.`);
      setIncidentForm((current) => ({
        ...current,
        note: "",
      }));
      await syncWorkspace({ quiet: true });
    } catch (error) {
      pushBanner("error", "Update failed", error instanceof Error ? error.message : "Unable to update the incident");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleQuickStatusUpdate(status: SOSStatus) {
    if (!selectedIncident || !canManageOperations) {
      return;
    }

    setBusyAction(`status-${status}`);
    try {
      await updateSos(selectedIncident.id, {
        status,
        note: `Marked ${status} from the command center.`,
      });
      pushBanner("success", "Incident status updated", `${selectedIncident.emergency_type} is now ${status}.`);
      await syncWorkspace({ quiet: true });
    } catch (error) {
      pushBanner("error", "Status update failed", error instanceof Error ? error.message : "Unable to change the status");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAddTimelineNote() {
    if (!selectedIncident || !canManageOperations) {
      return;
    }

    const note = incidentForm.note.trim();
    if (!note) {
      pushBanner("info", "Add a note", "Type a message before adding a timeline entry.");
      return;
    }

    setBusyAction("timeline-note");
    try {
      await addTimelineEvent(selectedIncident.id, {
        event_type: "note",
        message: note,
      });
      pushBanner("success", "Timeline updated", "The note was appended to the incident.");
      setIncidentForm((current) => ({
        ...current,
        note: "",
      }));
      await syncWorkspace({ quiet: true });
    } catch (error) {
      pushBanner("error", "Timeline update failed", error instanceof Error ? error.message : "Unable to add the note");
    } finally {
      setBusyAction(null);
    }
  }

  async function useDeviceLocation() {
    if (!navigator.geolocation) {
      pushBanner("error", "Location unavailable", "This browser does not support geolocation.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSosForm((current) => ({
          ...current,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        }));
        pushBanner("success", "Location captured", "Your current coordinates were added to the SOS form.");
      },
      (error) => {
        pushBanner("error", "Location denied", error.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    );
  }

  function quickSwitchPane(nextPane: "overview" | "incidents" | "admin") {
    if (nextPane === "incidents" && !canManageOperations) {
      return;
    }
    if (nextPane === "admin" && !canManageAdmin) {
      return;
    }
    setSelectedPane(nextPane);
  }

  const dashboardCards = dashboard
    ? [
        { label: "Open", value: dashboard.open_incidents, caption: "New and unresolved reports", tone: "warning" },
        { label: "Acknowledged", value: dashboard.acknowledged_incidents, caption: "Accepted by the response team", tone: "accent" },
        { label: "Dispatched", value: dashboard.dispatched_incidents, caption: "Teams already moving on-site", tone: "danger" },
        { label: "High risk", value: dashboard.high_priority_incidents, caption: "Needs immediate attention", tone: "danger" },
      ]
    : [
        { label: "Open", value: 0, caption: "New and unresolved reports", tone: "warning" },
        { label: "Acknowledged", value: 0, caption: "Accepted by the response team", tone: "accent" },
        { label: "Dispatched", value: 0, caption: "Teams already moving on-site", tone: "danger" },
        { label: "High risk", value: 0, caption: "Needs immediate attention", tone: "danger" },
      ];

  const heroTitle = session
    ? canManageAdmin
      ? "Manage venues, people, and active incidents without the extra technical clutter."
      : canManageOperations
        ? "Stay focused on live incidents, alerts, and the actions your team needs right now."
        : "Report emergencies and follow venue updates from one clear workspace."
    : "Report emergencies quickly and keep the experience focused on what matters.";

  const heroDescription = session
    ? canManageAdmin
      ? "Admins get venue oversight and response controls, while technical backend details stay out of the main workflow."
      : canManageOperations
        ? "Staff see the live queue, alerts, and response tools they need to act fast without system-noise panels."
        : "Guests can raise SOS requests and stay informed without seeing staff-only or admin-only controls."
    : "Sign in to unlock the right tools for your role. Guests report SOS, staff handle incidents, and admins manage venues.";

  const heroTags = session
    ? [
        roleLabel(session.user.role),
        `Venue ${session.user.venue_id}`,
        canManageOperations ? "Incident tools active" : "Simple reporting view",
      ]
    : ["Quick SOS reporting", "Role-based access", "Cleaner user view"];

  const heroCards = session
    ? [
        {
          label: "Role",
          value: roleLabel(session.user.role),
          caption: canManageAdmin ? "Full workspace access" : canManageOperations ? "Response tools enabled" : "Personal reporting access",
          tone: statusTone(session.user.role),
        },
        {
          label: "Venue",
          value: session.user.venue_id,
          caption: canManageAdmin ? "Cross-venue view available" : "Current working scope",
          tone: "accent",
        },
        {
          label: "Active queue",
          value: dashboard?.total_active_incidents ?? visibleIncidents.length,
          caption: canManageOperations ? "Incidents needing attention" : "Current safety activity",
          tone: (dashboard?.high_priority_incidents ?? 0) > 0 ? "danger" : "success",
        },
        {
          label: "Last update",
          value: lastSyncAt ? formatShortTime(lastSyncAt) : "Pending",
          caption: "Latest workspace refresh",
          tone: "muted",
        },
      ]
    : [
        {
          label: "Access",
          value: "Guest",
          caption: "Sign in to unlock your role-specific view",
          tone: "muted",
        },
        {
          label: "Reporting",
          value: "SOS ready",
          caption: "Emergency form stays front and center",
          tone: "accent",
        },
        {
          label: "Alerts",
          value: "Focused",
          caption: "Only the most useful updates should be visible",
          tone: "success",
        },
        {
          label: "Experience",
          value: "Cleaner UI",
          caption: "No backend health or system debug blocks",
          tone: "warning",
        },
      ];

  const workspaceHighlights = session
    ? canManageAdmin
      ? ["Incident desk unlocked", "Venue management enabled", "Cross-venue oversight"]
      : canManageOperations
        ? ["Incident queue unlocked", "Alert broadcast enabled", `Scoped to ${session.user.venue_id}`]
        : ["SOS reporting ready", "Venue notices enabled", `Scoped to ${session.user.venue_id}`]
    : ["Sign in to continue", "Create an account in minutes", "Staff and admin tools stay hidden"];

  const workspaceDescription = session
    ? canManageAdmin
      ? "You are seeing the operations view for admins, with staff actions and venue management in one place."
      : canManageOperations
        ? "You are seeing the staff view, focused on response actions, queue management, and alert publishing."
        : "You are seeing the guest view, focused on emergency reporting and the updates relevant to your venue."
    : "Once a user signs in, the app only shows the controls that match their role.";

  return (
    <div className="app-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <div className="ambient ambient-c" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">CS</span>
          <div>
            <div className="brand-name">CrisisSync</div>
            <div className="brand-subtitle">Command center for emergencies, alerts, and live response</div>
          </div>
        </div>

        <div className="topbar-actions">
          {isAuthenticated ? (
            <button className="ghost-button" onClick={() => void syncWorkspace({ quiet: false })} disabled={busyAction === "sync" || bootstrapping}>
              {busyAction === "sync" ? "Syncing..." : "Refresh"}
            </button>
          ) : null}
          {session ? (
            <button className="ghost-button danger" onClick={() => handleSignOut("You have been signed out.")}>
              Sign out
            </button>
          ) : null}
        </div>
      </header>

      <main className="page">
        <section className="hero card">
          <div className="hero-copy">
            <p className="eyebrow">{session ? "Role-based workspace" : "Emergency response made simpler"}</p>
            <h1>{heroTitle}</h1>
            <p className="hero-text">{heroDescription}</p>

            <div className="hero-tags">
              {heroTags.map((tag, index) => (
                <span
                  key={tag}
                  className={
                    index === 0 ? "badge badge-accent" : index === 1 ? "badge badge-muted" : "badge badge-success"
                  }
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="hero-status">
            {heroCards.map((card) => (
              <MetricCard key={card.label} label={card.label} value={card.value} caption={card.caption} tone={card.tone} />
            ))}
          </div>
        </section>

        <div className="workspace">
          <aside className="sidebar">
            <Panel
              title={session ? "Your access" : "Welcome"}
              eyebrow={session ? "Profile" : "Account"}
              description={session ? "Only the tools for your role are shown in this workspace." : "Sign in or create an account to continue."}
            >
              {session ? (
                <div className="session-card">
                  <div className="session-profile">
                    <div className="avatar">{session.user.name.slice(0, 1).toUpperCase()}</div>
                    <div>
                      <div className="session-name">{session.user.name}</div>
                      <div className="session-meta">{session.user.email}</div>
                    </div>
                  </div>

                  <div className="inline-badges">
                    <span className={`badge badge-${statusTone(session.user.role)}`}>{roleLabel(session.user.role)}</span>
                    <span className="badge badge-muted">{session.user.venue_id}</span>
                  </div>
                  <p className="helper-text">{session.user.email}</p>
                </div>
              ) : (
                <>
                  <div className="tab-switcher">
                    <button className={authMode === "login" ? "tab active" : "tab"} onClick={() => setAuthMode("login")}>
                      Sign in
                    </button>
                    <button className={authMode === "register" ? "tab active" : "tab"} onClick={() => setAuthMode("register")}>
                      Register
                    </button>
                  </div>

                  {authMode === "login" ? (
                    <form className="stack" onSubmit={handleLoginSubmit}>
                      <Field label="Email">
                        <input type="email" autoComplete="email" value={loginForm.email} onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))} placeholder="name@example.com" />
                      </Field>
                      <Field label="Password">
                        <input type="password" autoComplete="current-password" value={loginForm.password} onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))} placeholder="Enter password" />
                      </Field>
                      <button className="primary-button full-width" type="submit" disabled={busyAction === "login"}>
                        {busyAction === "login" ? "Signing in..." : "Sign in"}
                      </button>
                    </form>
                  ) : (
                    <form className="stack" onSubmit={handleRegisterSubmit}>
                      <Field label="Name">
                        <input type="text" autoComplete="name" value={registerForm.name} onChange={(event) => setRegisterForm((current) => ({ ...current, name: event.target.value }))} placeholder="Asha Rao" />
                      </Field>
                      <Field label="Email">
                        <input type="email" autoComplete="email" value={registerForm.email} onChange={(event) => setRegisterForm((current) => ({ ...current, email: event.target.value }))} placeholder="name@example.com" />
                      </Field>
                      <Field label="Password">
                        <input type="password" autoComplete="new-password" value={registerForm.password} onChange={(event) => setRegisterForm((current) => ({ ...current, password: event.target.value }))} placeholder="At least 8 characters" />
                      </Field>
                      <Field label="Phone">
                        <input type="tel" value={registerForm.phone} onChange={(event) => setRegisterForm((current) => ({ ...current, phone: event.target.value }))} placeholder="+1 555 123 4567" />
                      </Field>
                      <Field label="Venue ID">
                        <input type="text" value={registerForm.venue_id} onChange={(event) => setRegisterForm((current) => ({ ...current, venue_id: event.target.value }))} placeholder="default" />
                      </Field>
                      <button className="primary-button full-width" type="submit" disabled={busyAction === "register"}>
                        {busyAction === "register" ? "Creating..." : "Create account"}
                      </button>
                    </form>
                  )}
                </>
              )}
            </Panel>

            <Panel
              title="Report SOS"
              eyebrow="Emergency reporting"
              description={session ? "Send a new emergency report with live coordinates and optional context." : "Sign in before reporting an emergency."}
            >
              <form className="stack" onSubmit={handleSosSubmit}>
                <Field label="Venue ID">
                  <input type="text" value={sosForm.venue_id} onChange={(event) => setSosForm((current) => ({ ...current, venue_id: event.target.value }))} placeholder={session?.user.venue_id ?? "default"} />
                </Field>
                <div className="two-up">
                  <Field label="Emergency type">
                    <select value={sosForm.emergency_type} onChange={(event) => setSosForm((current) => ({ ...current, emergency_type: event.target.value }))}>
                      {EMERGENCY_TYPES.map((option) => (
                        <option key={option} value={option}>
                          {toTitleCase(option)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Address">
                    <input type="text" value={sosForm.address} onChange={(event) => setSosForm((current) => ({ ...current, address: event.target.value }))} placeholder="Optional address" />
                  </Field>
                </div>
                <div className="two-up">
                  <Field label="Latitude">
                    <input type="number" step="any" value={sosForm.latitude} onChange={(event) => setSosForm((current) => ({ ...current, latitude: event.target.value }))} placeholder="28.6139" />
                  </Field>
                  <Field label="Longitude">
                    <input type="number" step="any" value={sosForm.longitude} onChange={(event) => setSosForm((current) => ({ ...current, longitude: event.target.value }))} placeholder="77.2090" />
                  </Field>
                </div>
                <Field label="Message">
                  <textarea rows={4} value={sosForm.message} onChange={(event) => setSosForm((current) => ({ ...current, message: event.target.value }))} placeholder="Describe the emergency and any immediate risks." />
                </Field>
                <div className="button-row">
                  <button type="button" className="ghost-button" onClick={useDeviceLocation}>
                    Use my location
                  </button>
                  <button className="primary-button" type="submit" disabled={busyAction === "create-sos" || !session}>
                    {busyAction === "create-sos" ? "Sending..." : "Send SOS"}
                  </button>
                </div>
                {!session ? <p className="helper-text">You can fill this form now, but sending requires a signed-in account.</p> : null}
              </form>
            </Panel>

            <Panel title="Your workspace" eyebrow="Focus" description="The interface stays limited to the actions the current user actually needs.">
              <div className="stack">
                <div className="inline-badges">
                  {workspaceHighlights.map((item, index) => (
                    <span
                      key={item}
                      className={
                        index === 0 ? "badge badge-accent" : index === 1 ? "badge badge-success" : "badge badge-muted"
                      }
                    >
                      {item}
                    </span>
                  ))}
                </div>
                <p className="helper-text">{workspaceDescription}</p>
              </div>
            </Panel>
          </aside>

          <section className="content">
            <div className="content-toolbar card">
              <div>
                <p className="eyebrow">Work surface</p>
                <h2>{selectedPane === "overview" ? "Overview" : selectedPane === "incidents" ? "Incident desk" : "Admin console"}</h2>
              </div>
              <div className="pane-tabs">
                <button className={selectedPane === "overview" ? "tab active" : "tab"} onClick={() => quickSwitchPane("overview")}>
                  Overview
                </button>
                {canManageOperations ? (
                  <button className={selectedPane === "incidents" ? "tab active" : "tab"} onClick={() => quickSwitchPane("incidents")}>
                    Incidents
                  </button>
                ) : null}
                {canManageAdmin ? (
                  <button className={selectedPane === "admin" ? "tab active" : "tab"} onClick={() => quickSwitchPane("admin")}>
                    Admin
                  </button>
                ) : null}
              </div>
            </div>

            {selectedPane === "overview" ? (
              <OverviewPanel
                dashboard={dashboard}
                dashboardCards={dashboardCards}
                alerts={alerts}
                liveEvents={liveEvents}
                incidents={visibleIncidents}
                onPickIncident={(incidentId) => {
                  setSelectedIncidentId(incidentId);
                  quickSwitchPane("incidents");
                }}
                loading={!session && bootstrapping}
                lastSyncAt={lastSyncAt}
              />
            ) : null}

            {selectedPane === "incidents" ? (
              canManageOperations ? (
                <IncidentPanel
                  incidents={visibleIncidents}
                  selectedIncident={selectedIncident}
                  selectedIncidentId={selectedIncidentId}
                  users={users}
                  alertForm={alertForm}
                  form={incidentForm}
                  onSelectIncident={setSelectedIncidentId}
                  onFormChange={setIncidentForm}
                  onAlertFormChange={setAlertForm}
                  onAlertSubmit={handleAlertSubmit}
                  onAddTimelineNote={handleAddTimelineNote}
                  onSubmit={handleIncidentUpdateSubmit}
                  onQuickStatusUpdate={handleQuickStatusUpdate}
                  busyAction={busyAction}
                />
              ) : (
                <LockedPanel title="Incident desk locked" description="Sign in as staff or admin to review and update the active incident queue." />
              )
            ) : null}

            {selectedPane === "admin" ? (
              canManageAdmin ? (
                <AdminPanel
                  venues={venues}
                  users={users}
                  venueForm={venueForm}
                  onVenueFormChange={setVenueForm}
                  onVenueSubmit={handleVenueSubmit}
                  busyAction={busyAction}
                />
              ) : (
                <LockedPanel title="Admin console locked" description="Only admins can manage venues and view the full roster." />
              )
            ) : null}
          </section>
        </div>
      </main>

      {banner ? (
        <div className={`toast toast-${banner.kind}`}>
          <strong>{banner.title}</strong>
          <span>{banner.message}</span>
        </div>
      ) : null}

      {bootstrapping ? <div className="boot-banner">Loading CrisisSync workspace...</div> : null}
    </div>
  );
}

function Panel({ title, eyebrow, description, children }: { title: string; eyebrow?: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h3>{title}</h3>
          {description ? <p className="panel-description">{description}</p> : null}
        </div>
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function MetricCard({ label, value, caption, tone }: { label: string; value: React.ReactNode; caption: string; tone?: string }) {
  return (
    <article className={`metric-card metric-${tone ?? "muted"}`}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-caption">{caption}</span>
    </article>
  );
}

function LockedPanel({ title, description }: { title: string; description: string }) {
  return (
    <section className="panel">
      <div className="empty-state">
        <div className="empty-orb" />
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </section>
  );
}

function OverviewPanel({
  dashboard,
  dashboardCards,
  alerts,
  incidents,
  liveEvents,
  onPickIncident,
  loading,
  lastSyncAt,
}: {
  dashboard: DashboardSummary | null;
  dashboardCards: Array<{ label: string; value: number; caption: string; tone: string }>;
  alerts: AlertResponse[];
  incidents: SOSResponse[];
  liveEvents: LiveEvent[];
  onPickIncident: (incidentId: string) => void;
  loading: boolean;
  lastSyncAt: string | null;
}) {
  return (
    <div className="panel-grid">
      <section className="panel card-surface">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Operational summary</p>
            <h3>{dashboard ? "Live incident metrics" : "Waiting for authenticated data"}</h3>
            <p className="panel-description">
              {dashboard ? `Current scope: ${dashboard.venue_id ?? "all venues"}` : "Sign in to unlock staff and admin metrics."}
            </p>
          </div>
          <div className="panel-chip">{lastSyncAt ? formatDateTime(lastSyncAt) : "No sync yet"}</div>
        </div>

        <div className="stats-grid">
          {dashboardCards.map((card) => (
            <MetricCard key={card.label} label={card.label} value={card.value} caption={card.caption} tone={card.tone} />
          ))}
        </div>
      </section>

      <section className="panel card-surface">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Recent incidents</p>
            <h3>{formatCountLabel(incidents.length, "incident")}</h3>
          </div>
        </div>

        <div className="incident-feed">
          {loading ? <p className="helper-text">Loading incidents...</p> : null}
          {!loading && incidents.length === 0 ? <p className="helper-text">No incident data yet. Create an SOS to populate the queue.</p> : null}
          {incidents.map((incident) => (
            <button key={incident.id} className="incident-row interactive" onClick={() => onPickIncident(incident.id)}>
              <div>
                <div className="incident-row-title">
                  <strong>{toTitleCase(incident.emergency_type)}</strong>
                  <span className={`badge badge-${statusTone(incident.status)}`}>{toTitleCase(String(incident.status))}</span>
                </div>
                <p>{incident.message ?? incident.ai_summary ?? "No description provided."}</p>
              </div>
              <div className="incident-row-meta">
                <span className={`badge badge-${statusTone(incident.priority)}`}>{toTitleCase(String(incident.priority))}</span>
                <span>{formatShortTime(incident.created_at)}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="panel card-surface">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Alerts</p>
            <h3>{formatCountLabel(alerts.length, "alert")}</h3>
          </div>
        </div>

        <div className="alert-feed">
          {alerts.length === 0 ? <p className="helper-text">No alerts yet. Staff can publish venue notices from the incident desk.</p> : null}
          {alerts.map((alert) => (
            <article key={alert.id} className="alert-row">
              <div className="alert-row-heading">
                <strong>{alert.title}</strong>
                <span className={`badge badge-${statusTone(alert.severity)}`}>{toTitleCase(String(alert.severity))}</span>
              </div>
              <p>{alert.message}</p>
              <div className="meta-row">
                <span>{alert.venue_id}</span>
                <span>{formatShortTime(alert.created_at)}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel card-surface">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Recent updates</p>
            <h3>{formatCountLabel(liveEvents.length, "update")}</h3>
          </div>
        </div>

        <div className="live-feed">
          {liveEvents.length === 0 ? <p className="helper-text">Fresh alerts and incident changes will show up here.</p> : null}
          {liveEvents.map((event) => (
            <article key={event.id} className="live-row">
              <div className="row-top">
                <span className="badge badge-muted">Update</span>
                <span>{formatShortTime(event.timestamp)}</span>
              </div>
              <p>{event.message}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function IncidentPanel({
  incidents,
  selectedIncident,
  selectedIncidentId,
  users,
  alertForm,
  form,
  onSelectIncident,
  onFormChange,
  onAlertFormChange,
  onAlertSubmit,
  onSubmit,
  onAddTimelineNote,
  onQuickStatusUpdate,
  busyAction,
}: {
  incidents: SOSResponse[];
  selectedIncident: SOSResponse | null;
  selectedIncidentId: string;
  users: UserResponse[];
  alertForm: AlertFormState;
  form: IncidentUpdateForm;
  onSelectIncident: (incidentId: string) => void;
  onFormChange: React.Dispatch<React.SetStateAction<IncidentUpdateForm>>;
  onAlertFormChange: React.Dispatch<React.SetStateAction<AlertFormState>>;
  onAlertSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onAddTimelineNote: () => Promise<void>;
  onQuickStatusUpdate: (status: SOSStatus) => Promise<void>;
  busyAction: string | null;
}) {
  return (
    <div className="incident-layout">
      <section className="panel card-surface">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Queue</p>
            <h3>{formatCountLabel(incidents.length, "active incident")}</h3>
          </div>
        </div>

        <div className="incident-queue">
          {incidents.length === 0 ? <p className="helper-text">No active incidents found for this scope.</p> : null}
          {incidents.map((incident) => (
            <button
              key={incident.id}
              className={incident.id === selectedIncidentId ? "incident-card active" : "incident-card"}
              onClick={() => onSelectIncident(incident.id)}
            >
              <div className="incident-card-top">
                <strong>{toTitleCase(incident.emergency_type)}</strong>
                <span className={`badge badge-${statusTone(incident.status)}`}>{toTitleCase(String(incident.status))}</span>
              </div>
              <p>{incident.message ?? incident.ai_summary ?? "No narrative provided."}</p>
              <div className="incident-card-meta">
                <span className={`badge badge-${statusTone(incident.priority)}`}>{toTitleCase(String(incident.priority))}</span>
                <span>{formatShortTime(incident.created_at)}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="panel card-surface">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Details</p>
            <h3>{selectedIncident ? `${toTitleCase(selectedIncident.emergency_type)} at ${selectedIncident.venue_id}` : "Select an incident"}</h3>
            {selectedIncident ? (
              <p className="panel-description">
                {formatCoordinatePair(selectedIncident.latitude, selectedIncident.longitude)}
                {selectedIncident.address ? ` - ${selectedIncident.address}` : ""}
              </p>
            ) : (
              <p className="panel-description">Pick a row to inspect the incident timeline and status controls.</p>
            )}
          </div>
        </div>

        {selectedIncident ? (
          <>
            <div className="detail-grid">
              <MetricCard label="Status" value={toTitleCase(String(selectedIncident.status))} caption="Current incident state" tone={statusTone(selectedIncident.status)} />
              <MetricCard label="Priority" value={toTitleCase(String(selectedIncident.priority))} caption="AI triage result" tone={statusTone(selectedIncident.priority)} />
              <MetricCard label="Reported" value={formatShortTime(selectedIncident.created_at)} caption="Created time" tone="muted" />
              <MetricCard label="Assigned" value={selectedIncident.assigned_to ?? "Unassigned"} caption="Responder allocation" tone="muted" />
            </div>

            <div className="timeline">
              <div className="timeline-header">
                <strong>Timeline</strong>
                <span className="helper-text">{selectedIncident.timeline.length} events</span>
              </div>
              <div className="timeline-list">
                {selectedIncident.timeline.map((entry, index) => (
                  <article key={`${entry.event_type}-${entry.occurred_at}-${index}`} className="timeline-item">
                    <div className="timeline-dot" />
                    <div>
                      <div className="timeline-item-top">
                        <span className="badge badge-muted">{toTitleCase(String(entry.event_type))}</span>
                        <span>{formatShortTime(entry.occurred_at)}</span>
                      </div>
                      <p>{entry.message}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className="helper-text">No incident selected yet.</p>
        )}

        <div className="quick-actions">
          <button className="ghost-button" onClick={() => void onQuickStatusUpdate("acknowledged")} disabled={!selectedIncident || busyAction === "status-acknowledged"}>
            Acknowledge
          </button>
          <button className="ghost-button" onClick={() => void onQuickStatusUpdate("dispatched")} disabled={!selectedIncident || busyAction === "status-dispatched"}>
            Dispatch
          </button>
          <button className="ghost-button" onClick={() => void onQuickStatusUpdate("resolved")} disabled={!selectedIncident || busyAction === "status-resolved"}>
            Resolve
          </button>
          <button className="ghost-button danger" onClick={() => void onQuickStatusUpdate("cancelled")} disabled={!selectedIncident || busyAction === "status-cancelled"}>
            Cancel
          </button>
        </div>

        <form className="stack" onSubmit={onSubmit}>
          <div className="two-up">
            <Field label="Incident status">
              <select value={form.status} onChange={(event) => onFormChange((current) => ({ ...current, status: event.target.value as SOSStatus }))}>
                {SOS_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {toTitleCase(option)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Assigned to">
              {users.length > 0 ? (
                <select value={form.assigned_to} onChange={(event) => onFormChange((current) => ({ ...current, assigned_to: event.target.value }))}>
                  <option value="">Unassigned</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} - {user.role}
                    </option>
                  ))}
                </select>
              ) : (
                <input type="text" value={form.assigned_to} onChange={(event) => onFormChange((current) => ({ ...current, assigned_to: event.target.value }))} placeholder="Responder ID" />
              )}
            </Field>
          </div>
          <Field label="Update note">
            <textarea rows={4} value={form.note} onChange={(event) => onFormChange((current) => ({ ...current, note: event.target.value }))} placeholder="Write a status note or operational detail." />
          </Field>
          <div className="button-row">
            <button type="button" className="ghost-button" onClick={() => void onAddTimelineNote()} disabled={!selectedIncident || busyAction === "timeline-note"}>
              Add note
            </button>
            <button className="primary-button" type="submit" disabled={!selectedIncident || busyAction === "update-incident"}>
              {busyAction === "update-incident" ? "Saving..." : "Save incident"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel card-surface">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Broadcast alert</p>
            <h3>Staff notice</h3>
            <p className="panel-description">Broadcast a notice to the current venue or leave the venue field open for a broader scope.</p>
          </div>
        </div>

        <form className="stack" onSubmit={onAlertSubmit}>
          <Field label="Venue ID">
            <input type="text" value={alertForm.venue_id} onChange={(event) => onAlertFormChange((current) => ({ ...current, venue_id: event.target.value }))} placeholder="default" />
          </Field>
          <Field label="Title">
            <input type="text" value={alertForm.title} onChange={(event) => onAlertFormChange((current) => ({ ...current, title: event.target.value }))} placeholder="Hydration point open" />
          </Field>
          <Field label="Message">
            <textarea rows={4} value={alertForm.message} onChange={(event) => onAlertFormChange((current) => ({ ...current, message: event.target.value }))} placeholder="Write the alert details and required actions." />
          </Field>
          <div className="two-up">
            <Field label="Severity">
              <select value={alertForm.severity} onChange={(event) => onAlertFormChange((current) => ({ ...current, severity: event.target.value }))}>
                {ALERT_SEVERITIES.map((option) => (
                  <option key={option} value={option}>
                    {toTitleCase(option)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Location">
              <input type="text" value={alertForm.location} onChange={(event) => onAlertFormChange((current) => ({ ...current, location: event.target.value }))} placeholder="North lobby" />
            </Field>
          </div>
          <button className="primary-button" type="submit" disabled={busyAction === "create-alert"}>
            {busyAction === "create-alert" ? "Broadcasting..." : "Broadcast alert"}
          </button>
        </form>
      </section>
    </div>
  );
}

function AdminPanel({
  venues,
  users,
  venueForm,
  onVenueFormChange,
  onVenueSubmit,
  busyAction,
}: {
  venues: VenueResponse[];
  users: UserResponse[];
  venueForm: VenueFormState;
  onVenueFormChange: React.Dispatch<React.SetStateAction<VenueFormState>>;
  onVenueSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  busyAction: string | null;
}) {
  return (
    <div className="admin-layout">
      <section className="panel card-surface">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Operations note</p>
            <h3>Alert broadcasting lives in the incident desk</h3>
            <p className="panel-description">Admins still see the same alert pipeline, but the shared staff workflow stays in one place.</p>
          </div>
        </div>

        <div className="tag-cloud">
          {ALERT_SEVERITIES.map((option) => (
            <span key={option} className={`badge badge-${statusTone(option)}`}>
              {toTitleCase(option)}
            </span>
          ))}
        </div>
      </section>

      <section className="panel card-surface">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Venue registry</p>
            <h3>Add venue</h3>
          </div>
        </div>

        <form className="stack" onSubmit={onVenueSubmit}>
          <Field label="Venue ID">
            <input type="text" value={venueForm.venue_id} onChange={(event) => onVenueFormChange((current) => ({ ...current, venue_id: event.target.value }))} placeholder="hotel-alpha" />
          </Field>
          <Field label="Name">
            <input type="text" value={venueForm.name} onChange={(event) => onVenueFormChange((current) => ({ ...current, name: event.target.value }))} placeholder="Hotel Alpha" />
          </Field>
          <Field label="Address">
            <textarea rows={3} value={venueForm.address} onChange={(event) => onVenueFormChange((current) => ({ ...current, address: event.target.value }))} placeholder="Optional address" />
          </Field>
          <button className="primary-button" type="submit" disabled={busyAction === "create-venue"}>
            {busyAction === "create-venue" ? "Creating..." : "Create venue"}
          </button>
        </form>
      </section>

      <section className="panel card-surface">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Venues</p>
            <h3>{formatCountLabel(venues.length, "venue")}</h3>
          </div>
        </div>

        <div className="data-list">
          {venues.length === 0 ? <p className="helper-text">No venues loaded yet.</p> : null}
          {venues.map((venue) => (
            <article key={venue.id} className="data-row">
              <div>
                <strong>{venue.name}</strong>
                <p>{venue.address ?? "No address provided"}</p>
              </div>
              <div className="row-stack">
                <span className="badge badge-muted">{venue.venue_id}</span>
                <span>{formatShortTime(venue.created_at)}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel card-surface">
        <div className="panel-header">
          <div>
            <p className="eyebrow">User roster</p>
            <h3>{formatCountLabel(users.length, "user")}</h3>
          </div>
        </div>

        <div className="data-list">
          {users.length === 0 ? <p className="helper-text">No users loaded yet.</p> : null}
          {users.map((user) => (
            <article key={user.id} className="data-row">
              <div>
                <strong>{user.name}</strong>
                <p>{user.email}</p>
              </div>
              <div className="row-stack">
                <span className={`badge badge-${statusTone(user.role)}`}>{roleLabel(user.role)}</span>
                <span>{user.venue_id}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default App;
