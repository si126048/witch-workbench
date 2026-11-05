import zh from './uiText.zh.json' with { type: 'json' };

/** Shared renderer/main-process catalog. Values are interpolated once, never translated. */
export function interfaceLanguage() {
  const locale = typeof window !== 'undefined'
    ? (window.electronAPI?.uiLanguage ?? document.documentElement.lang)
    : (typeof process !== 'undefined' ? process.env.NIGHTFALL_UI_LANGUAGE : 'zh');
  return locale?.startsWith('en') ? 'en' : 'zh-CN';
}

export function uiText(message, values = {}, language = interfaceLanguage()) {
  const translated = language.startsWith('en') ? message : (zh[message] ?? message);
  return translated.replace(/\{(value\d+)\}/g, (placeholder, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : placeholder);
}
