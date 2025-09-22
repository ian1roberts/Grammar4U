;(function (ns) {
  function createHeader() {
    const header = document.createElement('header');
    header.innerHTML = `
      <div class="bar">
        <div class="logo"><span class="dot"></span> Coding Grammar4U <span class="badge">Local</span></div>
        <div class="pill"><span>API Key</span><span data-status="api-key" class="status-indicator">Checking...</span></div>
        <div class="pill"><span>Model</span>
          <select data-role="model"></select>
          <button data-action="refresh-models" class="btn ghost" style="margin-left:8px;padding:6px 10px;font-size:12px" title="Refresh available models from API">↻</button>
          <span data-status="cache" class="status-indicator" style="margin-left:8px;color:var(--success);font-size:11px" title="Prompt caching enabled to reduce API costs">⚡ Cached</span>
        </div>
        <div class="pill"><span>Endpoint</span><input data-role="endpoint" placeholder="http://localhost:3333" style="width:230px"></div>
        <label class="pill" title="If off, runs in on-device demo mode"><input data-role="use-llm" type="checkbox"> Use OpenAI</label>
        <button data-action="save-settings" class="btn">Save settings</button>
      </div>
    `;

    const modelSelect = header.querySelector('[data-role="model"]');
    const endpointInput = header.querySelector('[data-role="endpoint"]');
    const useLLMCheckbox = header.querySelector('[data-role="use-llm"]');
    const saveButton = header.querySelector('[data-action="save-settings"]');
    const refreshButton = header.querySelector('[data-action="refresh-models"]');
    const apiKeyStatus = header.querySelector('[data-status="api-key"]');

    function setModelOptions(models, selected) {
      modelSelect.innerHTML = '';
      models.forEach((model) => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name;
        modelSelect.appendChild(option);
      });

      if (selected && models.some((model) => model.id === selected)) {
        modelSelect.value = selected;
      } else if (models.length > 0) {
        modelSelect.value = models[0].id;
      }
    }

    function setApiStatus({ status, message }) {
      apiKeyStatus.className = `status-indicator ${status}`;
      apiKeyStatus.textContent = message;
    }

    function getSettings() {
      return {
        model: modelSelect.value,
        endpoint: endpointInput.value.trim(),
        useLLM: useLLMCheckbox.checked
      };
    }

    function setSettings({ model, endpoint, useLLM }) {
      if (typeof endpoint === 'string') {
        endpointInput.value = endpoint;
      }
      if (typeof useLLM === 'boolean') {
        useLLMCheckbox.checked = useLLM;
      }
      if (typeof model === 'string') {
        modelSelect.value = model;
      }
    }

    return {
      element: header,
      getSettings,
      setSettings,
      setModelOptions,
      setApiStatus,
      onSave(handler) {
        saveButton.addEventListener('click', handler);
      },
      onRefresh(handler) {
        refreshButton.addEventListener('click', handler);
      },
      onModelChange(handler) {
        modelSelect.addEventListener('change', handler);
      },
      onToggleLLM(handler) {
        useLLMCheckbox.addEventListener('change', handler);
      }
    };
  }

  ns.components = ns.components || {};
  ns.components.createHeader = createHeader;
})(window.CG = window.CG || {});
