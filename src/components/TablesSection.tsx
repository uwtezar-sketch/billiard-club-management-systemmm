"use client";
import { useState, useEffect, useCallback } from "react";
import Modal from "./Modal";
import ConfirmDialog from "./ConfirmDialog";
import { useToast } from "./Toast";
import { formatDuration, calcPrice, formatPrice, toJalaali } from "@/lib/jalaali";
import InvoiceModal from "./InvoiceModal";

interface Table {
  id: number;
  name: string;
  type: string;
  isActive: boolean;
  activeSession?: Session | null;
}

interface Session {
  id: number;
  tableId: number;
  customerName: string | null;
  customerPhone: string | null;
  startTime: string;
  pricePerHour: string;
  notes: string | null;
  status: string;
}

interface CafeOrder {
  id: number;
  cafeItemId: number | null;
  name: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  customerName: string | null;
}

interface CafeMenuItem {
  id: number;
  name: string;
  price: string;
}

interface Settings {
  snooker_price?: string;
  eightball_price?: string;
  playstation_price?: string;
}

interface Reservation {
  id: number;
  customerName: string;
  customerPhone: string | null;
  tableType: string;
  reservationDate: string;
  startTime: string;
  status: string;
}

function useTimer(startTime: string | null, isActive: boolean) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isActive || !startTime) { setElapsed(0); return; }
    const calc = () => {
      const diff = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
      setElapsed(Math.max(0, diff));
    };
    calc();
    const interval = setInterval(calc, 1000);
    return () => clearInterval(interval);
  }, [startTime, isActive]);

  return elapsed;
}

const LONG_SESSION_HOURS = 4;

