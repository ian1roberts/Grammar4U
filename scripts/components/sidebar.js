;(function (ns) {
  const { safePreview, escapeHtml } = ns.utils.dom;

  const PANEL_CONFIG = [
    { key: 'grammar', title: 'Grammar & Punctuation' },
    { key: 'clarity', title: 'Clarity' },
    { key: 'tone', title: 'Tone' },
    { key: 'rewrite', title: 'Rewrite' }
  ];

  function createSidebar() {
    const aside = document.createElement('aside');
    aside.className = 'side';
    aside.innerHTML = `
      <div class="tabs">
        ${PANEL_CONFIG.map((panel, index) => `
          <button class="btn ghost${index === 0 ? ' active' : ''}" data-tab="${panel.key}">${panel.title.split('&')[0].trim()}</button>
        `).join('')}
      </div>
      ${PANEL_CONFIG.map((panel, index) => `
        <div class="panel${index === 0 ? ' active' : ''}" data-panel="${panel.key}"></div>
      `).join('')}
      <div class="foot">
        <div>Tips: Select a suggestion to preview, then “Apply fix”.</div>
        <div class="subtle">Local heuristics + optional LLM analysis</div>
      </div>
    `;

    const tabButtons = Array.from(aside.querySelectorAll('[data-tab]'));
    const panels = PANEL_CONFIG.reduce((map, panel) => {
      map[panel.key] = aside.querySelector(`[data-panel="${panel.key}"]`);
      return map;
    }, {});

    function activateTab(tab) {
      tabButtons.forEach((button) => {
        if (button.dataset.tab === tab) {
          button.classList.add('active');
        } else {
          button.classList.remove('active');
        }
      });

      Object.entries(panels).forEach(([key, panel]) => {
        panel.classList.toggle('active', key === tab);
      });
    }

    tabButtons.forEach((button) => {
      button.addEventListener('click', () => activateTab(button.dataset.tab));
    });

    function renderPanel(key, title, items, handlers) {
      const panel = panels[key];
      if (!panel) {
        return;
      }

      panel.innerHTML = '';

      const sourceText = handlers.getSourceText();

      const summary = document.createElement('div');
      summary.className = 'card';
      summary.innerHTML = `
        <h4>${title}</h4>
        <p class="subtle">${items.length ? `Found ${items.length} ${items.length === 1 ? 'suggestion' : 'suggestions'}.` : 'No suggestions yet — press “Check”.'}</p>
      `;
      panel.appendChild(summary);

      items.forEach((suggestion) => {
        const card = document.createElement('div');
        card.className = 'card suggestion';

        const severityColour = suggestion.severity === 'low'
          ? 'var(--muted)'
          : suggestion.severity === 'medium'
          ? 'var(--warn)'
          : 'var(--error)';

        card.innerHTML = `
          <div class="row" style="justify-content:space-between">
            <div style="font-weight:700">${escapeHtml(suggestion.message || 'Suggestion')}</div>
            <span class="badge" style="border-color:${severityColour};color:${severityColour}">${suggestion.severity || 'medium'}</span>
          </div>
          <div class="preview" style="margin:8px 0;padding:8px;background:#0f1424;border:1px solid #1f2a49;border-radius:10px;overflow:auto;max-height:160px"></div>
          <div class="row">
            <button class="btn" data-action="apply">Apply fix</button>
            <button class="btn ghost" data-action="select">Select range</button>
          </div>
        `;

        const preview = card.querySelector('.preview');
        try {
          const raw = typeof suggestion.preview === 'function' ? suggestion.preview(sourceText) : suggestion.preview;
          preview.innerHTML = safePreview(raw ?? '—');
        } catch (error) {
          console.warn('Failed to render preview', error);
          preview.textContent = '—';
        }

        card.querySelector('[data-action="apply"]').addEventListener('click', () => handlers.onApply(suggestion));
        card.querySelector('[data-action="select"]').addEventListener('click', () => handlers.onSelect(suggestion));

        panel.appendChild(card);
      });
    }

    function render(suggestions, handlers) {
      PANEL_CONFIG.forEach(({ key, title }) => {
        renderPanel(key, title, suggestions[key] || [], handlers);
      });
    }

    return {
      element: aside,
      activateTab,
      render
    };
  }

  ns.components = ns.components || {};
  ns.components.createSidebar = createSidebar;
})(window.CG = window.CG || {});
