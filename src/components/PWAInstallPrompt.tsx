import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show banner after 5 seconds if not previously dismissed
      const wasDismissed = localStorage.getItem('pwa_install_dismissed');
      if (!wasDismissed) {
        setTimeout(() => setShowBanner(true), 5000);
      }
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    setDismissed(true);
    try { localStorage.setItem('pwa_install_dismissed', 'true'); } catch {}
  };

  if (!deferredPrompt || !showBanner || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50"
      >
        <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-2xl p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5 text-[#D4AF37]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-bold">Install Ash-vish Events</p>
              <p className="text-gray-400 text-[10px] mt-0.5">
                Add to your home screen for quick access and instant notifications.
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleInstall}
                  className="px-3 py-1.5 rounded-lg bg-[#D4AF37] text-black text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3 h-3" /> Install
                </button>
                <button
                  onClick={handleDismiss}
                  className="px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 text-[10px] font-bold cursor-pointer"
                >
                  Not now
                </button>
              </div>
            </div>
            <button onClick={handleDismiss} className="text-gray-500 hover:text-white cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/** Register the service worker */
export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

/** Request push notification permission */
export async function requestPushPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

/** Send a push subscription to the server */
export async function subscribeToPush(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: undefined, // Will be set when VAPID key is configured
    });
    // Store subscription locally — server integration pending VAPID key setup
    try { localStorage.setItem('push_subscription', JSON.stringify(subscription)); } catch {}
  } catch {}
}
