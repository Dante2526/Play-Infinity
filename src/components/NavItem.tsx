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
      className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-full transition-all cursor-pointer select-none ${
        isActive 
          ? 'text-orange-500 font-bold scale-105' 
          : 'text-neutral-400 hover:text-white'
      }`}
    >
      <div className={`p-1.5 rounded-full transition-colors ${isActive ? 'bg-orange-500/20' : ''}`}>
        {React.cloneElement(icon as React.ReactElement, {
          className: `w-4 h-4 sm:w-5 sm:h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-[2]'}`
        })}
      </div>
      <span className="text-[10px] sm:text-[11px] mt-0.5 tracking-tight">{label}</span>
    </button>
  );
}
