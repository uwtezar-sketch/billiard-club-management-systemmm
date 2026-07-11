"use client";
import { useState, useEffect } from "react";
import { ToastProvider } from "@/components/Toast";
import Modal from "@/components/Modal";
import TablesSection from "@/components/TablesSection";
import ReservationsSection from "@/components/ReservationsSection";
import DebtorsSection from "@/components/DebtorsSection";
import HistorySection from "@/components/HistorySection";
import DailyReportSection from "@/components/DailyReportSection";
import SettingsSection from "@/components/SettingsSection";
import DashboardSection from "@/components/DashboardSection";
import CafeSection from "@/components/CafeSection";
import UsersSection from "@/components/UsersSection";
import { todayJalaali } from "@/lib/jalaali";

type Tab = "tables" | "cafe" | "reservations" | "debtors" | "history" | "report" | "dashboard" | "settings" | "users";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "tables", label: "میزها", icon: "🎱" },
  { id: "cafe", label: "کافه", icon: "☕" },
  { id: "reservations", label: "رزروها", icon: "📅" },
  { id: "debtors", label: "بدهکاران", icon: "📋" },
  { id: "history", label: "تاریخچه", icon: "📂" },
  { id: "report", label: "گزارش", icon: "📊" },
  { id: "dashboard", label: "داشبورد", icon: "📈" },
  { id: "users", label: "کاربران", icon: "👤" },
  { id: "settings", label: "تنظیمات", icon: "⚙️" },
];

// این ۵ تا همیشه تو نوار پایین‌ان (هم برای مدیر هم کارمند)
const PRIMARY_TABS: Tab[] = ["tables", "cafe", "reservations", "debtors", "history"];
// این ۴ تا فقط برای مدیر، از پشت دکمه‌ی «بیشتر»
const MORE_TABS: Tab[] = ["report", "dashboard", "users", "settings"];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("tables");
  const [currentTime, setCurrentTime] = useState("");
  const [currentDate, setCurrentDate] = useState("");
  const [role, setRole] = useState<"admin" | "employee" | null>(null);
  const [username, setUsername] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }));
      setCurrentDate(todayJalaali());
    };
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setRole(d?.role || null);
        setUsername(d?.username || "");
      })
      .catch(() => setRole(null));
  }, []);

  useEffect(() => {
    if (role === "employee" && !PRIMARY_TABS.includes(activeTab)) {
      setActiveTab("tables");
    }
  }, [role, activeTab]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const primaryTabs = TABS.filter((t) => PRIMARY_TABS.includes(t.id));
  const moreTabs = TABS.filter((t) => MORE_TABS.includes(t.id));
  const isMoreActive = role === "admin" && MORE_TABS.includes(activeTab);
  const activeMoreTab = moreTabs.find((t) => t.id === activeTab);

  return (
    <ToastProvider>
      <div className="min-h-screen flex flex-col" style={{ maxWidth: "480px", margin: "0 auto" }}>
        {/* Header */}
        <header
          className="sticky top-0 z-50 px-4 py-3"
          style={{
            background: "linear-gradient(135deg, #0a0d0b 0%, #14211a 100%)",
            borderBottom: "1px solid #26332a",
            backdropFilter: "blur(12px)",
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-black text-white tracking-tight">
                🎱 بیلیارد ارم
              </h1>
              <p className="text-xs text-slate-400">سامانه مدیریت هوشمند</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-left">
                <div className="text-lg font-bold" style={{ color: "#e0b23a" }}>{currentTime}</div>
                <div className="text-xs text-slate-500">{currentDate}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {username && (
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-slate-300">{username}</span>
                    <span
                      className="badge"
                      style={
                        role === "admin"
                          ? { background: "#3a2a0c", color: "#e0b23a" }
                          : { background: "#26332a", color: "#8a9488" }
                      }
                    >
                      {role === "admin" ? "مدیر" : "کارمند"}
                    </span>
                  </div>
                )}
                <button
                  onClick={handleLogout}
                  className="text-slate-400 text-xs border border-slate-700 rounded-lg px-2 py-1"
                  title="خروج"
                >
                  🚪 خروج
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 pb-24">
          {activeTab === "tables" && <TablesSection />}
          {activeTab === "cafe" && <CafeSection />}
          {activeTab === "reservations" && <ReservationsSection />}
          {activeTab === "debtors" && <DebtorsSection />}
          {activeTab === "history" && <HistorySection />}
          {activeTab === "report" && <DailyReportSection />}
          {activeTab === "dashboard" && <DashboardSection />}
          {activeTab === "users" && <UsersSection />}
          {activeTab === "settings" && <SettingsSection />}
        </main>

        {/* Bottom Navigation */}
        <nav
          className="fixed bottom-0 left-0 right-0 z-50 px-1 py-1"
          style={{
            background: "linear-gradient(to top, #0a0d0b, #0a0d0bcc)",
            borderTop: "1px solid #26332a",
            backdropFilter: "blur(12px)",
            maxWidth: "480px",
            margin: "0 auto",
            paddingBottom: "env(safe-area-inset-bottom, 8px)",
          }}
        >
          <div className="flex justify-around">
            {primaryTabs.map((tab) => (
              <button
                key={tab.id}
                className={`nav-item flex-shrink-0 ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="text-xl">{tab.icon}</span>
                <span className="text-xs">{tab.label}</span>
              </button>
            ))}
            {role === "admin" && (
              <button
                className={`nav-item flex-shrink-0 ${isMoreActive ? "active" : ""}`}
                onClick={() => setMoreOpen(true)}
              >
                <span className="text-xl">{isMoreActive ? activeMoreTab?.icon : "☰"}</span>
                <span className="text-xs">{isMoreActive ? activeMoreTab?.label : "بیشتر"}</span>
              </button>
            )}
          </div>
        </nav>

        {/* More Sheet (admin only) */}
        <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="بخش‌های بیشتر">
          <div className="grid grid-cols-2 gap-3">
            {moreTabs.map((tab) => (
              <button
                key={tab.id}
                className={`btn ${activeTab === tab.id ? "btn-primary" : "btn-secondary"}`}
                style={{ flexDirection: "column", height: "72px", gap: "4px" }}
                onClick={() => {
                  setActiveTab(tab.id);
                  setMoreOpen(false);
                }}
              >
                <span className="text-2xl">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </Modal>
      </div>
    </ToastProvider>
  );
}
