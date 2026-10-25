export type SwState = 'unsupported' | 'registering' | 'offline-ready' | `error: ${string}`;

export interface PwaHandle {
  state(): SwState;
  check(): Promise<void>;
}

// Registers sw.js and reports when a newer build is waiting. The new build is
// only activated when the player accepts the prompt, so a game is never swapped mid-play.
export function registerServiceWorker(opts: { onUpdateReady: (apply: () => void) => void }): PwaHandle {
  let state: SwState = 'registering';
  let registration: ServiceWorkerRegistration | null = null;

  if (!('serviceWorker' in navigator)) {
    state = 'unsupported';
    return { state: () => state, check: async () => {} };
  }

  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return; // first install claiming the page needs no reload
    reloading = true;
    location.reload();
  });

  const offerUpdate = (worker: ServiceWorker) => {
    opts.onUpdateReady(() => worker.postMessage('SKIP_WAITING'));
  };

  navigator.serviceWorker
    .register('./sw.js', { scope: './', updateViaCache: 'none' })
    .then((reg) => {
      registration = reg;
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(w);
        });
      });
      return navigator.serviceWorker.ready;
    })
    .then(() => {
      state = 'offline-ready';
    })
    .catch((err: unknown) => {
      state = `error: ${err instanceof Error ? err.message : String(err)}`;
    });

  return {
    state: () => state,
    check: async () => {
      if (registration) await registration.update();
    },
  };
}
