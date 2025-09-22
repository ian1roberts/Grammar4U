;(function (ns) {
  function normaliseText(text) {
    return text
      .replace(/\r\n?/g, '\n')
      .replace(/\u00A0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'");
  }

  function fleschReadingEase(text) {
    const sentences = Math.max(1, (text.match(/[.!?]+/g) || []).length);
    const words = Math.max(1, (text.trim().split(/\s+/) || []).filter(Boolean).length);

    const syllables = text
      .toLowerCase()
      .split(/\b/)
      .reduce((total, word) => {
        if (!(/^[a-z]+$/.test(word))) {
          return total;
        }
        const clusters = word.replace(/e\b/g, '').match(/[aeiouy]+/g);
        return total + Math.max(1, (clusters || []).length);
      }, 0);

    const score = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function computeMetrics(text) {
    const words = (text.trim().match(/\S+/g) || []).length;
    const chars = text.length;
    const minutes = Math.max(1, Math.round(words / 200));
    const readingEase = fleschReadingEase(text);

    return { words, chars, minutes, readingEase };
  }

  ns.utils = ns.utils || {};
  ns.utils.text = { normaliseText, fleschReadingEase, computeMetrics };
})(window.CG = window.CG || {});
