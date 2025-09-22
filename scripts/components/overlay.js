;(function (ns) {
  function createOverlayManager() {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.setAttribute('aria-live', 'polite');
    overlay.setAttribute('aria-busy', 'true');
    overlay.innerHTML = `
      <div class="card">
        <div class="spinner"></div>
        <div data-role="message">LLM query sent, waiting for response …</div>
      </div>
    `;

    const messageEl = overlay.querySelector('[data-role="message"]');
    let busyCount = 0;

    function show(message) {
      busyCount += 1;
      if (message) {
        messageEl.textContent = message;
      }
      overlay.classList.add('show');
      document.body.classList.add('dim');
    }

    function hide() {
      busyCount = Math.max(0, busyCount - 1);
      if (busyCount === 0) {
        overlay.classList.remove('show');
        document.body.classList.remove('dim');
      }
    }

    return {
      element: overlay,
      show,
      hide
    };
  }

  ns.components = ns.components || {};
  ns.components.createOverlayManager = createOverlayManager;
})(window.CG = window.CG || {});
