export type WheelTimePickerOptions = {
  value?: number;
  step?: number;
  min?: number;
  max?: number;
  label?: string;
  onChange?: (minutes: number) => void;
};

export type WheelTimePicker = {
  get: () => number;
  set: (minutes: number) => void;
  destroy: () => void;
};

/**
 * iOS-alarm-style time picker supplied for SHOWUP.
 *
 * Values are minutes after midnight (0–1439). Optional min/max bounds may
 * cross midnight. Class names are prefixed to avoid collisions with SHOWUP.
 */
export function createWheelTimePicker(container: HTMLElement, opts: WheelTimePickerOptions = {}): WheelTimePicker {
  const step = opts.step ?? 15;
  const onChange = opts.onChange ?? (() => {});
  const DAY = 1440;
  const hasWindow = opts.min != null && opts.max != null;
  const winMin = hasWindow ? ((opts.min! % DAY) + DAY) % DAY : 0;
  const winMax = hasWindow ? ((opts.max! % DAY) + DAY) % DAY : 0;
  const winLen = hasWindow ? (winMax - winMin + DAY) % DAY || DAY : DAY;

  function inWindow(m: number) {
    if (!hasWindow) return true;
    return (m - winMin + DAY) % DAY <= winLen;
  }

  function nearestEdge(m: number) {
    const toMin = Math.min((m - winMin + DAY) % DAY, (winMin - m + DAY) % DAY);
    const toMax = Math.min((m - winMax + DAY) % DAY, (winMax - m + DAY) % DAY);
    return toMin <= toMax ? winMin : winMax;
  }

  const CYCLES = 21;
  const MID = Math.floor(CYCLES / 2);
  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const minutes = Array.from({ length: 60 / step }, (_, i) => String(i * step).padStart(2, '0'));
  const periods = ['am', 'pm'];

  const wheel = document.createElement('div');
  wheel.className = 'twp-wheel';
  wheel.setAttribute('role', 'group');
  if (opts.label) wheel.setAttribute('aria-label', opts.label);
  wheel.innerHTML = '<div class="twp-band"></div>';
  container.appendChild(wheel);

  type Column = {
    el: HTMLDivElement;
    values: string[];
    n: number;
    loops: boolean;
    items: HTMLDivElement[];
    settleTimer: ReturnType<typeof setTimeout> | null;
    raf: number;
  };

  function makeColumn(values: string[], loops: boolean, name: string, extraClass?: string): Column {
    const el = document.createElement('div');
    el.className = 'twp-col' + (extraClass ? ' ' + extraClass : '');
    el.tabIndex = 0;
    el.setAttribute('role', 'spinbutton');
    el.setAttribute('aria-label', name);

    const n = values.length;
    const copies = loops ? CYCLES : 1;
    const frag = document.createDocumentFragment();
    frag.appendChild(Object.assign(document.createElement('div'), { className: 'twp-pad' }));
    const items: HTMLDivElement[] = [];
    for (let c = 0; c < copies; c += 1) {
      for (let i = 0; i < n; i += 1) {
        const item = document.createElement('div');
        item.className = 'twp-item';
        item.textContent = values[i];
        item.dataset.index = String(c * n + i);
        frag.appendChild(item);
        items.push(item);
      }
    }
    frag.appendChild(Object.assign(document.createElement('div'), { className: 'twp-pad' }));
    el.appendChild(frag);
    wheel.appendChild(el);

    const col: Column = {
      el,
      values,
      n,
      loops,
      items,
      settleTimer: null,
      raf: 0,
    };

    el.addEventListener(
      'scroll',
      () => {
        if (!col.raf) {
          col.raf = requestAnimationFrame(() => {
            col.raf = 0;
            paint(col);
          });
        }
        if (col.settleTimer) clearTimeout(col.settleTimer);
        col.settleTimer = setTimeout(() => settle(col), 120);
      },
      { passive: true },
    );

    el.addEventListener('click', (event) => {
      const item = (event.target as HTMLElement).closest<HTMLElement>('.twp-item');
      if (item) scrollToIndex(col, Number(item.dataset.index), true);
    });

    el.addEventListener('keydown', (event) => {
      const delta = { ArrowDown: 1, ArrowUp: -1 }[event.key];
      if (!delta) return;
      event.preventDefault();
      scrollToIndex(col, currentIndex(col) + delta, true);
    });

    return col;
  }

  const cols = [makeColumn(hours, true, 'Hour'), makeColumn(minutes, true, 'Minute'), makeColumn(periods, false, 'am or pm', 'twp-period')];

  function itemH(col: Column) {
    return col.items[0].offsetHeight;
  }

  function currentIndex(col: Column) {
    const index = Math.round(col.el.scrollTop / itemH(col));
    return Math.max(0, Math.min(col.items.length - 1, index));
  }

  function currentValueIndex(col: Column) {
    return currentIndex(col) % col.n;
  }

  function scrollToIndex(col: Column, index: number, smooth: boolean) {
    const bounded = Math.max(0, Math.min(col.items.length - 1, index));
    col.el.scrollTo({
      top: bounded * itemH(col),
      behavior: smooth ? 'smooth' : 'auto',
    });
  }

  function paint(col: Column) {
    const height = itemH(col);
    const position = col.el.scrollTop / height;
    const from = Math.max(0, Math.floor(position) - 4);
    const to = Math.min(col.items.length - 1, Math.ceil(position) + 4);
    for (let i = from; i <= to; i += 1) {
      const distance = i - position;
      const style = col.items[i].style;
      style.transform = `perspective(360px) rotateX(${(-distance * 20).toFixed(2)}deg)`;
      style.opacity = Math.max(0.18, 1 - Math.abs(distance) * 0.32).toFixed(3);
    }
  }

  function settle(col: Column) {
    if (col.loops) {
      const index = currentIndex(col);
      if (index < (MID - 5) * col.n || index >= (MID + 6) * col.n) {
        scrollToIndex(col, MID * col.n + (index % col.n), false);
      }
    }
    const value = col.values[currentValueIndex(col)];
    col.el.setAttribute('aria-valuetext', value);
    const total = get();
    if (!inWindow(total)) {
      set(nearestEdge(total), true);
      return;
    }
    onChange(total);
  }

  function get() {
    const hour12 = Number(hours[currentValueIndex(cols[0])]);
    const minute = Number(minutes[currentValueIndex(cols[1])]);
    const pm = currentValueIndex(cols[2]) === 1;
    const hour24 = (hour12 % 12) + (pm ? 12 : 0);
    return hour24 * 60 + minute;
  }

  function nearestIndex(col: Column, valueIndex: number) {
    if (!col.loops) return valueIndex;
    const current = currentIndex(col);
    const base = current - (current % col.n) + valueIndex;
    return [base - col.n, base, base + col.n].reduce((a, b) => (Math.abs(b - current) < Math.abs(a - current) ? b : a));
  }

  function set(total: number, smooth = false) {
    const normalized = (((Math.round(total / step) * step) % DAY) + DAY) % DAY;
    const hour24 = Math.floor(normalized / 60);
    const minute = normalized % 60;
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    const targets = [hour12 - 1, minute / step, hour24 >= 12 ? 1 : 0];
    cols.forEach((col, index) => {
      const target = smooth ? nearestIndex(col, targets[index]) : col.loops ? MID * col.n + targets[index] : targets[index];
      scrollToIndex(col, target, smooth);
    });
    if (!smooth) {
      cols.forEach((col) => {
        paint(col);
        col.el.setAttribute('aria-valuetext', col.values[currentValueIndex(col)]);
      });
    }
  }

  const initial = opts.value ?? (hasWindow ? winMin : 17 * 60);
  set(inWindow(initial) ? initial : nearestEdge(initial));

  return {
    get,
    set: (minutesValue) => set(inWindow(minutesValue) ? minutesValue : nearestEdge(minutesValue)),
    destroy: () => {
      cols.forEach((col) => {
        if (col.settleTimer) clearTimeout(col.settleTimer);
        if (col.raf) cancelAnimationFrame(col.raf);
      });
      container.replaceChildren();
    },
  };
}
