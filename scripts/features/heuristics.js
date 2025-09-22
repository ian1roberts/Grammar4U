;(function (ns) {
  const { escapeHtml } = ns.utils.dom;

  function makeSuggestion({ id, type, severity, message, start, end, fixText, previewHtml }) {
    return {
      id,
      type,
      severity,
      message,
      start,
      end,
      fixText,
      preview: (source) => previewHtml ?? escapeHtml(source.slice(Math.max(0, start - 40), end + 40))
    };
  }

  function findRepeats(text) {
    const suggestions = [];
    const regex = /\b(\w+)\s+(\1)\b/gi;
    let match;

    while ((match = regex.exec(text))) {
      const [span, first, second] = match;
      suggestions.push(makeSuggestion({
        id: `repeat-${match.index}`,
        type: 'grammar',
        severity: 'medium',
        message: `Repeated word: “${first} ${second}”`,
        start: match.index,
        end: match.index + span.length,
        fixText: first,
        previewHtml: `${escapeHtml(span).replace(/ /, ' ')} → <mark class="remove">${escapeHtml(span)}</mark> <mark class="add">${escapeHtml(first)}</mark>`
      }));
    }

    return suggestions;
  }

  function findSpaces(text) {
    const suggestions = [];
    const regex = /([^\S\r\n]{2,})/g;
    let match;

    while ((match = regex.exec(text))) {
      suggestions.push(makeSuggestion({
        id: `space-${match.index}`,
        type: 'grammar',
        severity: 'low',
        message: 'Multiple spaces detected',
        start: match.index,
        end: match.index + match[0].length,
        fixText: ' ',
        previewHtml: `<mark class="remove">${escapeHtml('·'.repeat(match[0].length))}</mark> → <mark class="add">${escapeHtml('·')}</mark>`
      }));
    }

    return suggestions;
  }

  function britishSpelling(text) {
    const pairs = [
      ['color', 'colour'],
      ['organize', 'organise'],
      ['analyze', 'analyse'],
      ['favor', 'favour'],
      ['center', 'centre']
    ];

    const suggestions = [];

    pairs.forEach(([us, uk]) => {
      const regex = new RegExp(`\\b${us}\\b`, 'gi');
      let match;

      while ((match = regex.exec(text))) {
        suggestions.push(makeSuggestion({
          id: `brit-${match.index}-${us}`,
          type: 'grammar',
          severity: 'low',
          message: `Prefer British “${uk}” over “${match[0]}”`,
          start: match.index,
          end: match.index + match[0].length,
          fixText: uk,
          previewHtml: `<mark class="remove">${match[0]}</mark> → <mark class="add">${uk}</mark>`
        }));
      }
    });

    return suggestions;
  }

  function oxfordComma(text) {
    const suggestions = [];
    const regex = /\b([A-Za-z]{2,})(, [A-Za-z]{2,})+ and [A-Za-z]{2,}\b/g;
    let match;

    while ((match = regex.exec(text))) {
      const span = match[0];
      if (span.includes(', and')) {
        continue;
      }

      suggestions.push(makeSuggestion({
        id: `ox-${match.index}`,
        type: 'clarity',
        severity: 'low',
        message: 'Consider Oxford comma',
        start: match.index,
        end: match.index + span.length,
        fixText: span.replace(' and', ', and'),
        previewHtml: `${escapeHtml(span).replace(' and', ' <mark class="add">,</mark> and')}`
      }));
    }

    return suggestions;
  }

  function passiveVoice(text) {
    const suggestions = [];
    const regex = /\b(?:is|was|were|been|being|are|be)\s+\w+ed\b/gi;
    let match;
    let counter = 0;

    while ((match = regex.exec(text)) && counter < 12) {
      counter += 1;
      suggestions.push(makeSuggestion({
        id: `pass-${match.index}`,
        type: 'tone',
        severity: 'low',
        message: `Possible passive voice: “${match[0]}”`,
        start: match.index,
        end: match.index + match[0].length,
        fixText: null,
        previewHtml: `<mark class="warn">${match[0]}</mark>`
      }));
    }

    return suggestions;
  }

  function runHeuristics(text) {
    return {
      grammar: [...findRepeats(text), ...findSpaces(text), ...britishSpelling(text)],
      clarity: [...oxfordComma(text)],
      tone: [...passiveVoice(text)]
    };
  }

  ns.features = ns.features || {};
  ns.features.heuristics = { runHeuristics };
})(window.CG = window.CG || {});
