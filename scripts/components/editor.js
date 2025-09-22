;(function (ns) {
  function createEditor() {
    const section = document.createElement('section');
    section.className = 'editor';
    section.innerHTML = `
      <div class="toolbar">
        <button class="btn" data-action="check">Check <span class="kbd">Ctrl</span>+<span class="kbd">Enter</span></button>
        <button class="btn ghost" data-action="apply-all">Apply all</button>
        <button class="btn ghost" data-action="undo">Undo last</button>
        <span class="toolbar-spacer" aria-hidden="true"></span>
        <button class="btn ghost" data-action="paste-clean">Paste (clean)</button>
        <button class="btn" data-action="rewrite-simplify">Rewrite: Simplify</button>
        <button class="btn" data-action="rewrite-formal">Rewrite: Formal</button>
        <button class="btn" data-action="rewrite-friendly">Rewrite: Friendly</button>
        <span class="toolbar-spacer" aria-hidden="true"></span>
        <button class="btn" data-action="copy">Copy</button>
        <button class="btn" data-action="export">Export .md</button>
        <button class="btn accent" data-action="clear">Clear</button>
      </div>
      <textarea data-role="input" spellcheck="false" placeholder="Paste or type your text here. Press Ctrl+Enter to analyse."></textarea>
      <div class="metrics" data-role="metrics"></div>
    `;

    const textarea = section.querySelector('[data-role="input"]');
    const metrics = section.querySelector('[data-role="metrics"]');

    function onAction(action, handler) {
      const button = section.querySelector(`[data-action="${action}"]`);
      if (button) {
        button.addEventListener('click', handler);
      }
    }

    function setMetrics({ words, chars, minutes, readingEase }) {
      metrics.innerHTML = `
        <span class="chip">Words: <b>${words}</b></span>
        <span class="chip">Characters: <b>${chars}</b></span>
        <span class="chip">Reading time: <b>${minutes} min</b></span>
        <span class="chip">Flesch: <b>${readingEase}</b></span>
      `;
    }

    return {
      element: section,
      textarea,
      onAction,
      onInput(handler) {
        textarea.addEventListener('input', handler);
      },
      onPaste(handler) {
        textarea.addEventListener('paste', handler);
      },
      focus() {
        textarea.focus();
      },
      getText() {
        return textarea.value;
      },
      setText(value) {
        textarea.value = value;
      },
      selectRange(start, end) {
        textarea.focus();
        textarea.setSelectionRange(start, end);
      },
      setMetrics
    };
  }

  ns.components = ns.components || {};
  ns.components.createEditor = createEditor;
})(window.CG = window.CG || {});