function isSessionForgotten(startTime: string) {
  return Date.now() - new Date(startTime).getTime() > LONG_SESSION_HOURS * 60 * 60 * 1000;
}
function useSecondsAgo(date: Date | null) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);
  if (!date) return null;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "همین الان";
  if (seconds < 60) return `${seconds.toLocaleString("fa-IR")} ثانیه پیش`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes.toLocaleString("fa-IR")} دقیقه پیش`;
}

function TimerDisplay({ startTime, isActive, pricePerHour }: { startTime: string; isActive: boolean; pricePerHour: number }) {
  const elapsed = useTimer(isActive ? startTime : null, isActive);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const cost = calcPrice(minutes, pricePerHour);

  return (
    <div className="text-center">
      <div className="text-2xl font-bold font-mono text-white timer-pulse">
        {String(hours).padStart(2, "0")}:{String(mins).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </div>
      <div className="text-sm text-green-300 mt-1">{formatPrice(cost)}</div>
    </div>
  );
}

function getTableCardClass(type: string, isActive: boolean) {
  if (type === "snooker") return isActive ? "table-snooker-active" : "table-snooker-free";
  if (type === "eightball") return isActive ? "table-eightball-active" : "table-eightball-free";
  return isActive ? "table-playstation-active" : "table-playstation-free";
}

function getTypeLabel(type: string) {
  if (type === "snooker") return "اسنوکر";
  if (type === "eightball") return "ایت‌بال";
  return "پلی‌استیشن";
}

function getTypeIcon(type: string) {
  if (type === "snooker") return "🎱";
  if (type === "eightball") return "🎳";
  return "🎮";
}

export default function TablesSection({ onRefreshNeeded }: { onRefreshNeeded?: () => void }) {
  const { showToast } = useToast();
  const [tables, setTables] = useState<Table[]>([]);
  const [menuItems, setMenuItems] = useState<CafeMenuItem[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [reservations, setReservations] = useState<Reservation[]>([]);
const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  // Modals
  const [startModal, setStartModal] = useState<{ open: boolean; table: Table | null }>({ open: false, table: null });
  const [sessionModal, setSessionModal] = useState<{ open: boolean; table: Table | null; session: Session | null; cafeOrders: CafeOrder[] }>({
    open: false, table: null, session: null, cafeOrders: [],
  });
  const [invoiceModal, setInvoiceModal] = useState<{ open: boolean; session: Session | null; table: Table | null; cafeOrders: CafeOrder[]; isPartial: boolean }>({
    open: false, session: null, table: null, cafeOrders: [], isPartial: false,
  });
  const [confirmStop, setConfirmStop] = useState<{ open: boolean; tableId: number | null }>({ open: false, tableId: null });

  // Start form
  const [startForm, setStartForm] = useState({
    customerName: "",
    customerPhone: "",
    startTime: "",
    notes: "",
    price: "",
  });
  const [startLoading, setStartLoading] = useState(false);
  const [fillingReservationId, setFillingReservationId] = useState<number | null>(null);

  // Session edit
  const [editStartTime, setEditStartTime] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCustomer, setEditCustomer] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [tablesRes, menuRes, settingsRes, reservationsRes] = await Promise.all([
        fetch("/api/tables"),
        fetch("/api/cafe"),
        fetch("/api/settings"),
        fetch("/api/reservations?status=registered"),
      ]);
      setTables(await tablesRes.json());
      setMenuItems(await menuRes.json());
      setSettings(await settingsRes.json());
      setReservations(await reservationsRes.json());
      setLastSync(new Date());
      setSyncFailed(false);
    } catch {
      setSyncFailed(true);
      showToast("خطا در دریافت اطلاعات", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  function getDefaultPrice(type: string) {
    if (type === "snooker") return Number(settings.snooker_price || 150000);
    if (type === "eightball") return Number(settings.eightball_price || 100000);
    return Number(settings.playstation_price || 80000);
  }

  function openStartModal(table: Table) {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const todayRes = getTodayReservation(table.type)[0];
    setStartForm({
      customerName: todayRes?.customerName || "",
      customerPhone: todayRes?.customerPhone || "",
      startTime: timeStr,
      notes: "",
      price: String(getDefaultPrice(table.type)),
    });
    setFillingReservationId(todayRes?.id || null);
    setStartModal({ open: true, table });
  }

  async function handleStart() {
    if (!startModal.table) return;
    setStartLoading(true);
    try {
      const table = startModal.table;
      const price = startForm.price ? Number(startForm.price) : getDefaultPrice(table.type);
      const now = new Date();
      let startTime = new Date();
      if (startForm.startTime) {
        const [h, m] = startForm.startTime.split(":").map(Number);
        startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
      }

      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableId: table.id,
          customerName: startForm.customerName || null,
          customerPhone: startForm.customerPhone || null,
          startTime: startTime.toISOString(),
          pricePerHour: price,
          notes: startForm.notes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || "خطا در شروع سشن", "error");
        return;
      }
      const newSession = await res.json();
      if (fillingReservationId) {
        await fetch(`/api/reservations/${fillingReservationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "done", sessionId: newSession.id }),
        });
      }
      showToast(`${getTypeLabel(table.type)} ${table.name} شروع شد`, "success");
      setStartModal({ open: false, table: null });
      setFillingReservationId(null);
      fetchData();
      onRefreshNeeded?.();
    } finally {
      setStartLoading(false);
    }
  }

  async function openSessionModal(table: Table) {
    if (!table.activeSession) return;
    const res = await fetch(`/api/sessions/${table.activeSession.id}/cafe`);
    const orders = await res.json();
    setSessionModal({
      open: true,
      table,
      session: table.activeSession,
      cafeOrders: Array.isArray(orders) ? orders : [],
    });
    setEditStartTime("");
    setEditPrice(table.activeSession.pricePerHour);
    setEditCustomer(table.activeSession.customerName || "");
    setEditNotes(table.activeSession.notes || "");
  }

  async function handleUpdateSession() {
    if (!sessionModal.session) return;
    const sid = sessionModal.session.id;
    const body: Record<string, unknown> = {};
    if (editCustomer !== (sessionModal.session.customerName || "")) body.customerName = editCustomer;
    if (editNotes !== (sessionModal.session.notes || "")) body.notes = editNotes;
    if (editPrice && Number(editPrice) !== Number(sessionModal.session.pricePerHour)) {
      body.pricePerHour = Number(editPrice);
    }
    if (editStartTime) {
      const session = sessionModal.session;
      const orig = new Date(session.startTime);
      const [h, m] = editStartTime.split(":").map(Number);
      const newStart = new Date(orig.getFullYear(), orig.getMonth(), orig.getDate(), h, m, 0);
      body.startTime = newStart.toISOString();
    }

    if (Object.keys(body).length === 0) return;

    const res = await fetch(`/api/sessions/${sid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      showToast("سشن ویرایش شد", "success");
      fetchData();
      setSessionModal((prev) => ({ ...prev, open: false }));
    } else {
      showToast("خطا در ویرایش", "error");
    }
  }

  function openInvoiceModal(table: Table, isPartial: boolean) {
    if (!table.activeSession) return;
    setInvoiceModal({
      open: true,
      session: table.activeSession,
      table,
      cafeOrders: sessionModal.cafeOrders,
      isPartial,
    });
    setSessionModal((prev) => ({ ...prev, open: false }));
  }

  async function handleStop(tableId: number) {
    setConfirmStop({ open: true, tableId });
  }

  async function confirmStopSession() {
    const tableId = confirmStop.tableId;
    if (!tableId) return;
    const table = tables.find((t) => t.id === tableId);
    if (!table?.activeSession) return;

    // اگه از "مدیریت" نیومده باشیم، sessionModal.cafeOrders ممکنه خالی/قدیمی باشه.
    // برای اطمینان، سفارش‌های کافه رو مستقیم از سرور می‌گیریم.
    const res = await fetch(`/api/sessions/${table.activeSession.id}/cafe`);
    const orders = await res.json();

    setInvoiceModal({
      open: true,
      session: table.activeSession,
      table,
      cafeOrders: Array.isArray(orders) ? orders : [],
      isPartial: false,
    });
    setConfirmStop({ open: false, tableId: null });
    setSessionModal((prev) => ({ ...prev, open: false }));
  }

  async function addCafeItem(item: CafeMenuItem) {
    if (!sessionModal.session) return;
    const res = await fetch(`/api/sessions/${sessionModal.session.id}/cafe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cafeItemId: item.id,
        name: item.name,
        quantity: 1,
        unitPrice: Number(item.price),
      }),
    });
    if (res.ok) {
      const order = await res.json();
      setSessionModal((prev) => ({ ...prev, cafeOrders: [...prev.cafeOrders, order] }));
      showToast(`${item.name} اضافه شد`, "success");
    }
  }

  async function removeCafeItem(sessionId: number, orderId: number) {
    await fetch(`/api/sessions/${sessionId}/cafe?orderId=${orderId}`, { method: "DELETE" });
    setSessionModal((prev) => ({
      ...prev,
      cafeOrders: prev.cafeOrders.filter((o) => o.id !== orderId),
    }));
  }

  function getTodayReservation(tableType: string) {
    const today = toJalaali(new Date());
    return reservations.filter(
      (r) => r.tableType === tableType && r.reservationDate === today && r.status === "registered"
    );
  }

  const secondsAgoLabel = useSecondsAgo(lastSync);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton" style={{ height: "20px", width: "140px" }} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: "180px" }} />
          ))}
        </div>
        <div className="skeleton" style={{ height: "20px", width: "140px" }} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: "180px" }} />
          ))}
        </div>
      </div>
    );
  }

  const snookerTables = tables.filter((t) => t.type === "snooker");
  const eightballTables = tables.filter((t) => t.type === "eightball");
  const playstationTables = tables.filter((t) => t.type === "playstation");

  return (
    <div className="space-y-6">
      {/* Sync status */}
      <div className="flex items-center justify-between text-xs">
        {syncFailed ? (
          <span style={{ color: "#f27f8a" }}>⚠️ عدم اتصال — داده‌ها ممکنه قدیمی باشن</span>
        ) : (
          <span className="text-slate-500">🟢 بروزرسانی: {secondsAgoLabel}</span>
        )}
      </div>

      {/* Snooker Tables */}
      {snookerTables.length > 0 && (
      <div>
        <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: "#5ee89b" }}>
          🎱 <span>میزهای اسنوکر</span>
          <span className="badge" style={{ background: "#0d3b2655", color: "#5ee89b" }}>
            {snookerTables.filter((t) => t.isActive).length}/{snookerTables.length} فعال
          </span>
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {snookerTables.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              onStart={() => openStartModal(table)}
              onManage={() => openSessionModal(table)}
              onStop={() => handleStop(table.id)}
              reservations={getTodayReservation(table.type)}
            />
          ))}
        </div>
      </div>
      )}

      {/* Eight Ball Tables */}
      {eightballTables.length > 0 && (
      <div>
        <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: "#e0b23a" }}>
          🎳 <span>میزهای ایت‌بال</span>
          <span className="badge" style={{ background: "#3a2a0c55", color: "#e0b23a" }}>
            {eightballTables.filter((t) => t.isActive).length}/{eightballTables.length} فعال
          </span>
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {eightballTables.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              onStart={() => openStartModal(table)}
              onManage={() => openSessionModal(table)}
              onStop={() => handleStop(table.id)}
              reservations={getTodayReservation(table.type)}
            />
          ))}
        </div>
      </div>
      )}

      {/* PlayStation */}
      {playstationTables.length > 0 && (
      <div>
        <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: "#c78bd6" }}>
          🎮 <span>پلی‌استیشن</span>
          <span className="badge" style={{ background: "#3d1a4555", color: "#c78bd6" }}>
            {playstationTables.filter((t) => t.isActive).length}/{playstationTables.length} فعال
          </span>
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {playstationTables.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              onStart={() => openStartModal(table)}
              onManage={() => openSessionModal(table)}
              onStop={() => handleStop(table.id)}
              reservations={getTodayReservation(table.type)}
            />
          ))}
        </div>
      </div>
      )}

      {/* Start Modal */}
      <Modal
        open={startModal.open}
        onClose={() => setStartModal({ open: false, table: null })}
        title={`شروع ${startModal.table ? getTypeLabel(startModal.table.type) : ""} - ${startModal.table?.name || ""}`}
      >
        <div className="space-y-4">
          {fillingReservationId && (
            <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "#3a2a0c33", border: "1px solid #c9971f", color: "#e0b23a" }}>
              📅 اطلاعات از رزرو امروز پر شد
            </div>
          )}
          <div>
            <label className="block text-sm text-slate-400 mb-1">نام مشتری (اختیاری)</label>
            <input
              className="form-input"
              placeholder="نام مشتری..."
              value={startForm.customerName}
              onChange={(e) => setStartForm((p) => ({ ...p, customerName: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">شماره تلفن (اختیاری)</label>
            <input
              className="form-input"
              placeholder="09..."
              value={startForm.customerPhone}
              onChange={(e) => setStartForm((p) => ({ ...p, customerPhone: e.target.value }))}
              type="tel"
              dir="ltr"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">ساعت شروع</label>
              <input
                className="form-input"
                type="time"
                value={startForm.startTime}
                onChange={(e) => setStartForm((p) => ({ ...p, startTime: e.target.value }))}
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">قیمت (تومان/ساعت)</label>
              <input
                className="form-input"
                type="number"
                value={startForm.price}
                onChange={(e) => setStartForm((p) => ({ ...p, price: e.target.value }))}
                dir="ltr"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">یادداشت (اختیاری)</label>
            <input
              className="form-input"
              placeholder="یادداشت..."
              value={startForm.notes}
              onChange={(e) => setStartForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </div>
          <div className="flex gap-3">
            <button className="btn btn-secondary flex-1" onClick={() => { setStartModal({ open: false, table: null }); setFillingReservationId(null); }}>
              انصراف
            </button>
            <button
              className="btn btn-success flex-1 btn-lg"
              onClick={handleStart}
              disabled={startLoading}
            >
              {startLoading ? "در حال شروع..." : "▶ شروع بازی"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Session Management Modal */}
      <Modal
        open={sessionModal.open}
        onClose={() => setSessionModal((p) => ({ ...p, open: false }))}
        title={`مدیریت - ${sessionModal.table?.name || ""}`}
        size="lg"
      >
        {sessionModal.session && sessionModal.table && (
          <div className="space-y-4">
            {/* Timer */}
            <div className={`rounded-xl p-4 border-2 ${getTableCardClass(sessionModal.table.type, true)}`}>
              <TimerDisplay
                startTime={sessionModal.session.startTime}
                isActive={true}
                pricePerHour={Number(sessionModal.session.pricePerHour)}
              />
              {sessionModal.session.customerName && (
                <div className="text-center mt-2 text-white font-medium">
                  👤 {sessionModal.session.customerName}
                </div>
              )}
            </div>

            {/* Edit Session Info */}
            <div className="card space-y-3">
              <h3 className="text-sm font-bold text-slate-300">✏️ ویرایش اطلاعات سشن</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">ساعت شروع</label>
                  <input
                    type="time"
                    className="form-input"
                    value={editStartTime || new Date(sessionModal.session.startTime).toTimeString().slice(0, 5)}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">قیمت (تومان/ساعت)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    dir="ltr"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">نام مشتری</label>
                <input
                  className="form-input"
                  value={editCustomer}
                  onChange={(e) => setEditCustomer(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">یادداشت</label>
                <input
                  className="form-input"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                />
              </div>
              <button className="btn btn-secondary btn-sm" onClick={handleUpdateSession}>
                💾 ذخیره تغییرات
              </button>
            </div>

            {/* Cafe Orders */}
            <div className="card space-y-3">
              <h3 className="text-sm font-bold text-slate-300">☕ سفارشات کافه</h3>
              {sessionModal.cafeOrders.length > 0 ? (
                <div className="space-y-2">
                  {sessionModal.cafeOrders.map((order) => (
                    <div key={order.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "#0e1512" }}>
                      <div className="text-sm">
                        <span className="text-white">{order.name}</span>
                        <span className="text-slate-400 mr-2">×{order.quantity}</span>
                        {order.customerName && (
                          <span className="text-xs mr-1" style={{ color: "#e0b23a" }}>({order.customerName})</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm" style={{ color: "#5ee89b" }}>{formatPrice(Number(order.totalPrice))}</span>
                        <button
                          className="text-sm"
                          style={{ color: "#f27f8a" }}
                          onClick={() => removeCafeItem(sessionModal.session!.id, order.id)}
                        >✕</button>
                      </div>
                    </div>
                  ))}
                  <div className="text-left text-sm font-bold" style={{ color: "#5ee89b" }}>
                    جمع کافه: {formatPrice(sessionModal.cafeOrders.reduce((s, o) => s + Number(o.totalPrice), 0))}
                  </div>
                </div>
              ) : (
                <div className="text-center text-slate-500 text-sm py-2">سفارشی ثبت نشده</div>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    className="rounded-lg p-2 text-right text-sm transition-colors"
                    style={{ background: "#1a2420" }}
                    onClick={() => addCafeItem(item)}
                  >
                    <div className="text-white font-medium text-xs">{item.name}</div>
                    <div className="text-xs" style={{ color: "#e0b23a" }}>{formatPrice(Number(item.price))}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3">
              <button
                className="btn btn-warning"
                onClick={() => openInvoiceModal(sessionModal.table!, true)}
              >
                📄 فاکتور جزئی
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  setSessionModal((p) => ({ ...p, open: false }));
                  handleStop(sessionModal.table!.id);
                }}
              >
                ⏹ پایان و تسویه
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirm Stop */}
      <ConfirmDialog
        open={confirmStop.open}
        message="آیا می‌خواهید این سشن را پایان دهید و فاکتور صادر کنید؟"
        onConfirm={confirmStopSession}
        onCancel={() => setConfirmStop({ open: false, tableId: null })}
        confirmText="بله، فاکتور صادر کن"
        danger
      />

      {/* Invoice Modal */}
      {invoiceModal.open && invoiceModal.session && invoiceModal.table && (
        <InvoiceModal
          open={invoiceModal.open}
          session={invoiceModal.session}
          table={invoiceModal.table}
          cafeOrders={invoiceModal.cafeOrders}
          isPartial={invoiceModal.isPartial}
          menuItems={menuItems}
          onClose={() => setInvoiceModal((p) => ({ ...p, open: false }))}
          onSuccess={() => {
            setInvoiceModal((p) => ({ ...p, open: false }));
            fetchData();
            onRefreshNeeded?.();
            showToast("فاکتور با موفقیت صادر شد", "success");
          }}
        />
      )}
    </div>
  );
}

function TableCard({
  table,
  onStart,
  onManage,
  onStop,
  reservations,
}: {
  table: Table;
  onStart: () => void;
  onManage: () => void;
  onStop: () => void;
  reservations: Reservation[];
}) {
  const cardClass = getTableCardClass(table.type, table.isActive);
  const hasReservation = reservations.length > 0;

  return (
    <div className={`rounded-xl border-2 p-4 ${cardClass} transition-all duration-300 relative`}>
      {/* Badges */}
      <div className="absolute top-3 left-3 flex flex-col gap-1">
        {table.isActive && (
          <span className="badge" style={{ background: "rgba(0,0,0,0.4)", color: "#fff" }}>
            🔴 فعال
          </span>
        )}
        {table.isActive && table.activeSession && isSessionForgotten(table.activeSession.startTime) && (
          <span className="badge" style={{ background: "#8f1d2c", color: "#fecaca" }}>
            ⚠️ بیش از {LONG_SESSION_HOURS} ساعت
          </span>
        )}
        {hasReservation && !table.isActive && (
          <span className="badge" style={{ background: "#92400e", color: "#fde68a" }}>
            📅 رزرو امروز
          </span>
        )}
      </div>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-xl font-bold text-white">{table.name}</div>
          <div className="text-sm text-white/70">{getTypeLabel(table.type)}</div>
        </div>
        <div className="text-3xl">{getTypeIcon(table.type)}</div>
      </div>

      {/* Active Session Info */}
      {table.isActive && table.activeSession ? (
        <div className="space-y-2">
          <TimerDisplay
            startTime={table.activeSession.startTime}
            isActive={true}
            pricePerHour={Number(table.activeSession.pricePerHour)}
          />
          {table.activeSession.customerName && (
            <div className="text-center text-sm text-white/80">
              👤 {table.activeSession.customerName}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button className="btn btn-secondary btn-sm" onClick={onManage}>
              ⚙️ مدیریت
            </button>
            <button className="btn btn-danger btn-sm" onClick={onStop}>
              ⏹ پایان
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-center text-white/60 text-sm py-2">آزاد</div>
          {hasReservation && (
            <div className="text-xs text-yellow-300 bg-black/20 rounded-lg px-2 py-1">
              رزرو: {reservations[0].customerName} ساعت {reservations[0].startTime}
            </div>
          )}
          <button className="btn btn-success btn-full" onClick={onStart}>
            ▶ شروع بازی
          </button>
        </div>
      )}
    </div>
  );
}
