// Phone-app extras (iPhone / Android via Capacitor). On the web every function falls back or does nothing.
import { Capacitor } from '@capacitor/core';

export const isNative = () => Capacitor.isNativePlatform();
export const platform = () => Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

// a stable number per timer key (notification ids must be 32-bit ints)
const idOf = (key) => { let h = 0; for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) % 2000000000; };

let asked = false;
/** Ring a real notification when a cook-day timer ends, even with the phone locked. */
export async function scheduleTimer(key, label, atMs) {
  if (!isNative() || atMs <= Date.now()) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  if (!asked) { asked = true; const p = await LocalNotifications.checkPermissions(); if (p.display !== 'granted') await LocalNotifications.requestPermissions(); }
  const id = idOf(key);
  await LocalNotifications.cancel({ notifications: [{ id }] }).catch(() => {});
  await LocalNotifications.schedule({ notifications: [{ id, title: '⏰ Timer done', body: label, schedule: { at: new Date(atMs), allowWhileIdle: true }, sound: undefined, extra: { key } }] });
}
export async function cancelTimer(key) {
  if (!isNative()) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.cancel({ notifications: [{ id: idOf(key) }] }).catch(() => {});
}

/** Keep the screen on (native); returns true if handled. */
export async function nativeAwake(on) {
  if (!isNative()) return false;
  const { KeepAwake } = await import('@capacitor-community/keep-awake');
  try { on ? await KeepAwake.keepAwake() : await KeepAwake.allowSleep(); } catch {}
  return true;
}

/** Share text through the phone's share sheet (or the browser's, or copy it). Returns 'shared' | 'copied'. */
export async function shareText(title, text) {
  if (isNative()) { const { Share } = await import('@capacitor/share'); await Share.share({ title, text, dialogTitle: title }); return 'shared'; }
  if (navigator.share) { try { await navigator.share({ title, text }); return 'shared'; } catch (e) { if (e?.name === 'AbortError') return 'shared'; } }
  await navigator.clipboard.writeText(text); return 'copied';
}

/** A light tap when you check something off. */
export async function tap() {
  if (!isNative()) { try { navigator.vibrate?.(10); } catch {} return; }
  const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}

/** Match the status bar to the app, and hide the splash once the app has drawn. */
export async function nativeStart() {
  if (!isNative()) return;
  try { const { StatusBar, Style } = await import('@capacitor/status-bar'); await StatusBar.setStyle({ style: Style.Light }); if (platform() === 'android') await StatusBar.setBackgroundColor({ color: '#f6f4ee' }); } catch {}
  try { const { SplashScreen } = await import('@capacitor/splash-screen'); await SplashScreen.hide(); } catch {}
}
