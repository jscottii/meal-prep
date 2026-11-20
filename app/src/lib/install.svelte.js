// "Install the app": one-tap install where the browser allows it, step-by-step help on iPhone.
export const install = $state({ prompt: null, installed: false });

const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
install.installed = standalone();
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); install.prompt = e; });
addEventListener('appinstalled', () => { install.installed = true; install.prompt = null; });

export async function promptInstall() {
  if (!install.prompt) return false;
  install.prompt.prompt();
  const r = await install.prompt.userChoice;
  install.prompt = null;
  return r?.outcome === 'accepted';
}

/** Which browser we're in, for the right instructions. */
export function browserKind() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) {
    if (/GSA\/|FBAN|FBAV|Instagram|Line\/|Twitter|LinkedInApp|Gmail|Snapchat/i.test(ua)) return 'ios-inapp';
    if (/CriOS/.test(ua)) return 'ios-chrome';
    if (/FxiOS|EdgiOS|OPiOS/.test(ua)) return 'ios-other';
    return 'ios-safari';
  }
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}
