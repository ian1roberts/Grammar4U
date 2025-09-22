;(function (ns) {
  const storage = {
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (error) {
        console.warn('Failed to read from localStorage', error);
        return fallback;
      }
    },
    set(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  };

  ns.utils = ns.utils || {};
  ns.utils.storage = storage;
})(window.CG = window.CG || {});
