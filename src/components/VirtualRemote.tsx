import React, { useState, useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Circle, Tv, X } from 'lucide-react';

export function VirtualRemote({ isHidden }: { isHidden?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number }>({ startX: 0, startY: 0, posX: 0, posY: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const currentFocusedRef = useRef<HTMLElement | null>(null);

  // Oculta automaticamente se estiver em tela cheia ou se algum player (ao vivo ou VOD) estiver aberto
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement);
  const [isPlayerActive, setIsPlayerActive] = useState(() => {
    return typeof document !== 'undefined' && (
      document.body.classList.contains('live-player-open') ||
      document.body.classList.contains('player-open') ||
      !!document.querySelector('[data-live-player="true"], .live-player-modal')
    );
  });

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      ));
    };

    const handlePlayerState = (e: any) => {
      if (typeof e.detail?.isOpen === 'boolean') {
        setIsPlayerActive(e.detail.isOpen);
      }
    };

    window.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    window.addEventListener('mozfullscreenchange', handleFullscreenChange);
    window.addEventListener('MSFullscreenChange', handleFullscreenChange);
    window.addEventListener('playinfinity:player_state', handlePlayerState);

    const observer = new MutationObserver(() => {
      const active = document.body.classList.contains('live-player-open') ||
                     document.body.classList.contains('player-open') ||
                     !!document.querySelector('[data-live-player="true"], .live-player-modal');
      setIsPlayerActive(active);
    });
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });

    return () => {
      window.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      window.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      window.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      window.removeEventListener('playinfinity:player_state', handlePlayerState);
      observer.disconnect();
    };
  }, []);

  // Ativa a classe de Smart TV no body enquanto o controle estiver aberto
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('is-smart-tv');
    }
  }, [isOpen]);

  // Sincroniza interação do mouse para que nunca existam dois focos na tela
  useEffect(() => {
    if (!isOpen) {
      // Se fechar, garante que remove o foco atual
      document.querySelectorAll('[data-tv-focused="true"]').forEach(prev => {
        prev.removeAttribute('data-tv-focused');
        prev.classList.remove('tv-focused');
      });
      return;
    }

    const handleDocumentPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Ignora interações nos botões do próprio controle remoto
      if (target.closest('.virtual-remote-container') || target.closest('.virtual-remote-btn')) {
        return;
      }

      // Remove qualquer foco do controle remoto anterior
      document.querySelectorAll('[data-tv-focused="true"]').forEach(prev => {
        prev.removeAttribute('data-tv-focused');
        prev.classList.remove('tv-focused');
      });

      // Se o usuário clicou em um elemento interativo na página, atualiza a referência
      const interactiveClicked = target.closest<HTMLElement>(
        'button:not(.virtual-remote-btn), a[href], [tabindex="0"], [role="button"]:not(.virtual-remote-btn), input, select'
      );

      if (interactiveClicked && !interactiveClicked.closest('.virtual-remote-container')) {
        currentFocusedRef.current = interactiveClicked;
        interactiveClicked.setAttribute('data-tv-focused', 'true');
        interactiveClicked.classList.add('tv-focused');
      } else {
        currentFocusedRef.current = null;
      }
    };

    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    };
  }, [isOpen]);

  // Arrastar o controle remoto pela tela
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;
      const newX = Math.max(10, Math.min(window.innerWidth - 220, dragStartRef.current.posX + dx));
      const newY = Math.max(10, Math.min(window.innerHeight - 280, dragStartRef.current.posY + dy));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging || !e.touches[0]) return;
      const dx = e.touches[0].clientX - dragStartRef.current.startX;
      const dy = e.touches[0].clientY - dragStartRef.current.startY;
      const newX = Math.max(10, Math.min(window.innerWidth - 220, dragStartRef.current.posX + dx));
      const newY = Math.max(10, Math.min(window.innerHeight - 280, dragStartRef.current.posY + dy));
      setPosition({ x: newX, y: newY });
    };

    const handleTouchEnd = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging]);

  const onDragStart = (clientX: number, clientY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    dragStartRef.current = {
      startX: clientX,
      startY: clientY,
      posX: position ? position.x : rect.left,
      posY: position ? position.y : rect.top,
    };
    if (!position) {
      setPosition({ x: rect.left, y: rect.top });
    }
    setIsDragging(true);
  };

  const setElementFocused = (el: HTMLElement | null) => {
    // Remove highlight anterior
    document.querySelectorAll('[data-tv-focused="true"]').forEach(prev => {
      prev.removeAttribute('data-tv-focused');
      prev.classList.remove('tv-focused');
    });

    if (el) {
      currentFocusedRef.current = el;
      el.setAttribute('data-tv-focused', 'true');
      el.classList.add('tv-focused');
      el.focus({ preventScroll: true });

      // Se o elemento estiver no cabeçalho ou bem próximo ao topo, rola para o topo absoluto
      if (el.closest('header') || el.closest('nav') || el.getBoundingClientRect().top <= 120) {
        if (el.closest('header')) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
      }

      // Cálculo de rolagem respeitando o cabeçalho fixo superior (~90px)
      const rect = el.getBoundingClientRect();
      const topOffset = 110;
      const bottomOffset = 100;

      if (rect.top < topOffset) {
        const targetScrollY = Math.max(0, window.scrollY + rect.top - topOffset);
        window.scrollTo({ top: targetScrollY, behavior: 'smooth' });
      } else if (rect.bottom > window.innerHeight - bottomOffset) {
        const targetScrollY = window.scrollY + (rect.bottom - window.innerHeight) + bottomOffset;
        window.scrollTo({ top: targetScrollY, behavior: 'smooth' });
      } else {
        el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      }
    }
  };

  const getFocusableElements = (): HTMLElement[] => {
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        'button:not(.virtual-remote-btn), a[href], [tabindex="0"], [role="button"]:not(.virtual-remote-btn), input, select'
      )
    ).filter(el => {
      if (el.closest('.virtual-remote-container')) return false;
      if (el.getAttribute('tabindex') === '-1' || el.getAttribute('aria-hidden') === 'true') return false;
      if (el.getAttribute('data-no-tv-focus') === 'true' || el.closest('[data-no-tv-focus="true"]')) return false;
      
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      
      const rect = el.getBoundingClientRect();
      // Ignora elementos invisíveis ou minúsculos (como bolinhas de carrossel de 2px)
      return rect.width >= 24 && rect.height >= 24;
    });
  };

  const focusInitialElement = () => {
    document.body.classList.add('is-smart-tv');

    // 1. Procura pela aba/botão de navegação atualmente ativa (ex: Séries, TV Ao Vivo, Calendário, Filmes, Início)
    const activeNavButton = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-active-nav="true"], header nav button.bg-orange-600\\/20, [data-tv-active="true"]'
      )
    ).find(el => {
      if (el.closest('.virtual-remote-container')) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0;
    });

    if (activeNavButton) {
      setElementFocused(activeNavButton);
      return;
    }

    // 2. Se não encontrou o botão de navegação ativo, foca no primeiro elemento focável visível na tela
    const focusable = getFocusableElements();
    if (focusable.length > 0) {
      const firstInView = focusable.find(el => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= window.innerHeight;
      }) || focusable[0];
      setElementFocused(firstInView);
    }
  };

  const triggerNavigation = (direction: 'up' | 'down' | 'left' | 'right' | 'enter' | 'back') => {
    document.body.classList.add('is-smart-tv');

    if (direction === 'back') {
      window.history.back();
      return;
    }

    // Ação de Clique / Confirmação
    if (direction === 'enter') {
      const active = currentFocusedRef.current || (document.activeElement as HTMLElement);
      if (active && !active.closest('.virtual-remote-container')) {
        active.click();
      }
      return;
    }

    // Busca todos os elementos navegáveis na tela (excluindo o controle remoto)
    const focusable = getFocusableElements();
    if (focusable.length === 0) return;

    let current = currentFocusedRef.current;
    if (!current || !document.contains(current) || current.closest('.virtual-remote-container')) {
      focusInitialElement();
      return;
    }

    const currentRect = current.getBoundingClientRect();
    const currentCenterX = currentRect.left + currentRect.width / 2;
    const currentCenterY = currentRect.top + currentRect.height / 2;

    let bestCandidate: HTMLElement | null = null;

    if (direction === 'down') {
      // Elementos estritamente abaixo do elemento atual
      const downCandidates = focusable
        .filter(el => el !== current)
        .map(el => {
          const rect = el.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          return { el, rect, centerX, centerY, top: rect.top, centerDy: centerY - currentCenterY };
        })
        .filter(item => item.centerDy > 15 || item.top > currentRect.bottom - 5)
        .sort((a, b) => a.top - b.top);

      if (downCandidates.length > 0) {
        // Pega o primeiro elemento (o topo mais próximo)
        const firstTop = downCandidates[0].top;
        // Agrupa estritamente todos os elementos que pertencem à MESMA linha/faixa do topo mais próximo
        const nextRow = downCandidates
          .filter(c => Math.abs(c.top - firstTop) <= 40)
          .sort((a, b) => a.rect.left - b.rect.left);

        // Se houver um botão prioritário na linha (como 'Assistir Filme/Série'), foca nele primeiro
        const primaryCandidate = nextRow.find(c => c.el.getAttribute('data-tv-primary') === 'true');
        if (primaryCandidate) {
          bestCandidate = primaryCandidate.el;
        } else {
          // Sempre entra pelo primeiro item (mais à esquerda) da nova fileira
          bestCandidate = nextRow[0].el;
        }
      }
    } else if (direction === 'up') {
      // Elementos estritamente acima do elemento atual
      const upCandidates = focusable
        .filter(el => el !== current)
        .map(el => {
          const rect = el.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          return { el, rect, centerX, centerY, bottom: rect.bottom, centerDy: currentCenterY - centerY };
        })
        .filter(item => item.centerDy > 15 || item.bottom < currentRect.top + 5)
        .sort((a, b) => b.bottom - a.bottom);

      if (upCandidates.length > 0) {
        // Pega o elemento com fundo mais próximo acima
        const firstBottom = upCandidates[0].bottom;
        // Agrupa todos da mesma linha mais próxima acima
        const prevRow = upCandidates
          .filter(c => Math.abs(c.bottom - firstBottom) <= 40)
          .sort((a, b) => a.rect.left - b.rect.left);

        const primaryCandidate = prevRow.find(c => c.el.getAttribute('data-tv-primary') === 'true');
        if (primaryCandidate) {
          bestCandidate = primaryCandidate.el;
        } else {
          // Sempre entra pelo primeiro item (mais à esquerda) da fileira acima
          bestCandidate = prevRow[0].el;
        }
      }
    } else if (direction === 'right') {
      // Se estamos dentro de um container com outros botões/links (ex: cartão do calendário ou header)
      const currentContainer = current.closest('[role="region"], .release-card, [tabindex="0"]');
      if (currentContainer && currentContainer !== current) {
        const queryElements = Array.from(
          currentContainer.querySelectorAll('button:not(.virtual-remote-btn), a[href], [tabindex="0"]')
        ) as HTMLElement[];
        const siblings = queryElements.filter(el => focusable.includes(el));
        const currentIndex = siblings.indexOf(current);
        if (currentIndex !== -1 && currentIndex < siblings.length - 1) {
          bestCandidate = siblings[currentIndex + 1];
        }
      }

      if (!bestCandidate) {
        // Elementos à direita na mesma linha/nível
        const rightCandidates = focusable
          .filter(el => el !== current)
          .map(el => {
            const rect = el.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const dx = centerX - currentCenterX;
            const dy = Math.abs(centerY - currentCenterY);
            return { el, rect, centerX, centerY, dx, dy };
          })
          .filter(item => item.dx > 5);

        // Prioriza mesma linha (dy pequeno)
        const sameRowCandidates = rightCandidates.filter(c => c.dy <= Math.max(currentRect.height, c.rect.height) * 1.6 + 30);
        const pool = sameRowCandidates.length > 0 ? sameRowCandidates : rightCandidates;

        let minScore = Infinity;
        pool.forEach(c => {
          const score = c.dx + c.dy * 3;
          if (score < minScore) {
            minScore = score;
            bestCandidate = c.el;
          }
        });
      }
    } else if (direction === 'left') {
      // Se estamos dentro de um container com outros botões/links (ex: cartão do calendário ou header)
      const currentContainer = current.closest('[role="region"], .release-card, [tabindex="0"]');
      if (currentContainer && currentContainer !== current) {
        const queryElements = Array.from(
          currentContainer.querySelectorAll('button:not(.virtual-remote-btn), a[href], [tabindex="0"]')
        ) as HTMLElement[];
        const siblings = queryElements.filter(el => focusable.includes(el));
        const currentIndex = siblings.indexOf(current);
        if (currentIndex > 0) {
          bestCandidate = siblings[currentIndex - 1];
        }
      }

      if (!bestCandidate) {
        // Elementos à esquerda na mesma linha/nível
        const leftCandidates = focusable
          .filter(el => el !== current)
          .map(el => {
            const rect = el.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const dx = currentCenterX - centerX;
            const dy = Math.abs(centerY - currentCenterY);
            return { el, rect, centerX, centerY, dx, dy };
          })
          .filter(item => item.dx > 5);

        // Prioriza mesma linha (dy pequeno)
        const sameRowCandidates = leftCandidates.filter(c => c.dy <= Math.max(currentRect.height, c.rect.height) * 1.6 + 30);
        const pool = sameRowCandidates.length > 0 ? sameRowCandidates : leftCandidates;

        let minScore = Infinity;
        pool.forEach(c => {
          const score = c.dx + c.dy * 3;
          if (score < minScore) {
            minScore = score;
            bestCandidate = c.el;
          }
        });
      }
    }

    if (bestCandidate) {
      setElementFocused(bestCandidate);
    } else if (direction === 'up') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Suporte aos botões do teclado físico também quando o controle estiver aberto
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        triggerNavigation('up');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        triggerNavigation('down');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        triggerNavigation('left');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        triggerNavigation('right');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        triggerNavigation('enter');
      } else if (e.key === 'Escape' || e.key === 'Backspace') {
        triggerNavigation('back');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (isHidden || isFullscreen || isPlayerActive) return null;

  if (!isOpen) {
    return (
      <button 
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          setIsOpen(true);
          setTimeout(() => focusInitialElement(), 50);
        }}
        className="virtual-remote-btn fixed bottom-32 sm:bottom-24 right-4 z-[9999] bg-gradient-to-r from-orange-600 to-amber-600 text-white p-3 sm:px-4 sm:py-2.5 rounded-full shadow-[0_0_25px_rgba(234,88,12,0.6)] hidden md:flex items-center gap-2 hover:scale-105 active:scale-95 transition-all border border-orange-400/60 cursor-pointer"
        title="Abrir Controle Remoto da TV para teste"
      >
        <Tv className="w-5 h-5 animate-pulse" />
        <span className="font-bold text-xs uppercase tracking-wider hidden sm:inline">Controle Smart TV</span>
      </button>
    );
  }

  return (
    <div 
      ref={containerRef}
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      style={
        position
          ? { left: `${position.x}px`, top: `${position.y}px`, bottom: 'auto', right: 'auto' }
          : undefined
      }
      className={`virtual-remote-container hidden md:flex fixed ${
        !position ? 'bottom-28 sm:bottom-20 right-4' : ''
      } z-[9999] bg-[#141414]/95 border-2 border-orange-500/80 rounded-3xl p-4 shadow-[0_10px_40px_rgba(0,0,0,0.9),0_0_30px_rgba(234,88,12,0.4)] flex-col items-center gap-2.5 backdrop-blur-2xl select-none transition-shadow ${
        isDragging ? 'cursor-grabbing shadow-[0_0_45px_rgba(234,88,12,0.7)] scale-[1.02]' : ''
      }`}
    >
      <div 
        onMouseDown={(e) => onDragStart(e.clientX, e.clientY)}
        onTouchStart={(e) => {
          if (e.touches[0]) {
            onDragStart(e.touches[0].clientX, e.touches[0].clientY);
          }
        }}
        className="flex justify-between items-center w-full px-1 border-b border-white/10 pb-2 cursor-grab active:cursor-grabbing rounded-t-xl"
        title="Arraste para mover o controle remoto para qualquer lugar da tela"
      >
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-orange-500 animate-ping"></span>
          <span className="text-[11px] font-black text-orange-500 uppercase tracking-widest">Controle Remoto</span>
        </div>
        <button 
          tabIndex={-1}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(false);
            document.querySelectorAll('[data-tv-focused="true"]').forEach(prev => {
              prev.removeAttribute('data-tv-focused');
              prev.classList.remove('tv-focused');
            });
          }} 
          className="virtual-remote-btn text-neutral-400 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors cursor-pointer"
          title="Fechar Controle"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* D-Pad Direcional */}
      <div className="flex flex-col items-center gap-1.5 my-1">
        {/* Cima */}
        <button 
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => triggerNavigation('up')} 
          className="virtual-remote-btn relative overflow-hidden group p-3.5 bg-neutral-800 hover:bg-neutral-750 active:bg-orange-600 rounded-2xl transition-all shadow-md active:scale-90 cursor-pointer border border-white/10 hover:border-white/50 select-none"
        >
          {/* Animação de líquido 100% branco sólido e opaco enchendo até 80% */}
          <div className="absolute inset-x-0 bottom-0 h-0 group-hover:h-[80%] bg-white opacity-100 shadow-[0_-2px_12px_rgba(255,255,255,0.9)] transition-all duration-300 ease-out pointer-events-none rounded-b-2xl" />
          <div className="relative z-10 flex items-center justify-center transition-all duration-300 group-hover:scale-110">
            <ChevronUp className="w-6 h-6 text-white group-hover:text-black transition-colors duration-300 stroke-[2.5]" />
          </div>
        </button>
        
        <div className="flex items-center gap-2">
          {/* Esquerda */}
          <button 
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => triggerNavigation('left')} 
            className="virtual-remote-btn relative overflow-hidden group p-3.5 bg-neutral-800 hover:bg-neutral-750 active:bg-orange-600 rounded-2xl transition-all shadow-md active:scale-90 cursor-pointer border border-white/10 hover:border-white/50 select-none"
          >
            {/* Animação de líquido 100% branco sólido e opaco enchendo até 80% */}
            <div className="absolute inset-x-0 bottom-0 h-0 group-hover:h-[80%] bg-white opacity-100 shadow-[0_-2px_12px_rgba(255,255,255,0.9)] transition-all duration-300 ease-out pointer-events-none rounded-b-2xl" />
            <div className="relative z-10 flex items-center justify-center transition-all duration-300 group-hover:scale-110">
              <ChevronLeft className="w-6 h-6 text-white group-hover:text-black transition-colors duration-300 stroke-[2.5]" />
            </div>
          </button>
          
          {/* OK / Centro */}
          <button 
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => triggerNavigation('enter')} 
            className="virtual-remote-btn relative overflow-hidden group p-4 bg-orange-600 hover:bg-orange-500 active:bg-orange-400 rounded-2xl transition-all shadow-[0_0_15px_rgba(234,88,12,0.6)] active:scale-90 cursor-pointer border-2 border-white/30 select-none"
          >
            {/* Animação de líquido 100% branco sólido e opaco enchendo até 80% */}
            <div className="absolute inset-x-0 bottom-0 h-0 group-hover:h-[80%] bg-white opacity-100 shadow-[0_-2px_12px_rgba(255,255,255,0.9)] transition-all duration-300 ease-out pointer-events-none rounded-b-2xl" />
            <div className="relative z-10 flex items-center justify-center transition-all duration-300 group-hover:scale-110">
              <Circle className="w-5 h-5 text-white fill-white group-hover:text-orange-600 group-hover:fill-orange-600 transition-colors duration-300" />
            </div>
          </button>
          
          {/* Direita */}
          <button 
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => triggerNavigation('right')} 
            className="virtual-remote-btn relative overflow-hidden group p-3.5 bg-neutral-800 hover:bg-neutral-750 active:bg-orange-600 rounded-2xl transition-all shadow-md active:scale-90 cursor-pointer border border-white/10 hover:border-white/50 select-none"
          >
            {/* Animação de líquido 100% branco sólido e opaco enchendo até 80% */}
            <div className="absolute inset-x-0 bottom-0 h-0 group-hover:h-[80%] bg-white opacity-100 shadow-[0_-2px_12px_rgba(255,255,255,0.9)] transition-all duration-300 ease-out pointer-events-none rounded-b-2xl" />
            <div className="relative z-10 flex items-center justify-center transition-all duration-300 group-hover:scale-110">
              <ChevronRight className="w-6 h-6 text-white group-hover:text-black transition-colors duration-300 stroke-[2.5]" />
            </div>
          </button>
        </div>
        
        {/* Baixo */}
        <button 
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => triggerNavigation('down')} 
          className="virtual-remote-btn relative overflow-hidden group p-3.5 bg-neutral-800 hover:bg-neutral-750 active:bg-orange-600 rounded-2xl transition-all shadow-md active:scale-90 cursor-pointer border border-white/10 hover:border-white/50 select-none"
        >
          {/* Animação de líquido 100% branco sólido e opaco enchendo até 80% */}
          <div className="absolute inset-x-0 bottom-0 h-0 group-hover:h-[80%] bg-white opacity-100 shadow-[0_-2px_12px_rgba(255,255,255,0.9)] transition-all duration-300 ease-out pointer-events-none rounded-b-2xl" />
          <div className="relative z-10 flex items-center justify-center transition-all duration-300 group-hover:scale-110">
            <ChevronDown className="w-6 h-6 text-white group-hover:text-black transition-colors duration-300 stroke-[2.5]" />
          </div>
        </button>
      </div>
    </div>
  );
}

