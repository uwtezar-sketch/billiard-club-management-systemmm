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
import CustomersSection from "@/components/CustomersSection";
import { todayJalaali } from "@/lib/jalaali";

type Tab = "tables" | "cafe" | "reservations" | "debtors" | "history" | "report" | "dashboard" | "settings" | "users" | "customers";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "tables", label: "میزها", icon: "🎱" },
  { id: "cafe", label: "کافه", icon: "☕" },
  { id: "reservations", label: "رزروها", icon: "📅" },
  { id: "debtors", label: "بدهکاران", icon: "📋" },
  { id: "history", label: "تاریخچه", icon: "📂" },
  { id: "report", label: "گزارش", icon: "📊" },
  { id: "dashboard", label: "داشبورد", icon: "📈" },
  { id: "customers", label: "باشگاه مشتریان", icon: "🎖️" },
  { id: "users", label: "کاربران", icon: "👤" },
  { id: "settings", label: "تنظیمات", icon: "⚙️" },
];

// این ۵ تا همیشه تو نوار پایین‌ان (هم برای مدیر هم کارمند)
const PRIMARY_TABS: Tab[] = ["tables", "cafe", "reservations", "debtors", "history"];
// این ۵ تا فقط برای مدیر، از پشت دکمه‌ی «بیشتر»
const MORE_TABS: Tab[] = ["report", "dashboard", "customers", "users", "settings"];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("tables");
  const [currentTime, setCurrentTime] = useState("");
  const [currentDate, setCurrentDate] = useState("");
  const [role, setRole] = useState<"admin" | "employee" | null>(null);
  const [username, setUsername] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [activeTablesCount, setActiveTablesCount] = useState(0);
  const [unpaidDebtorsCount, setUnpaidDebtorsCount] = useState(0);
  const [pendingInvoicesCount, setPendingInvoicesCount] = useState(0);
  
  useEffect(() => {
    async function fetchCounts() {
      try {
        const [tablesRes, debtorsRes, pendingRes] = await Promise.all([
          fetch("/api/tables"),
          fetch("/api/debtors"),
          fetch("/api/invoices?status=pending"),
        ]);
        const tablesData = await tablesRes.json();
        if (Array.isArray(tablesData)) {
          setActiveTablesCount(tablesData.filter((t: { isActive: boolean }) => t.isActive).length);
        }
        const debtorsData = await debtorsRes.json();
        if (Array.isArray(debtorsData)) {
          setUnpaidDebtorsCount(debtorsData.filter((d: { totalDebt: string }) => Number(d.totalDebt) > 0).length);
        }
        const pendingData = await pendingRes.json();
        if (Array.isArray(pendingData)) {
          setPendingInvoicesCount(pendingData.length);
        }
      } catch {
        // بی‌سروصدا نادیده گرفته میشه، این فقط یه نشونه‌ی کوچیکه
      }
    }
    fetchCounts();
    const interval = setInterval(fetchCounts, 20000);
    return () => clearInterval(interval);
  }, []);

useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status === 401) {
        const input = args[0];
        const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
        if (!url.includes("/api/auth/")) {
          window.location.href = "/login";
        }
      }
      return response;
    };
  }, []);
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
      <div
        className="min-h-screen flex flex-col mx-auto w-full max-w-[480px] md:max-w-[860px] md:border-x"
        style={{ borderColor: "#26332a" }}
      >
        {/* Sticky header + nav together */}
        <div className="sticky top-0 z-50">
          {/* Header */}
          <header
            className="px-4 py-3"
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

          {/* Top Navigation */}
          <nav
            className="px-1 py-1"
            style={{
              background: "linear-gradient(to bottom, #0a0d0b, #0a0d0bcc)",
              borderBottom: "1px solid #26332a",
              backdropFilter: "blur(12px)",
            }}
          >
            <div className="flex justify-around overflow-x-auto">
              {primaryTabs.map((tab) => {
                const badgeCount = tab.id === "tables" ? activeTablesCount : tab.id === "debtors" ? unpaidDebtorsCount : tab.id === "history" ? pendingInvoicesCount : 0;
                return (
                  <button
                    key={tab.id}
                    className={`nav-item flex-shrink-0 ${activeTab === tab.id ? "active" : ""}`}
                    onClick={() => setActiveTab(tab.id)}
                    style={{ position: "relative" }}
                  >
                    <span className="text-xl" style={{ position: "relative" }}>
                      {tab.icon}
                      {badgeCount > 0 && (
                        <span
                          style={{
                            position: "absolute",
                            top: "-6px",
                            left: "-10px",
                            background: tab.id === "tables" ? "#1a7a4c" : "#8f1d2c",
                            color: "#fff",
                            borderRadius: "9999px",
                            fontSize: "9px",
                            minWidth: "16px",
                            height: "16px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "0 3px",
                            fontWeight: "bold",
                          }}
                        >
                          {badgeCount.toLocaleString("fa-IR")}
                        </span>
                      )}
                    </span>
                    <span className="text-xs">{tab.label}</span>
                  </button>
                );
              })}
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
        </div>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4">
          {activeTab === "tables" && <TablesSection />}
          {activeTab === "cafe" && <CafeSection />}
          {activeTab === "reservations" && <ReservationsSection />}
          {activeTab === "debtors" && <DebtorsSection />}
          {activeTab === "history" && <HistorySection />}
          {activeTab === "report" && <DailyReportSection />}
          {activeTab === "dashboard" && <DashboardSection />}
          {activeTab === "customers" && <CustomersSection />}
          {activeTab === "users" && <UsersSection />}
          {activeTab === "settings" && <SettingsSection />}
        </main>

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
