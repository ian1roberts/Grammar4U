;(function (ns) {
  const api = {
    $: (selector, scope = document) => scope.querySelector(selector),
    $$: (selector, scope = document) => Array.from(scope.querySelectorAll(selector)),
    escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => (
        {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[char]
      ));
    },
    safePreview(html) {
      const template = document.createElement('template');
      template.innerHTML = html;

      template.content.querySelectorAll('*').forEach((node) => {
        if (node.tagName === 'MARK') {
          const allowed = /^(add|remove|warn)$/;
          if (!allowed.test(node.className)) {
            node.className = '';
          }
          [...node.attributes].forEach((attr) => {
            if (attr.name !== 'class') {
              node.removeAttribute(attr.name);
            }
          });
        } else {
          const replacement = document.createTextNode(node.textContent ?? '');
          node.replaceWith(replacement);
        }
      });

      return template.innerHTML;
    }
  };

  ns.utils = ns.utils || {};
  ns.utils.dom = api;
})(window.CG = window.CG || {});
