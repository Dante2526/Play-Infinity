import { useState, useEffect } from 'react';

export function useSmartTV() {
  const [isSmartTV, setIsSmartTV] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    const isTV = /smarttv|tizen|webos|bravia|android tv|aftt|afts|aftm|vidaa|hisense|philips|panasonic/i.test(ua) || 
                 navigator.platform.toLowerCase().includes('tv');
    
    if (isTV) {
      setIsSmartTV(true);
      document.body.classList.add('is-smart-tv');
    }
  }, []);

  return isSmartTV;
}
