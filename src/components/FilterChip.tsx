import React from "react";

export function FilterChip({ 
  label, 
  active, 
  onClick, 
  tabIndex = 0,
  role = "button"
}: { 
  label: string; 
  active: boolean; 
  onClick: () => void; 
  tabIndex?: number;
  role?: string;
  key?: any; 
}) {
  return (
    <button
      tabIndex={tabIndex}
      role={role}
      onClick={onClick}
      data-tv-focusable="true"
      className={`px-3 py-1.5 md:px-4 md:py-2 rounded-lg md:rounded-xl whitespace-nowrap text-xs md:text-sm font-medium transition-all shrink-0 border select-none active:scale-95 cursor-pointer
        ${active 
          ? 'bg-orange-500 text-white border-orange-500 shadow-[0_0_12px_rgba(234,88,12,0.35)] font-semibold' 
          : 'bg-[#141414] text-neutral-300 border-neutral-800 hover:bg-neutral-800 hover:text-white hover:border-neutral-700'}`}
    >
      {label}
    </button>
  );
}
