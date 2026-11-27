/** Only voice engines Chrome explicitly identifies as local are eligible. */
export const MAX_SPOKEN_RESULT_LENGTH = 1600;

type SpeechOptions = {
 language?: string;
 onError?: (error: SpeechSynthesisErrorCode | 'unavailable') => void;
};
type QueueStatus = 'queued' | 'unavailable' | 'empty';

function selectLocalVoice(engine: SpeechSynthesis, language: string) {
 const local = engine.getVoices().filter(voice => voice.localService === true);
 const requested = language.toLowerCase();
 const base = requested.split('-')[0];
 return local.find(voice => voice.lang.toLowerCase() === requested)
  ?? local.find(voice => voice.lang.toLowerCase().split('-')[0] === base)
  ?? local.find(voice => voice.default === true)
  ?? local[0];
}

function boundedResult(text: string) {
 const normalized = text.slice(0, MAX_SPOKEN_RESULT_LENGTH).replace(/\s+/g, ' ').trim();
 // A truncated UTF-16 string can end in half of a supplementary character.
 return normalized.replace(/[\uD800-\uDBFF]$/u, '');
}

export function createResultSpeech() {
 let active: { engine: SpeechSynthesis; utterance: SpeechSynthesisUtterance } | undefined;

 function cancel() {
  const previous = active;
  if (!previous) return;
  active = undefined;
  previous.utterance.onend = null;
  previous.utterance.onerror = null;
  try { previous.engine.cancel(); } catch { /* Device speech is optional. */ }
 }

 function languagePreference() {
  return globalThis.navigator?.language || 'en';
 }

 function hasLocalVoice(language = languagePreference()) {
  try {
   return typeof globalThis.SpeechSynthesisUtterance === 'function'
    && !!globalThis.speechSynthesis
    && !!selectLocalVoice(globalThis.speechSynthesis, language);
  } catch { return false; }
 }

 function speak(text: string, { language = languagePreference(), onError }: SpeechOptions = {}): QueueStatus {
  cancel();
  const content = boundedResult(text);
  if (!content) return 'empty';
  try {
   const engine = globalThis.speechSynthesis;
   if (!engine || typeof globalThis.SpeechSynthesisUtterance !== 'function') return 'unavailable';
   const voice = selectLocalVoice(engine, language);
   if (!voice) return 'unavailable';
   const utterance = new SpeechSynthesisUtterance(content);
   utterance.voice = voice;
   utterance.lang = voice.lang;
   utterance.onend = () => {
    if (active?.utterance === utterance) active = undefined;
   };
   utterance.onerror = event => {
    if (active?.utterance !== utterance) return;
    active = undefined;
    if (event.error !== 'canceled' && event.error !== 'interrupted') onError?.(event.error);
   };
   active = { engine, utterance };
   engine.speak(utterance);
   return 'queued';
  } catch {
   cancel();
   return 'unavailable';
  }
 }

 return { hasLocalVoice, speak, cancel };
}
