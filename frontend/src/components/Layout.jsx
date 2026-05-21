import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LayoutDashboard, FileText, BarChart3, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/lib/constants";

const LOGO_URL = "/MAHELogo.webp";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, test: "nav-dashboard" },
  { to: "/invoices", label: "Invoices", icon: FileText, test: "nav-invoices" },
  { to: "/analytics", label: "Analytics", icon: BarChart3, test: "nav-analytics" },
];

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex bg-[#F8F9FA]">
      <aside className="hidden md:flex md:w-[240px] border-r border-[#E5E7EB] bg-white flex-col" data-testid="sidebar">
        <div className="px-6 py-5 border-b border-[#E5E7EB]">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-[#09090B] flex items-center justify-center flex-shrink-0 overflow-hidden">
              <img src={LOGO_URL} alt="MTMC" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <div className="font-display font-black text-lg leading-none tracking-tight">InvoiceFlow</div>
              <div className="text-[9px] tracking-[0.18em] uppercase text-[#7A1A2C] mt-1 font-semibold">MTMC · Stores</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-4">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = loc.pathname === item.to || (item.to !== "/" && loc.pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                data-testid={item.test}
                className={`flex items-center gap-3 px-6 py-3 text-sm border-l-2 transition-colors ${
                  active
                    ? "border-[#7A1A2C] bg-[#FBEAEC] text-[#09090B] font-semibold"
                    : "border-transparent text-[#52525B] hover:text-[#09090B] hover:bg-[#F8F9FA]"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-6 py-4 border-t border-[#E5E7EB]">
          <div className="text-xs text-[#52525B] mb-1">Signed in as</div>
          <div className="font-semibold text-sm truncate" data-testid="user-name">{user?.name}</div>
          <div className="text-xs text-[#52525B] mb-3">{ROLE_LABELS[user?.role] || user?.role}</div>
          <Button
            variant="outline"
            size="sm"
            className="w-full rounded-none border-[#09090B] text-[#09090B] hover:bg-[#09090B] hover:text-white"
            onClick={handleLogout}
            data-testid="logout-button"
          >
            <LogOut className="w-3.5 h-3.5 mr-2" /> Logout
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-x-hidden">
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-[#E5E7EB] bg-white">
          <div className="font-display font-black text-lg tracking-tight">
            InvoiceFlow
          </div>
        </div>

        <main className="flex-1 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
