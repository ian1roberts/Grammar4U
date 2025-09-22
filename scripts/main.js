;(function (ns) {
  function boot() {
    const root = document.getElementById('app');
    if (!root) {
      throw new Error('Root container #app not found');
    }
    ns.app.initApp(root);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})(window.CG = window.CG || {});
