;(function (ns) {
  const storage = ns.utils.storage;
  const { normaliseText, computeMetrics } = ns.utils.text;
  const { runHeuristics } = ns.features.heuristics;
  const {
    DEFAULT_MODELS,
    fetchModels,
    testApiKey,
    analyseTextWithLLM,
    rewriteWithLLM
  } = ns.services.openai;
  const {
    createHeader,
    createEditor,
    createSidebar,
    createOverlayManager,
    createToastManager
  } = ns.components;

  const SETTINGS_KEY = 'cg_settings_v2';
  const DEMO_TEXT = `I literally  think this is basically a good idea, however it was considered and then it was decided.
The colours, flavours, and textures are vibrant, delicious and memorable.
We invited product, design and operations to the workshop.
This is not only clear but also  clear.  There  are multiple   spaces. And and duplicated words.
American spelling: color organize analyze.`;

  class GrammarApp {
  constructor(root) {
    this.root = root;
    this.header = createHeader();
    this.editor = createEditor();
    this.sidebar = createSidebar();
    this.overlay = createOverlayManager();
    this.toast = createToastManager();

    this.state = {
      useLLM: false,
      apiKey: '',
      model: 'gpt-4o-mini',
      endpoint: 'http://localhost:3333',
      proxyToken: '',
      lastText: '',
      undoStack: [],
      suggestions: {
        grammar: [],
        clarity: [],
        tone: [],
        rewrite: []
      }
    };

    this.analyseTimer = null;
    this.analysisCounter = 0;
    this.llmTokenWarningShown = false;
  }

  init() {
    if (!document.body.contains(this.overlay.element)) {
      document.body.appendChild(this.overlay.element);
    }
    if (!document.body.contains(this.toast.element)) {
      document.body.appendChild(this.toast.element);
    }

    this.root.innerHTML = '';

    const main = document.createElement('main');
    main.className = 'wrap';
    main.append(this.editor.element, this.sidebar.element);

    this.root.append(this.header.element, main);

    this.loadSettings();
    this.header.setModelOptions(DEFAULT_MODELS, this.state.model);
    this.header.setSettings({
      model: this.state.model,
      endpoint: this.state.endpoint,
      useLLM: this.state.useLLM,
      proxyToken: this.state.proxyToken
    });

    this.bindEvents();
    this.seedDemo();
    this.updateMetrics();
    this.renderSuggestions();
    this.scheduleAnalyse();

    setTimeout(() => {
      this.refreshApiStatusAndModels({ silent: true }).catch((error) => {
        console.warn('Initial API status check failed', error);
      });
    }, 100);
  }

  loadSettings() {
    const saved = storage.get(SETTINGS_KEY, null);
    if (!saved) {
      return;
    }

    this.state.model = saved.model || this.state.model;
    this.state.endpoint = saved.endpoint || this.state.endpoint;
    this.state.useLLM = !!saved.useLLM;
    this.state.proxyToken = saved.proxyToken || this.state.proxyToken;
  }

  bindEvents() {
    this.header.onSave(() => {
      this.handleSaveSettings();
    });

    this.header.onRefresh(() => {
      this.handleRefreshModels();
    });

    this.header.onModelChange(() => {
      const { model } = this.header.getSettings();
      this.state.model = model || this.state.model;
    });

    this.header.onToggleLLM(() => {
      const { useLLM, proxyToken } = this.header.getSettings();
      this.state.useLLM = !!useLLM;
      if (this.state.useLLM && !(proxyToken || this.state.proxyToken)) {
        this.toast.show('Configure proxy token before enabling OpenAI');
      }
      if (!this.state.useLLM) {
        this.llmTokenWarningShown = false;
      }
    });

    const actionHandlers = {
      'check': () => this.analyse(),
      'apply-all': () => this.applyAll(),
      undo: () => this.undo(),
      'paste-clean': () => this.pasteClean(),
      'rewrite-simplify': () => this.doRewrite('simplify'),
      'rewrite-formal': () => this.doRewrite('formal'),
      'rewrite-friendly': () => this.doRewrite('friendly'),
      copy: () => this.copyToClipboard(),
      export: () => this.exportMarkdown(),
      clear: () => this.clearEditor()
    };

    Object.entries(actionHandlers).forEach(([action, handler]) => {
      this.editor.onAction(action, () => {
        const result = handler();
        if (result instanceof Promise) {
          result.catch((error) => console.error(`Action ${action} failed`, error));
        }
      });
    });

    this.editor.onInput(() => {
      this.updateMetrics();
    });

    this.editor.onPaste(() => {
      setTimeout(() => {
        const current = this.editor.getText();
        const normalised = normaliseText(current);
        if (normalised !== current) {
          this.applyText(normalised, { pushUndo: false });
        }
        this.scheduleAnalyse();
      }, 0);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        this.analyse();
      }
    });
  }

  seedDemo() {
    this.state.undoStack = [];
    this.applyText(DEMO_TEXT, { pushUndo: false });
  }

  applyText(value, { pushUndo = true } = {}) {
    const current = this.editor.getText();
    if (pushUndo && current !== value) {
      this.state.undoStack.push(current);
    }
    this.editor.setText(value);
    this.updateMetrics();
  }

  undo() {
    const previous = this.state.undoStack.pop();
    if (previous == null) {
      this.toast.show('Nothing to undo');
      return;
    }
    this.editor.setText(previous);
    this.updateMetrics();
    this.toast.show('Undid last change');
  }

  clearEditor() {
    if (this.editor.getText().length === 0) {
      return;
    }
    this.applyText('', { pushUndo: true });
    this.state.suggestions = { grammar: [], clarity: [], tone: [], rewrite: [] };
    this.renderSuggestions();
    this.toast.show('Cleared');
  }

  async handleSaveSettings() {
    const previousEndpoint = this.state.endpoint;
    const previousToken = this.state.proxyToken;
    const { model, endpoint, useLLM, proxyToken } = this.header.getSettings();

    this.state.model = model || this.state.model;
    this.state.endpoint = (endpoint || 'http://localhost:3333').trim();
    this.state.useLLM = !!useLLM;
    this.state.proxyToken = (proxyToken || '').trim();
    this.llmTokenWarningShown = false;

    const savedToStorage = storage.set(SETTINGS_KEY, {
      model: this.state.model,
      endpoint: this.state.endpoint,
      useLLM: this.state.useLLM,
      proxyToken: this.state.proxyToken
    });

    this.header.setSettings({
      model: this.state.model,
      endpoint: this.state.endpoint,
      useLLM: this.state.useLLM,
      proxyToken: this.state.proxyToken
    });

    let toastMessage = 'Settings saved';

    try {
      const shouldRefresh =
        this.state.endpoint !== previousEndpoint || this.state.proxyToken !== previousToken;

      const status = await this.refreshApiStatusAndModels({ silent: !shouldRefresh });
      if (shouldRefresh && status.ok) {
        toastMessage = 'Settings saved, models updated';
      }
    } catch (error) {
      console.error('Failed to refresh models after saving settings', error);
    }

    if (!savedToStorage) {
      toastMessage += ' (storage unavailable)';
    }

    this.toast.show(toastMessage);
  }

  async handleRefreshModels() {
    if (!this.state.endpoint) {
      this.toast.show('Please configure endpoint first');
      return;
    }

    if (!this.state.proxyToken) {
      this.toast.show('Please configure proxy token first');
      return;
    }

    try {
      const status = await this.refreshApiStatusAndModels({ silent: false });
      if (!status.ok) {
        throw new Error(status.message);
      }
      this.toast.show('Models refreshed');
    } catch (error) {
      console.error('Error refreshing models:', error);
      this.toast.show('Failed to refresh models');
    }
  }

  async refreshApiStatusAndModels({ silent } = {}) {
    if (!this.state.endpoint) {
      const status = { ok: false, status: 'error', message: 'No endpoint configured' };
      this.state.apiKey = '';
      this.header.setApiStatus(status);
      return status;
    }

    if (!this.state.proxyToken) {
      const status = { ok: false, status: 'error', message: 'Proxy token missing' };
      this.state.apiKey = '';
      this.header.setApiStatus(status);
      if (!silent) {
        this.toast.show('Proxy token required to contact API');
      }
      await this.refreshModels({ silent: true });
      return status;
    }

    const status = await testApiKey(this.state.endpoint, { token: this.state.proxyToken });
    this.state.apiKey = status.ok ? 'loaded-from-proxy' : '';
    this.header.setApiStatus(status);
    await this.refreshModels({ silent });
    return status;
  }

  async refreshModels({ silent } = {}) {
    let models = DEFAULT_MODELS;

    if (this.state.endpoint && this.state.proxyToken) {
      try {
        const fetched = await fetchModels(this.state.endpoint, {
          busy: this.overlay,
          token: this.state.proxyToken
        });
        if (fetched && fetched.length > 0) {
          models = fetched;
        }
      } catch (error) {
        console.error('Error fetching models:', error);
        if (!silent) {
          this.toast.show('Failed to fetch models, using defaults');
        }
      }
    } else if (this.state.endpoint && !silent) {
      this.toast.show('Proxy token required for remote models');
    }

    this.header.setModelOptions(models, this.state.model);
    const { model } = this.header.getSettings();
    this.state.model = model;
    return models;
  }

  updateMetrics() {
    const metrics = computeMetrics(this.editor.getText());
    this.editor.setMetrics(metrics);
  }

  renderSuggestions() {
    this.sidebar.render(this.state.suggestions, {
      onApply: (suggestion) => this.applySuggestion(suggestion),
      onSelect: (suggestion) => this.selectSuggestion(suggestion),
      getSourceText: () => this.editor.getText()
    });
  }

  applySuggestion(suggestion) {
    const text = this.editor.getText();
    if (
      typeof suggestion.start === 'number' &&
      typeof suggestion.end === 'number' &&
      suggestion.fixText != null
    ) {
      const updated = text.slice(0, suggestion.start) + suggestion.fixText + text.slice(suggestion.end);
      this.applyText(updated, { pushUndo: true });
      const newEnd = suggestion.start + suggestion.fixText.length;
      this.editor.selectRange(suggestion.start, newEnd);
      this.toast.show('Applied fix');
      this.scheduleAnalyse();
    } else {
      this.toast.show('No automatic fix; edit manually');
    }
  }

  selectSuggestion(suggestion) {
    if (typeof suggestion.start !== 'number' || typeof suggestion.end !== 'number') {
      this.toast.show('No selection data');
      return;
    }
    const limit = this.editor.getText().length;
    this.editor.selectRange(suggestion.start, Math.min(suggestion.end, limit));
    this.toast.show('Selected');
  }

  applyAll() {
    const all = [
      ...this.state.suggestions.grammar,
      ...this.state.suggestions.clarity,
      ...this.state.suggestions.tone
    ].filter((suggestion) => suggestion.fixText != null && typeof suggestion.start === 'number');

    if (all.length === 0) {
      this.toast.show('Nothing to apply');
      return;
    }

    const text = this.editor.getText();
    const sorted = all.sort((a, b) => b.start - a.start);
    let updated = text;

    sorted.forEach((suggestion) => {
      updated =
        updated.slice(0, suggestion.start) + suggestion.fixText + updated.slice(suggestion.end);
    });

    this.applyText(updated, { pushUndo: true });
    this.toast.show(`Applied ${sorted.length} fixes`);
    this.scheduleAnalyse();
  }

  scheduleAnalyse() {
    clearTimeout(this.analyseTimer);
    this.analyseTimer = setTimeout(() => {
      this.analyse();
    }, 160);
  }

  async analyse() {
    const raw = this.editor.getText();
    const normalised = normaliseText(raw);
    if (normalised !== raw) {
      this.applyText(normalised, { pushUndo: true });
    }

    const text = this.editor.getText();
    this.state.lastText = text;

    const token = ++this.analysisCounter;
    const suggestions = {
      grammar: [],
      clarity: [],
      tone: [],
      rewrite: this.state.suggestions.rewrite || []
    };

    const heuristics = runHeuristics(text);
    suggestions.grammar = heuristics.grammar;
    suggestions.clarity = heuristics.clarity;
    suggestions.tone = heuristics.tone;

    if (this.state.useLLM && !this.state.proxyToken) {
      if (!this.llmTokenWarningShown) {
        this.toast.show('Proxy token required for LLM analysis');
        this.llmTokenWarningShown = true;
      }
    } else if (this.state.useLLM) {
      try {
        const llm = await analyseTextWithLLM(text, {
          endpoint: this.state.endpoint,
          model: this.state.model,
          busy: this.overlay,
          token: this.state.proxyToken
        });
        ['grammar', 'clarity', 'tone'].forEach((key) => {
          suggestions[key] = [...suggestions[key], ...(llm[key] || [])];
        });
      } catch (error) {
        console.warn('LLM analysis failed', error);
        this.toast.show('LLM analysis failed; showing local checks');
      }
    }

    if (token !== this.analysisCounter) {
      return;
    }

    this.state.suggestions = suggestions;
    this.renderSuggestions();
  }

  async doRewrite(mode) {
    const text = this.editor.getText().trim();
    if (!text) {
      this.toast.show('Nothing to rewrite');
      return;
    }

    if (this.state.useLLM && !this.state.proxyToken) {
      if (!this.llmTokenWarningShown) {
        this.toast.show('Proxy token required for LLM rewrite');
        this.llmTokenWarningShown = true;
      }
    } else if (this.state.useLLM) {
      try {
        const rewritten = await rewriteWithLLM(text, mode, {
          endpoint: this.state.endpoint,
          model: this.state.model,
          busy: this.overlay,
          token: this.state.proxyToken
        });
        if (rewritten) {
          this.applyText(rewritten, { pushUndo: true });
          this.scheduleAnalyse();
          this.toast.show('Rewritten');
          return;
        }
      } catch (error) {
        console.warn('LLM rewrite failed; using demo rewrite', error);
        this.toast.show('LLM rewrite failed; using demo rewrite');
      }
    }

    let output = text;
    if (mode === 'simplify') {
      output = output
        .replace(/\butilise\b/gi, 'use')
        .replace(/\bapproximately\b/gi, 'about')
        .replace(/\bsubsequently\b/gi, 'then')
        .replace(/\bcommence\b/gi, 'start');
    } else if (mode === 'formal') {
      output = output
        .replace(/\b(very|really|quite|sort of|kind of)\b/gi, '')
        .replace(/\bgot\b/gi, 'received')
        .replace(/\bhelp\b/gi, 'assist')
        .replace(/\bfix\b/gi, 'resolve');
    } else if (mode === 'friendly') {
      output = output
        .replace(/\bhowever\b/gi, 'but')
        .replace(/\btherefore\b/gi, 'so')
        .replace(/\bnevertheless\b/gi, 'still');
    }

    this.applyText(output, { pushUndo: true });
    this.scheduleAnalyse();
    this.toast.show('Demo rewrite complete');
  }

  exportMarkdown() {
    const text = this.editor.getText();
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'draft.md';
    anchor.click();
    URL.revokeObjectURL(url);
    this.toast.show('Exported as draft.md');
  }

  copyToClipboard() {
    const text = this.editor.getText();
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.toast.show('Copied');
      }).catch(() => {
        this.fallbackCopy();
      });
    } else {
      this.fallbackCopy();
    }
  }

  fallbackCopy() {
    const textarea = this.editor.textarea;
    textarea.select();
    document.execCommand('copy');
    this.toast.show('Copied');
  }

  async pasteClean() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        this.toast.show('Clipboard is empty');
        return;
      }
      const clean = normaliseText(text);
      this.applyText(clean, { pushUndo: true });
      this.scheduleAnalyse();
      this.toast.show('Pasted & cleaned');
    } catch (error) {
      console.warn('Clipboard access blocked', error);
      this.toast.show('Clipboard blocked by browser');
    }
  }
  }

  ns.app = ns.app || {};
  ns.app.initApp = function initApp(root) {
    const app = new GrammarApp(root);
    app.init();
    return app;
  };
})(window.CG = window.CG || {});
