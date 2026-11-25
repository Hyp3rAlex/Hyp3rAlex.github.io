/** Site-wide progressive enhancement: theme, reveals, copy-to-clipboard, mobile menu. */

type Pref = 'dark' | 'light' | 'system';
const root = document.documentElement;
const media = matchMedia('(prefers-color-scheme: light)');

function resolve(pref: Pref): 'dark' | 'light' {
  return pref === 'system' ? (media.matches ? 'light' : 'dark') : pref;
}

function applyTheme(pref: Pref, persist: boolean) {
  const theme = resolve(pref);
  root.dataset.theme = theme;
  root.dataset.themePref = pref;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!.content =
    theme === 'light' ? '#f3f1ec' : '#08090b';
  if (persist) {
    try {
      localStorage.setItem('ay-theme', pref);
    } catch {
      /* storage unavailable: the choice simply lasts for this page */
    }
  }
  syncThemeControls();
}

function currentPref(): Pref {
  const p = root.dataset.themePref;
  return p === 'light' || p === 'system' ? p : 'dark';
}

function syncThemeControls() {
  const pref = currentPref();
  const next: Record<Pref, Pref> = { dark: 'light', light: 'system', system: 'dark' };
  document.querySelectorAll<HTMLElement>('[data-theme-toggle]').forEach((btn) => {
    const label = `Theme: ${pref}. Switch to ${next[pref]}.`;
    btn.setAttribute('aria-label', label);
    btn.title = label;
  });
  document.querySelectorAll<HTMLElement>('[data-theme-value]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.themeValue === pref));
  });
}

function initTheme() {
  document.querySelectorAll<HTMLElement>('[data-theme-toggle], [data-theme-set]').forEach((el) => {
    el.hidden = false;
  });
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const toggle = target.closest<HTMLElement>('[data-theme-toggle]');
    if (toggle) {
      const next: Record<Pref, Pref> = { dark: 'light', light: 'system', system: 'dark' };
      applyTheme(next[currentPref()], true);
      return;
    }
    const set = target.closest<HTMLElement>('[data-theme-value]');
    if (set) applyTheme(set.dataset.themeValue as Pref, true);
  });
  media.addEventListener('change', () => {
    if (currentPref() === 'system') applyTheme('system', false);
  });
  syncThemeControls();
}

function initReveal() {
  const els = document.querySelectorAll<HTMLElement>('[data-reveal], [data-trace]');
  if (!els.length) return;
  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
  );
  els.forEach((el) => io.observe(el));
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function initCopy() {
  document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((btn) => {
    btn.hidden = false;
    const status = (btn.closest('[data-copy-scope]') ?? btn.parentElement)?.querySelector<HTMLElement>('[data-copy-status]');
    const idle = btn.querySelector<HTMLElement>('[data-copy-label]');
    const idleText = idle?.textContent ?? '';
    let timer = 0;
    btn.addEventListener('click', async () => {
      const ok = await copyText(btn.dataset.copy ?? '');
      window.clearTimeout(timer);
      if (idle) idle.textContent = ok ? 'Copied' : 'Copy failed';
      btn.dataset.state = ok ? 'ok' : 'fail';
      if (status) {
        status.textContent = ok
          ? 'Copied — the address is on your clipboard.'
          : 'Could not access the clipboard — please select the address and copy it manually.';
      }
      timer = window.setTimeout(() => {
        if (idle) idle.textContent = idleText;
        delete btn.dataset.state;
      }, 2400);
    });
  });
}

function initMenu() {
  const menu = document.querySelector<HTMLDetailsElement>('details.menu');
  if (!menu) return;
  const summary = menu.querySelector('summary')!;
  const rest = [...document.querySelectorAll<HTMLElement>('main, .site-footer')];
  const sync = () => {
    summary.setAttribute('aria-label', menu.open ? 'Close menu' : 'Open menu');
    document.body.style.overflow = menu.open ? 'hidden' : '';
    // The panel covers the page: content behind it must not take focus or be read.
    for (const el of rest) el.inert = menu.open;
  };
  menu.addEventListener('toggle', sync);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.open) {
      menu.open = false;
      summary.focus();
    }
  });
  matchMedia('(min-width: 52em)').addEventListener('change', (e) => {
    if (e.matches) menu.open = false;
  });
  sync();
}

function initSpotlight() {
  if (!matchMedia('(hover: hover)').matches) return;
  document.addEventListener(
    'pointermove',
    (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.card');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    },
    { passive: true },
  );
}

initTheme();
initSpotlight();
initReveal();
initCopy();
initMenu();
