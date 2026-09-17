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
    // Format to YYYY-MM-DD
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
    days.push(<div key={`empty-${i}`} className="w-8 h-8"></div>);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isSelected = dateStr === value;
    const isToday = dateStr === new Date().toISOString().split("T")[0];

    days.push(
      <button
        key={d}
        onClick={(e) => {
          e.preventDefault();
          handleSelectDate(d);
        }}
        className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium transition-colors ${
          isSelected 
            ? 'bg-orange-500 text-white shadow-md' 
            : isToday 
              ? 'bg-white/10 text-orange-400 font-bold'
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
      {label && <label className="block text-white/60 text-xs font-bold mb-2 uppercase tracking-wider ml-2">{label}</label>}
      
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white/5 hover:bg-white/10 focus:bg-white/10 border-0 py-3.5 px-5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium text-[15px] rounded-[22px] flex items-center justify-between"
      >
        <span>{displayDate}</span>
        <CalendarIcon className="w-4 h-4 text-orange-500" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 p-4 bg-[#1c1c1e] border border-white/10 rounded-[24px] shadow-[0_10px_40px_rgba(0,0,0,0.8)] z-50 w-full min-w-[280px] animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <button 
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 bg-white/5 hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-white font-bold text-sm">
              {MONTH_NAMES[month]} {year}
            </div>
            <button 
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 bg-white/5 hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          
          <div className="grid grid-cols-7 gap-1 mb-2">
            {WEEK_DAYS.map(day => (
              <div key={day} className="text-center text-[10px] font-bold text-white/40 uppercase tracking-wider">
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
