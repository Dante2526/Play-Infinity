import React from "react";

export function NavItem({ 
  onClick, 
  icon, 
  label, 
  isActive 
}: { 
  onClick: () => void; 
  icon: React.ReactNode; 
  label: string; 
  isActive: boolean; 
}) {
  return (
    <button
      onClick={onClick}
      data-active-nav={isActive ? 'true' : undefined}
      data-tv-focusable="true"
      className={`relative flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-full transition-all duration-200 cursor-pointer select-none active:scale-95 ${
        isActive 
          ? 'text-red-500 font-bold' 
          : 'text-white/60 hover:text-white'
      }`}
    >
      <div className={`p-1.5 rounded-full transition-all duration-200 ${
        isActive 
          ? 'bg-red-500/20 text-red-500 shadow-[0_0_12px_rgba(239,68,68,0.35)] scale-105' 
          : 'text-white/70 hover:text-white'
      }`}>
        {React.cloneElement(icon as React.ReactElement, {
          className: `w-4 h-4 sm:w-5 sm:h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-[2]'}`
        })}
      </div>
      <span className={`text-[10px] sm:text-[11px] mt-0.5 tracking-tight transition-colors ${
        isActive ? 'font-bold text-red-500' : 'font-medium text-white/60'
      }`}>
        {label}
      </span>
    </button>
  );
}
