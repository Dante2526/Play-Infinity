import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Hook global de navegação para Smart TV e controles remotos físicos.
 * Compatível com Samsung Tizen, LG webOS, Android TV, Fire TV Stick, Roku e navegadores TV.
 */
export function useSmartTV() {
  const [isSmartTV, setIsSmartTV] = useState(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent.toLowerCase();
    return (
      /smarttv|tizen|webos|bravia|android tv|aftt|afts|aftm|aftb|vidaa|hisense|philips|panasonic|roku|crkey|googletv|appletv|boxee|kylo|netcast|viera|dtv/i.test(ua) ||
      navigator.platform.toLowerCase().includes('tv') ||
      (typeof screen !== 'undefined' && screen.width >= 1280 && screen.height >= 720 && !('ontouchstart' in window))
    );
  });

  const currentFocusedRef = useRef<HTMLElement | null>(null);

  const getFocusableElements = useCallback((): HTMLElement[] => {
    if (typeof document === 'undefined') return [];
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        'button:not(.virtual-remote-btn), a[href], [tabindex="0"], [role="button"]:not(.virtual-remote-btn), [data-tv-focusable="true"], input:not([type="hidden"]), select'
      )
    ).filter(el => {
      if (el.closest('.virtual-remote-container')) return false;
      if (el.getAttribute('tabindex') === '-1' || el.getAttribute('aria-hidden') === 'true') return false;
      if (el.getAttribute('data-no-tv-focus') === 'true' || el.closest('[data-no-tv-focus="true"]')) return false;
      if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return false;

      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

      const rect = el.getBoundingClientRect();
      return rect.width >= 16 && rect.height >= 16;
    });
  }, []);

  const setElementFocused = useCallback((el: HTMLElement | null) => {
    if (!el) return;

    // Remove foco dos anteriores
    document.querySelectorAll('[data-tv-focused="true"], .tv-focused').forEach(prev => {
      prev.removeAttribute('data-tv-focused');
      prev.classList.remove('tv-focused');
    });

    currentFocusedRef.current = el;
    el.setAttribute('data-tv-focused', 'true');
    el.classList.add('tv-focused');

    try {
      el.focus({ preventScroll: true });
    } catch (e) {
      el.focus();
    }

    // Rolagem inteligente horizontal e vertical
    const rect = el.getBoundingClientRect();
    const topOffset = 100;
    const bottomOffset = 110;

    // Se estiver em carrossel horizontal, centraliza no container da linha
    const scrollContainer = el.closest('.overflow-x-auto, [data-horizontal-scroll="true"], .group\\/row');
    if (scrollContainer && scrollContainer !== el) {
      const cardRect = el.getBoundingClientRect();
      const contRect = scrollContainer.getBoundingClientRect();
      if (cardRect.left < contRect.left + 20 || cardRect.right > contRect.right - 20) {
        el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      }
    }

    // Scroll vertical suave da tela
    if (rect.top < topOffset) {
      const targetScrollY = Math.max(0, window.scrollY + rect.top - topOffset);
      window.scrollTo({ top: targetScrollY, behavior: 'smooth' });
    } else if (rect.bottom > window.innerHeight - bottomOffset) {
      const targetScrollY = window.scrollY + (rect.bottom - window.innerHeight) + bottomOffset;
      window.scrollTo({ top: targetScrollY, behavior: 'smooth' });
    }
  }, []);

  const focusInitialElement = useCallback(() => {
    document.body.classList.add('is-smart-tv', 'using-keyboard');

    // 1. Procura pela ação de destaque principal (Assistir Agora)
    const primaryHeroBtn = document.querySelector<HTMLElement>('[data-tv-primary="true"], button.bg-orange-600');
    if (primaryHeroBtn) {
      const r = primaryHeroBtn.getBoundingClientRect();
      if (r.top >= 0 && r.bottom <= window.innerHeight) {
        setElementFocused(primaryHeroBtn);
        return;
      }
    }

    // 2. Procura pela navegação ativa (ex: Início, Filmes, Séries, TV Ao Vivo)
    const activeNav = document.querySelector<HTMLElement>(
      '[data-active-nav="true"], header nav button.bg-orange-600\\/20'
    );
    if (activeNav) {
      setElementFocused(activeNav);
      return;
    }

    // 3. Fallback: primeiro elemento focado visível
    const focusables = getFocusableElements();
    if (focusables.length > 0) {
      const firstInView = focusables.find(el => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= window.innerHeight;
      }) || focusables[0];
      setElementFocused(firstInView);
    }
  }, [getFocusableElements, setElementFocused]);

  const triggerDirectionalNav = useCallback((direction: 'up' | 'down' | 'left' | 'right' | 'enter' | 'back') => {
    document.body.classList.add('is-smart-tv', 'using-keyboard');

    if (direction === 'back') {
      window.dispatchEvent(new CustomEvent('playinfinity:tv_back'));
      if (window.history.length > 1) {
        window.history.back();
      }
      return;
    }

    if (direction === 'enter') {
      const active = currentFocusedRef.current || (document.activeElement as HTMLElement);
      if (active && !active.closest('.virtual-remote-container')) {
        active.click();
      }
      return;
    }

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
        const firstTop = downCandidates[0].top;
        const nextRow = downCandidates
          .filter(c => Math.abs(c.top - firstTop) <= 45)
          .sort((a, b) => a.rect.left - b.rect.left);

        const primary = nextRow.find(c => c.el.getAttribute('data-tv-primary') === 'true');
        bestCandidate = primary ? primary.el : nextRow[0].el;
      }
    } else if (direction === 'up') {
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
        const firstBottom = upCandidates[0].bottom;
        const prevRow = upCandidates
          .filter(c => Math.abs(c.bottom - firstBottom) <= 45)
          .sort((a, b) => a.rect.left - b.rect.left);

        const primary = prevRow.find(c => c.el.getAttribute('data-tv-primary') === 'true');
        bestCandidate = primary ? primary.el : prevRow[0].el;
      }
    } else if (direction === 'right') {
      const currentContainer = current.closest('.overflow-x-auto, .group\\/row, [role="region"]');
      if (currentContainer && currentContainer !== current) {
        const siblings: HTMLElement[] = Array.from(
          currentContainer.querySelectorAll<HTMLElement>('button, a[href], [tabindex="0"], [role="button"]')
        ).filter((el): el is HTMLElement => focusable.includes(el));
        const idx = siblings.indexOf(current);
        if (idx !== -1 && idx < siblings.length - 1) {
          bestCandidate = siblings[idx + 1] as HTMLElement;
        }
      }

      if (!bestCandidate) {
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

        const sameRow = rightCandidates.filter(c => c.dy <= Math.max(currentRect.height, c.rect.height) * 1.5 + 35);
        const pool = sameRow.length > 0 ? sameRow : rightCandidates;

        let minScore = Infinity;
        pool.forEach(c => {
          const score = c.dx + c.dy * 3.5;
          if (score < minScore) {
            minScore = score;
            bestCandidate = c.el;
          }
        });
      }
    } else if (direction === 'left') {
      const currentContainer = current.closest('.overflow-x-auto, .group\\/row, [role="region"]');
      if (currentContainer && currentContainer !== current) {
        const siblings: HTMLElement[] = Array.from(
          currentContainer.querySelectorAll<HTMLElement>('button, a[href], [tabindex="0"], [role="button"]')
        ).filter((el): el is HTMLElement => focusable.includes(el));
        const idx = siblings.indexOf(current);
        if (idx > 0) {
          bestCandidate = siblings[idx - 1] as HTMLElement;
        }
      }

      if (!bestCandidate) {
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

        const sameRow = leftCandidates.filter(c => c.dy <= Math.max(currentRect.height, c.rect.height) * 1.5 + 35);
        const pool = sameRow.length > 0 ? sameRow : leftCandidates;

        let minScore = Infinity;
        pool.forEach(c => {
          const score = c.dx + c.dy * 3.5;
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
  }, [focusInitialElement, getFocusableElements, setElementFocused]);

  // Listener global de controle remoto físico para Smart TVs
  useEffect(() => {
    if (isSmartTV) {
      document.body.classList.add('is-smart-tv');
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      const keyCode = e.keyCode || e.which;

      // Detecta interação de Smart TV / Teclado
      document.body.classList.add('is-smart-tv', 'using-keyboard');
      setIsSmartTV(true);

      // Arrow Left
      if (key === 'ArrowLeft' || keyCode === 37 || keyCode === 21) {
        e.preventDefault();
        triggerDirectionalNav('left');
      }
      // Arrow Up
      else if (key === 'ArrowUp' || keyCode === 38 || keyCode === 19) {
        e.preventDefault();
        triggerDirectionalNav('up');
      }
      // Arrow Right
      else if (key === 'ArrowRight' || keyCode === 39 || keyCode === 22) {
        e.preventDefault();
        triggerDirectionalNav('right');
      }
      // Arrow Down
      else if (key === 'ArrowDown' || keyCode === 40 || keyCode === 20) {
        e.preventDefault();
        triggerDirectionalNav('down');
      }
      // Enter / OK (KeyCode 13 or 23 on Android TV)
      else if (key === 'Enter' || keyCode === 13 || keyCode === 23) {
        // Se já está focado em um input, deixa o input processar o enter normalmente
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
          return;
        }
        e.preventDefault();
        triggerDirectionalNav('enter');
      }
      // Back / Return (KeyCode 10009 Tizen, 461 webOS, 4 Android TV, Escape, Backspace)
      else if (
        key === 'Escape' ||
        key === 'Backspace' ||
        key === 'GoBack' ||
        key === 'Back' ||
        keyCode === 10009 ||
        keyCode === 461 ||
        keyCode === 4
      ) {
        // Se estiver digitando em campo de texto, não dispara voltar
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
          return;
        }
        e.preventDefault();
        triggerDirectionalNav('back');
      }
    };

    const handleMouseDown = () => {
      document.body.classList.remove('using-keyboard');
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('mousedown', handleMouseDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isSmartTV, triggerDirectionalNav]);

  return {
    isSmartTV,
    triggerDirectionalNav,
    setElementFocused,
    focusInitialElement
  };
}
