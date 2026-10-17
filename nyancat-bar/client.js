/**
 * Client half of the Nyan Cat bar.
 *
 * Fills the root-scoped `shell.bottom` seat: a full-width strip below all three
 * columns that paints a six-stripe rainbow and lets a pixel-art Nyan Cat fly
 * across it with a trail of sparkles. The flight and the head nod advance only
 * while text is being typed into an editor; when typing stops every animation
 * pauses and the cat fades out, leaving the rainbow strip. All motion is CSS;
 * the stylesheet is owned by the plugin fiber, so unloading removes both the
 * bar and its rules.
 */
window.__ModuleLoader__.load({
  id: '@local/nyancat-bar',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const TYPING_QUIET_MS = 1100;
    const EDITING_KEYS = new Set(['Backspace', 'Delete', 'Enter']);
    const NON_TEXT_INPUT_TYPES = new Set([
      'button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit',
    ]);

    const CSS = `
      .dsh-nyan {
        position: relative;
        width: 100%;
        height: 30px;
        overflow: hidden;
        pointer-events: none;
        user-select: none;
      }
      .dsh-nyan-rainbow {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          to bottom,
          #ff3b30 0 16.666%,
          #ff9500 16.666% 33.333%,
          #ffdf00 33.333% 50%,
          #34d327 50% 66.666%,
          #2ea8ff 66.666% 83.333%,
          #a259ff 83.333% 100%
        );
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
      }
      .dsh-nyan-rainbow::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
          100deg,
          transparent 25%,
          rgba(255, 255, 255, 0.35) 50%,
          transparent 75%
        );
        background-size: 240% 100%;
        animation: dsh-nyan-sheen 5.5s linear infinite;
      }
      .dsh-nyan-runner {
        position: absolute;
        left: 0;
        bottom: 2px;
        width: 40px;
        height: 26px;
        opacity: 0;
        transition: opacity 180ms ease;
        animation: dsh-nyan-run 14s linear infinite;
        animation-play-state: paused;
        will-change: transform;
      }
      .dsh-nyan-cat {
        position: absolute;
        left: 0;
        bottom: 0;
        display: block;
        width: 40px;
        height: 26px;
      }
      .dsh-nyan-head {
        animation: dsh-nyan-head-bob 0.9s ease-in-out infinite;
        animation-play-state: paused;
      }
      .dsh-nyan-star {
        position: absolute;
        display: block;
        animation: dsh-nyan-twinkle 1.4s ease-in-out infinite;
        animation-play-state: paused;
      }
      .dsh-nyan-star-1 {
        left: -26px;
        bottom: 8px;
        width: 9px;
        height: 9px;
        animation-delay: -0.2s;
      }
      .dsh-nyan-star-2 {
        left: -15px;
        bottom: 17px;
        width: 6px;
        height: 6px;
        animation-delay: -0.7s;
      }
      .dsh-nyan-star-3 {
        left: -37px;
        bottom: 14px;
        width: 5px;
        height: 5px;
        animation-delay: -1.1s;
      }
      .dsh-nyan[data-typing='true'] .dsh-nyan-runner {
        opacity: 1;
        animation-play-state: running;
      }
      .dsh-nyan[data-typing='true'] .dsh-nyan-head,
      .dsh-nyan[data-typing='true'] .dsh-nyan-star,
      .dsh-nyan[data-typing='true'] .dsh-nyan-rainbow::after {
        animation-play-state: running;
      }
      @keyframes dsh-nyan-run {
        from { transform: translateX(-56px); }
        to { transform: translateX(calc(100vw + 56px)); }
      }
      @keyframes dsh-nyan-head-bob {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-2px); }
      }
      @keyframes dsh-nyan-twinkle {
        0%, 100% { opacity: 0.25; transform: scale(0.7); }
        50% { opacity: 1; transform: scale(1); }
      }
      @keyframes dsh-nyan-sheen {
        from { background-position: 120% 0; }
        to { background-position: -120% 0; }
      }
      @media (prefers-reduced-motion: reduce) {
        .dsh-nyan-runner {
          animation: none;
          transform: translateX(10vw);
        }
        .dsh-nyan-head,
        .dsh-nyan-star,
        .dsh-nyan-rainbow::after {
          animation: none;
        }
      }
    `;

    const STAR = 'M5 0 L6.2 3.8 L10 5 L6.2 6.2 L5 10 L3.8 6.2 L0 5 L3.8 3.8 Z';

    /** Whether a key or input event lands on text-entry UI (composer, search, settings). */
    function isTextTarget(target) {
      if (target === null || typeof target !== 'object') return false;
      if (target.isContentEditable === true) return true;
      if (target.tagName === 'TEXTAREA') return true;
      return target.tagName === 'INPUT'
        && !NON_TEXT_INPUT_TYPES.has(String(target.type).toLowerCase());
    }

    /** Shared typing clock: true for a short quiet period after the last edit. */
    function createTypingTracker() {
      let active = false;
      let timer = 0;
      const listeners = new Set();

      const notify = () => {
        for (const listener of listeners) listener(active);
      };

      const bump = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          active = false;
          notify();
        }, TYPING_QUIET_MS);
        if (active) return;
        active = true;
        notify();
      };

      const onKeyDown = (event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (!isTextTarget(event.target)) return;
        if (event.isComposing) { bump(); return; }
        if (typeof event.key !== 'string') return;
        if (event.key.length === 1 || EDITING_KEYS.has(event.key)) bump();
      };

      const onInput = (event) => {
        if (isTextTarget(event.target)) bump();
      };

      return {
        get: () => active,
        subscribe(listener) {
          listeners.add(listener);
          return () => { listeners.delete(listener); };
        },
        start() {
          document.addEventListener('keydown', onKeyDown, true);
          document.addEventListener('input', onInput, true);
          return () => {
            document.removeEventListener('keydown', onKeyDown, true);
            document.removeEventListener('input', onInput, true);
            window.clearTimeout(timer);
            listeners.clear();
          };
        },
      };
    }

    const typing = createTypingTracker();

    function useTyping() {
      const [active, setActive] = React.useState(() => typing.get());
      React.useEffect(() => typing.subscribe(setActive), []);
      return active;
    }

    function pixel(x, y, width, height, fill) {
      return h('rect', { x, y, width, height, fill });
    }

    /** Pixel-art Nyan Cat: grey cat head and tail behind a pink Pop-Tart body. */
    function NyanCat() {
      return h('svg', {
        className: 'dsh-nyan-cat',
        viewBox: '0 0 34 22',
        shapeRendering: 'crispEdges',
        focusable: 'false',
      },
        pixel(3, 9, 3, 2, '#9c9c9c'),
        pixel(2, 7, 3, 2, '#6f6f6f'),
        pixel(0, 5, 3, 2, '#9c9c9c'),

        pixel(6, 17, 3, 4, '#e6e6e6'),
        pixel(10, 17, 3, 4, '#e6e6e6'),
        pixel(14, 17, 3, 4, '#e6e6e6'),
        pixel(18, 17, 2, 4, '#e6e6e6'),

        pixel(4, 5, 17, 13, '#f2a6d0'),
        pixel(5, 6, 15, 11, '#cf6fa7'),
        pixel(6, 7, 13, 9, '#ffd0e9'),

        pixel(7, 8, 2, 1, '#5fd0ff'),
        pixel(11, 9, 2, 1, '#ffe066'),
        pixel(15, 8, 2, 1, '#5fd0ff'),
        pixel(14, 10, 1, 1, '#ff8fa7'),
        pixel(8, 12, 2, 1, '#ffe066'),
        pixel(12, 13, 2, 1, '#5fd0ff'),
        pixel(16, 12, 1, 1, '#ffe066'),
        pixel(10, 14, 2, 1, '#ff8fa7'),

        h('g', { className: 'dsh-nyan-head' },
          pixel(22, 2, 2, 4, '#a6a6a6'),
          pixel(29, 2, 2, 4, '#a6a6a6'),
          pixel(22.5, 3, 1, 2, '#f2a6c4'),
          pixel(29.5, 3, 1, 2, '#f2a6c4'),

          pixel(21, 4, 11, 12, '#a6a6a6'),
          pixel(24, 9, 7, 6, '#cfcfcf'),

          pixel(24, 8, 1.6, 3, '#262626'),
          pixel(28, 8, 1.6, 3, '#262626'),
          pixel(24.3, 8.6, 0.7, 0.9, '#ffffff'),
          pixel(28.3, 8.6, 0.7, 0.9, '#ffffff'),

          pixel(21.5, 12, 2, 1.5, '#ff92b8'),
          pixel(29.5, 12, 2, 1.5, '#ff92b8'),

          pixel(25.5, 12, 1, 1, '#6d4b57'),
          pixel(26.5, 13, 1, 1, '#6d4b57'),
          pixel(27.5, 12, 1, 1, '#6d4b57'),
        ),
      );
    }

    function Sparkle({ className, fill }) {
      return h('svg', { className, viewBox: '0 0 10 10', focusable: 'false' },
        h('path', { d: STAR, fill }));
    }

    function NyanCatBar() {
      const typingNow = useTyping();
      return h('div', {
        className: 'dsh-nyan',
        'aria-hidden': 'true',
        'data-typing': typingNow ? 'true' : 'false',
      },
        h('div', { className: 'dsh-nyan-rainbow' },
          h('div', { className: 'dsh-nyan-runner' },
            h(Sparkle, { className: 'dsh-nyan-star dsh-nyan-star-1', fill: '#fff6a8' }),
            h(Sparkle, { className: 'dsh-nyan-star dsh-nyan-star-2', fill: '#ffffff' }),
            h(Sparkle, { className: 'dsh-nyan-star dsh-nyan-star-3', fill: '#fff6a8' }),
            h(NyanCat),
          ),
        ),
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => {
          const tag = document.createElement('style');
          tag.dataset.plugin = '@local/nyancat-bar';
          tag.textContent = CSS;
          document.head.appendChild(tag);
          return () => tag.remove();
        }, 'nyancat-bar: styles');

        ctx.effect(() => typing.start(), 'nyancat-bar: typing tracker');

        ctx.slots.inject('shell.bottom', () => ctx.slots.register({
          name: 'shell.bottom',
        }, NyanCatBar));
      },
    };
  },
});
