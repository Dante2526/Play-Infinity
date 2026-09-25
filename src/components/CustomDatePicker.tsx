import React, { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";

interface CustomDatePickerProps {
  value: string; // ISO format: YYYY-MM-DD
  onChange: (date: string) => void;
  label?: string;
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const WEEK_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function CustomDatePicker({ value, onChange, label }: CustomDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date(value + "T12:00:00"));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOpen = () => {
    if (!isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      // Se tiver menos de 300px embaixo e mais espaço em cima, abre pra cima
      if (spaceBelow < 300 && rect.top > 300) {
        setOpenUpward(true);
      } else {
        setOpenUpward(false);
      }
    }
    setIsOpen(!isOpen);
  };

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newDate = new Date(currentMonth);
    newDate.setMonth(newDate.getMonth() - 1);
    setCurrentMonth(newDate);
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newDate = new Date(currentMonth);
    newDate.setMonth(newDate.getMonth() + 1);
    setCurrentMonth(newDate);
  };

  const handleSelectDate = (day: number) => {
    const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const yyyy = newDate.getFullYear();
    const mm = String(newDate.getMonth() + 1).padStart(2, '0');
    const dd = String(newDate.getDate()).padStart(2, '0');
    onChange(`${yyyy}-${mm}-${dd}`);
    setIsOpen(false);
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const days = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(<div key={`empty-${i}`} className="w-7 h-7 sm:w-8 sm:h-8"></div>);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isSelected = dateStr === value;
    const isToday = dateStr === new Date().toISOString().split("T")[0];

    days.push(
      <button
        key={d}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          handleSelectDate(d);
        }}
        className={`w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full text-xs font-semibold transition-all ${
          isSelected 
            ? 'bg-orange-500 text-white shadow-md shadow-orange-500/40 font-bold scale-105' 
            : isToday 
              ? 'bg-white/10 text-orange-400 font-bold border border-orange-500/30'
              : 'text-neutral-300 hover:bg-white/10 hover:text-white'
        }`}
      >
        {d}
      </button>
    );
  }

  // Formatting selected value for display
  const displayDate = new Date(value + "T12:00:00").toLocaleDateString('pt-BR');

  return (
    <div className="relative w-full" ref={containerRef}>
      {label && (
        <label className="block text-white/60 text-[10px] sm:text-xs font-bold mb-1 uppercase tracking-wider ml-1">
          {label}
        </label>
      )}
      
      <button
        type="button"
        onClick={toggleOpen}
        className="w-full bg-white/5 hover:bg-white/10 focus:bg-white/10 border border-white/10 py-2 sm:py-2.5 px-3.5 text-white focus:outline-none focus:ring-1 focus:ring-orange-500 transition-all font-medium text-xs sm:text-sm rounded-xl sm:rounded-[20px] flex items-center justify-between"
      >
        <span>{displayDate}</span>
        <CalendarIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-500 shrink-0" />
      </button>

      {isOpen && (
        <div 
          className={`absolute left-0 ${
            openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } p-3 bg-[#18181b] border border-white/15 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.9)] z-50 w-full min-w-[260px] max-w-[310px] animate-fade-in backdrop-blur-xl`}
        >
          <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-white/5">
            <button 
              type="button"
              onClick={handlePrevMonth}
              className="p-1 bg-white/5 hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <div className="text-white font-bold text-xs sm:text-sm">
              {MONTH_NAMES[month]} {year}
            </div>
            <button 
              type="button"
              onClick={handleNextMonth}
              className="p-1 bg-white/5 hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          
          <div className="grid grid-cols-7 gap-1 mb-1.5">
            {WEEK_DAYS.map(day => (
              <div key={day} className="text-center text-[9px] font-bold text-white/40 uppercase tracking-wider">
                {day}
              </div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 gap-1 place-items-center">
            {days}
          </div>
        </div>
      )}
    </div>
  );
}
