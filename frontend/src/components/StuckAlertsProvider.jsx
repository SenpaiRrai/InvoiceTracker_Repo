import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/contexts/AuthContext";
import { toast } from "sonner";

const playChime = () => {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const now = ctx.currentTime;
    const notes = [880, 1320, 1760];
    notes.forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, now + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.25, now + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.18);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(now + i * 0.18);
      o.stop(now + i * 0.18 + 0.2);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch (err) {
    console.warn("[chime] could not play:", err?.message);
  }
};

const POLL_MS = 60_000;

const requestNotificationPermission = async () => {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch (err) {
      console.warn("[notify] permission request failed:", err?.message);
    }
  }
};

const showBrowserNotification = (inv) => {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification("InvoiceFlow — Stuck Invoice", {
      body: `${inv.invoice_number} (${inv.vendor_name}) has been stuck for ${inv.days_in_current_stage.toFixed(1)} days`,
      tag: inv.id,
    });
  } catch (err) {
    console.warn("[notify] could not show:", err?.message);
  }
};

const StuckAlertsProvider = ({ children }) => {
  // Set of invoice IDs we've already alerted for in this session
  const knownRef = useRef(new Set());
  const [, forceTick] = useState(0);

  const poll = useCallback(async () => {
    try {
      const { data } = await api.get("/invoices/stuck");
      const known = knownRef.current;
      const newOnes = data.filter((i) => !known.has(i.id));
      if (newOnes.length === 0) return;

      playChime();
      newOnes.forEach((inv) => {
        toast.error(`Stuck invoice: ${inv.invoice_number}`, {
          description: `${inv.vendor_name} — ${inv.days_in_current_stage.toFixed(1)} days at this stage`,
          duration: 8000,
        });
        showBrowserNotification(inv);
        known.add(inv.id);
      });
      forceTick((n) => n + 1);
    } catch (err) {
      // Polling errors are non-fatal but worth a console trace
      console.warn("[stuck-poll] failed:", err?.message);
    }
  }, []);

  useEffect(() => {
    requestNotificationPermission();
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => clearInterval(interval);
  }, [poll]);

  return <>{children}</>;
};

export default StuckAlertsProvider;
export { playChime };
