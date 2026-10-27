import React from "react";
import { Link, useLocation } from "react-router-dom";
import { FileCheck, PlusCircle, Camera, LayoutDashboard, Sun, Moon } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

export const Navbar: React.FC = () => {
  const location = useLocation();
  const { theme, toggleTheme, setTheme } = useTheme();

  const navLinks = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/create-exam", label: "Create Exam", icon: PlusCircle },
    { to: "/scan", label: "Scan OMR", icon: Camera },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 transition-colors duration-200">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-all">
            <FileCheck className="w-6 h-6" />
          </div>
          <div>
            <span className="font-extrabold text-lg text-slate-900 dark:text-white tracking-tight leading-none block">
              OMR<span className="text-indigo-600 dark:text-indigo-400">Evaluator</span>
            </span>
            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-widest block mt-0.5">
              Automated Evaluation
            </span>
          </div>
        </Link>

        {/* Navigation & Theme Toggle */}
        <div className="flex items-center gap-1 sm:gap-2">
          <nav className="flex items-center gap-1 sm:gap-1.5 mr-1 sm:mr-2">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                    isActive
                      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 shadow-sm"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-slate-400"}`} />
                  <span className="hidden sm:inline">{link.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Segmented Light / Dark Mode Toggle */}
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-inner">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                theme === "light"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
              title="Switch to Light Mode"
              aria-label="Light Mode"
            >
              <Sun className={`w-3.5 h-3.5 ${theme === "light" ? "text-amber-500 fill-amber-500/20" : "text-slate-400"}`} />
              <span>Light</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                theme === "dark"
                  ? "bg-slate-900 text-white shadow-sm border border-slate-700/80"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
              title="Switch to Dark Mode"
              aria-label="Dark Mode"
            >
              <Moon className={`w-3.5 h-3.5 ${theme === "dark" ? "text-indigo-400 fill-indigo-400/20" : "text-slate-400"}`} />
              <span>Dark</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
