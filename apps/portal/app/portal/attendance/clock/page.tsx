"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Button, Select, Field, Alert, Spinner, Badge, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";

interface StaffTarget {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  teacher?: { staffNumber: string | null } | null;
  admin?: { designation: string | null } | null;
}

interface TodayRecord {
  checkInAt: string | null;
  checkInDistanceM: number | null;
  checkInWithinRadius: boolean | null;
  checkOutAt: string | null;
  checkOutDistanceM: number | null;
  checkOutWithinRadius: boolean | null;
}

interface ClockStatus {
  userId: string;
  radius: number;
  schoolLat: number;
  schoolLng: number;
  today: TodayRecord | null;
}

interface Loc {
  lat: number | null;
  lng: number | null;
  error: string | null;
  supported: boolean;
}

export default function StaffClockPage() {
  const [targets, setTargets] = useState<StaffTarget[]>([]);
  const [targetUserId, setTargetUserId] = useState("");
  const [status, setStatus] = useState<ClockStatus | null>(null);
  const [loc, setLoc] = useState<Loc>({ lat: null, lng: null, error: null, supported: true });
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLoc({ lat: null, lng: null, error: "Geolocation is not supported by this browser. Use a phone or a browser with location access.", supported: false });
      return;
    }
    setLocating(true);
    setLoc({ lat: null, lng: null, error: null, supported: true });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude, error: null, supported: true });
        setLocating(false);
      },
      (err) => {
        setLoc({ lat: null, lng: null, error: `Location unavailable: ${err.message}. Allow location access and try again.`, supported: true });
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = { targetUserId: targetUserId || undefined };
      const [t, s] = await Promise.all([
        api<{ items: StaffTarget[] }>("attendance/staffClockTargets", { method: "POST", body }),
        api<ClockStatus>("attendance/staffStatus", { method: "POST", body }),
      ]);
      setTargets(t.items);
      setStatus(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function clock(kind: "in" | "out") {
    if (loc.lat === null || loc.lng === null) {
      setMessage(null);
      setError("Get your current location first (use the \"Get my location\" button).");
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const action = kind === "in" ? "staffClockIn" : "staffClockOut";
      const res = await api<{ withinRadius: boolean; distanceMeters: number; proxyByUserId: string | null }>(
        `attendance/${action}`,
        { method: "POST", body: { lat: loc.lat, lng: loc.lng, targetUserId: targetUserId || undefined, deviceInfo: navigator.userAgent } },
      );
      const who = targetUserId && targetUserId !== status?.userId ? " that staff member" : "";
      if (res.withinRadius) {
        setMessage(`Clocked ${kind}${who} successfully (${res.distanceMeters} m from school).`);
      } else {
        setMessage(`Clocked ${kind}${who}, but you were ${res.distanceMeters} m from school — outside the ${status?.radius ?? 150} m geofence. This may be flagged.`);
      }
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const time = (v: string | null) => (v ? new Date(v).toLocaleTimeString() : "—");

  return (
    <div>
      <PageHeader title="Staff Clock In / Out" subtitle="Geofenced staff attendance. Clock in when you arrive, clock out when you leave." />

      {error && <Alert tone="danger">{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}

      {loading ? (
        <Spinner size={28} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 18 }}>
          <Card title="Clock in / out">
            <div style={{ display: "grid", gap: 14 }}>
              <Field label="Clock for">
                <Select value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)}>
                  <option value="">Myself</option>
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.firstName} {t.lastName} ({t.role.toLowerCase()})
                    </option>
                  ))}
                </Select>
              </Field>

              <div>
                <Button variant="outline" onClick={locate} loading={locating}>
                  <Icon name="attendance" size={16} /> Get my location
                </Button>
                {loc.lat !== null && loc.lng !== null && (
                  <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--duga-muted)" }}>
                    Current: {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
                  </div>
                )}
                {loc.error && <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--duga-danger)" }}>{loc.error}</div>}
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Button variant="accent" onClick={() => clock("in")} loading={busy}>
                  <Icon name="check" size={16} /> Clock in
                </Button>
                <Button variant="danger" onClick={() => clock("out")} loading={busy}>
                  <Icon name="logout" size={16} /> Clock out
                </Button>
              </div>
            </div>
          </Card>

          <Card title="Today's status">
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13.5 }}>Geofence radius</span>
                <Badge tone="info">{status?.radius ?? 150} m</Badge>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13.5 }}>School location</span>
                <Badge tone="neutral">
                  {status?.schoolLat.toFixed(4)}, {status?.schoolLng.toFixed(4)}
                </Badge>
              </div>
              <hr style={{ border: "none", borderTop: "1px solid var(--duga-border)", margin: "4px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13.5 }}>Clock in</span>
                <span style={{ fontWeight: 600 }}>{time(status?.today?.checkInAt ?? null)}</span>
              </div>
              {status?.today?.checkInDistanceM != null && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12.5, color: "var(--duga-muted)" }}>Distance at check-in</span>
                  <Badge tone={status.today.checkInWithinRadius ? "success" : "danger"}>{status.today.checkInDistanceM} m</Badge>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13.5 }}>Clock out</span>
                <span style={{ fontWeight: 600 }}>{time(status?.today?.checkOutAt ?? null)}</span>
              </div>
              {status?.today?.checkOutDistanceM != null && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12.5, color: "var(--duga-muted)" }}>Distance at check-out</span>
                  <Badge tone={status.today.checkOutWithinRadius ? "success" : "danger"}>{status.today.checkOutDistanceM} m</Badge>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
