import { search, type SearchItem } from '../lib/search';

/**
 * Command palette on a native <dialog>: showModal() provides the focus trap, Escape handling,
 * inert background and focus restoration. This element adds the combobox/listbox behaviour.
 */
class CmdPalette extends HTMLElement {
  private dialog!: HTMLDialogElement;
  private input!: HTMLInputElement;
  private list!: HTMLElement;
  private empty!: HTMLElement;
  private status!: HTMLElement;
  private items: SearchItem[] = [];
  private results: SearchItem[] = [];
  private active = 0;

  connectedCallback() {
    this.dialog = this.querySelector('dialog')!;
    this.input = this.querySelector('.cmdk-input')!;
    this.list = this.querySelector('.cmdk-list')!;
    this.empty = this.querySelector('.cmdk-empty')!;
    this.status = this.querySelector('.cmdk-status')!;
    this.items = JSON.parse(this.querySelector('[data-cmdk-index]')!.textContent || '[]');

    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    document.querySelectorAll<HTMLElement>('[data-cmdk-open]').forEach((btn) => {
      btn.hidden = false;
      btn.setAttribute('aria-label', `Search (${isMac ? '⌘' : 'Ctrl'} K)`);
      const kbd = btn.querySelector('kbd');
      if (kbd) kbd.textContent = isMac ? '⌘ K' : 'Ctrl K';
      btn.addEventListener('click', () => this.open());
    });

    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        // Leave the shortcut alone while the user is typing in some other editable control.
        const t = e.target as HTMLElement | null;
        const editable = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
        if (editable && !this.contains(t)) return;
        e.preventDefault();
        if (this.dialog.open) this.dialog.close();
        else this.open();
      }
    });

    this.input.addEventListener('input', () => this.render());
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    this.querySelector('[data-cmdk-close]')!.addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('click', (e) => {
      if (e.target === this.dialog) this.dialog.close(); // backdrop
    });
    this.list.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.cmdk-item');
      if (el) this.run(this.results[Number(el.dataset.i)]);
    });
    this.list.addEventListener('pointermove', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.cmdk-item');
      if (el && Number(el.dataset.i) !== this.active) this.setActive(Number(el.dataset.i), false);
    });
  }

  open() {
    if (this.dialog.open) return;
    this.input.value = '';
    this.render();
    this.dialog.showModal();
    this.input.focus();
  }

  private onKey(e: KeyboardEvent) {
    const n = this.results.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (n) this.setActive((this.active + 1) % n, true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (n) this.setActive((this.active - 1 + n) % n, true);
    } else if (e.key === 'Home' && n) {
      e.preventDefault();
      this.setActive(0, true);
    } else if (e.key === 'End' && n) {
      e.preventDefault();
      this.setActive(n - 1, true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (n) this.run(this.results[this.active]);
    }
  }

  private setActive(i: number, scroll: boolean) {
    this.active = i;
    this.list.querySelectorAll<HTMLElement>('.cmdk-item').forEach((el) => {
      const on = Number(el.dataset.i) === i;
      el.setAttribute('aria-selected', String(on));
      if (on) {
        this.input.setAttribute('aria-activedescendant', el.id);
        if (scroll) el.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  private render() {
    this.results = search(this.items, this.input.value);
    this.active = 0;
    this.list.replaceChildren();
    let group = '';
    this.results.forEach((item, i) => {
      if (item.group !== group) {
        group = item.group;
        const h = document.createElement('div');
        h.className = 'cmdk-group';
        h.setAttribute('role', 'presentation');
        h.textContent = group;
        this.list.append(h);
      }
      const el = document.createElement('div');
      el.className = 'cmdk-item';
      el.id = `cmdk-${item.id}`;
      el.dataset.i = String(i);
      el.setAttribute('role', 'option');
      el.setAttribute('aria-selected', String(i === 0));
      const title = document.createElement('span');
      title.textContent = item.title;
      el.append(title);
      if (item.hint) {
        const hint = document.createElement('span');
        hint.className = 'hint';
        hint.textContent = item.hint;
        el.append(hint);
      }
      this.list.append(el);
    });
    const none = this.results.length === 0;
    this.empty.hidden = !none;
    this.list.hidden = none;
    if (none) this.input.removeAttribute('aria-activedescendant');
    else this.input.setAttribute('aria-activedescendant', `cmdk-${this.results[0].id}`);
    this.status.textContent = none ? 'No results' : `${this.results.length} results`;
  }

  private async run(item: SearchItem) {
    if (item.action === 'copy-email') {
      const email = this.dataset.email ?? '';
      const ok = await navigator.clipboard.writeText(email).then(
        () => true,
        () => false,
      );
      if (ok) {
        this.status.textContent = 'Email address copied to clipboard.';
        this.dialog.close();
      } else {
        // Honest fallback: clipboard is blocked, so open the contact page where the address is selectable.
        location.href = '/contact/';
      }
      return;
    }
    if (item.action === 'theme') {
      document.querySelector<HTMLElement>('[data-theme-toggle]')?.click();
      return;
    }
    if (item.href) {
      this.dialog.close();
      if (item.external) window.open(item.href, '_blank', 'noopener');
      else location.href = item.href;
    }
  }
}

customElements.define('cmd-palette', CmdPalette);
