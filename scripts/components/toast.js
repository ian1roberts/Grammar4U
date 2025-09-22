;(function (ns) {
  function createToastManager() {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');

    let timer = null;

    function show(message, duration = 1800) {
      toast.textContent = message;
      toast.classList.add('show');
      clearTimeout(timer);
      timer = setTimeout(() => {
        toast.classList.remove('show');
      }, duration);
    }

    return {
      element: toast,
      show
    };
  }

  ns.components = ns.components || {};
  ns.components.createToastManager = createToastManager;
})(window.CG = window.CG || {});
