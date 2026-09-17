import { useEffect, useState } from "react";
import { BarChart3, Flag, LayoutDashboard, ListChecks, LogOut, ReceiptText, Settings, Users } from "lucide-react";
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { createAppServices, type AppServices } from "./appServices.ts";
import { BudgetsPage } from "../ui/pages/BudgetsPage.tsx";
import { DashboardPage } from "../ui/pages/DashboardPage.tsx";
import { TransactionsPage } from "../ui/pages/TransactionsPage.tsx";
import { LoginPage } from "../ui/pages/LoginPage.tsx";
import { AuthProvider, useAuth } from "../ui/auth/AuthContext.tsx";
import { HouseholdProvider } from "../ui/household/HouseholdContext.tsx";

const navItems = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/transactions", label: "Transactions", icon: ReceiptText },
  { path: "/budgets", label: "Budgets", icon: ListChecks },
  { path: "/goals", label: "Goals", icon: Flag },
  { path: "/people", label: "People & Settlements", icon: Users },
  { path: "/reports", label: "Reports", icon: BarChart3 },
  { path: "/settings", label: "Settings", icon: Settings },
] as const;

const primaryMobileNavItems = navItems.slice(0, 3);

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={<AppShell />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

function AppShell() {
  const { user, loading: authLoading } = useAuth();
  const [services, setServices] = useState<AppServices | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  const location = useLocation();

  useEffect(() => {
    let mounted = true;

    // Only initialize services if user is authenticated
    if (!user) {
      if (mounted) {
        setServices(null);
      }
      return;
    }

    createAppServices(user)
      .then((created) => {
        if (mounted) {
          setServices(created);
        }
      })
      .catch((caught: unknown) => {
        console.error("Application initialization failed", caught);
        if (mounted) {
          setError(caught instanceof Error ? caught.message : "We could not open your budget data. Please refresh and try again.");
        }
      });

    return () => {
      mounted = false;
    };
  }, [user]);

  useEffect(() => {
    const updateConnectivity = () => setOffline(!navigator.onLine);
    window.addEventListener("online", updateConnectivity);
    window.addEventListener("offline", updateConnectivity);

    return () => {
      window.removeEventListener("online", updateConnectivity);
      window.removeEventListener("offline", updateConnectivity);
    };
  }, []);

  // Show login page if not authenticated
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f7f4]">
        <div className="text-stone-600">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const activeLabel = navItems.find((item) => location.pathname.startsWith(item.path))?.label ?? "Dashboard";

  if (error) {
    return <main className="min-h-screen p-6 text-red-900">{error}</main>;
  }

  if (!services) {
    return (
      <div className="min-h-screen bg-[#f6f7f4] text-stone-950">
        <div className="lg:pl-64">
          <header className="sticky top-0 z-10 border-b border-stone-200 bg-[#f6f7f4]/90 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur lg:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-stone-500">Trial MVP</p>
                <h2 className="text-2xl font-semibold">{activeLabel}</h2>
              </div>
              <div className="flex items-center gap-3">
                <MobileNav />
                <div className="hidden sm:block text-sm text-stone-600">
                  {user?.email}
                </div>
                <LogoutButton />
              </div>
            </div>
          </header>
          <main className="px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-6 lg:px-8 lg:pb-8">
            <div className="rounded-md border border-stone-200 bg-white p-5 text-stone-600">Loading your household data...</div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <HouseholdProvider name={services.householdName}>
      <AppContent user={user} services={services} offline={offline} />
    </HouseholdProvider>
  );
}

function AppContent({ user, services, offline }: { user: { email?: string }, services: AppServices, offline: boolean }) {
  const location = useLocation();
  const activeLabel = navItems.find((item) => location.pathname.startsWith(item.path))?.label ?? "Dashboard";
  return (
    <div className="min-h-screen bg-[#f6f7f4] text-stone-950">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-stone-200 bg-white/85 px-4 py-5 backdrop-blur lg:block">
        <div className="mb-7 px-2">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-800">Shared Ledger</p>
          <h1 className="mt-2 text-xl font-semibold">{services.householdName}</h1>
        </div>
        <nav className="space-y-1" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `focus-ring flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${
                    isActive ? "bg-emerald-900 text-white" : "text-stone-700 hover:bg-stone-100"
                  }`
                }
              >
                <Icon aria-hidden="true" size={18} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-stone-200 bg-[#f6f7f4]/90 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-stone-500">Trial MVP</p>
              <h2 className="text-2xl font-semibold">{activeLabel}</h2>
            </div>
            <div className="flex items-center gap-3">
              <MobileNav />
              <div className="hidden sm:block text-sm text-stone-600">
                {user?.email}
              </div>
              <LogoutButton />
            </div>
          </div>
          {offline ? (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Offline. Local data on this device remains available.
            </div>
          ) : null}
        </header>
        <main className="px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-6 lg:px-8 lg:pb-8">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage dashboardUseCases={services.dashboard} />} />
            <Route path="/transactions" element={<TransactionsPage transactionUseCases={services.transactions} />} />
            <Route path="/budgets" element={<BudgetsPage budgetUseCases={services.budgets} />} />
            <Route path="/goals" element={<Placeholder title="Goals" />} />
            <Route path="/people" element={<Placeholder title="People & Settlements" />} />
            <Route path="/reports" element={<Placeholder title="Reports" />} />
            <Route path="/settings" element={<Placeholder title="Settings" />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}

function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <select
      aria-label="Section"
      className="focus-ring rounded-md border border-stone-300 bg-white px-3 py-2 text-sm lg:hidden"
      value={navItems.find((item) => location.pathname.startsWith(item.path))?.path ?? "/dashboard"}
      onChange={(event) => {
        void navigate(event.target.value);
      }}
    >
      {navItems.map((item) => (
        <option key={item.path} value={item.path}>
          {item.label}
        </option>
      ))}
    </select>
  );
}

function MobileBottomNav() {
  return (
    <nav
      aria-label="Primary mobile navigation"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-3 gap-1">
        {primaryMobileNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `focus-ring flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                  isActive ? "bg-emerald-900 text-white" : "text-stone-700"
                }`
              }
            >
              <Icon aria-hidden="true" size={19} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <section className="rounded-md border border-stone-200 bg-white p-8">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-stone-600">Coming later.</p>
    </section>
  );
}

function LogoutButton() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    const { error } = await signOut();
    if (!error) {
      navigate("/login");
    }
    setLoading(false);
  };

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="flex items-center gap-2 text-stone-700 hover:text-stone-900 text-sm disabled:opacity-50"
      title="Sign out"
    >
      <LogOut size={16} />
    </button>
  );
}
