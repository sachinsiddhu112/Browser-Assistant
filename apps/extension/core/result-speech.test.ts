import { afterEach, describe, expect, it, vi } from 'vitest';
import { createResultSpeech, MAX_SPOKEN_RESULT_LENGTH } from './result-speech';

class Utterance {
 voice?: SpeechSynthesisVoice;
 lang?: string;
 onend: (() => void) | null = null;
 onerror: ((event: { error: SpeechSynthesisErrorCode }) => void) | null = null;
 constructor(readonly text: string) {}
}

function setup(voices: { lang: string; localService: boolean; default?: boolean }[]) {
 const engine = { getVoices: vi.fn(() => voices), speak: vi.fn<(utterance: Utterance) => void>(), cancel: vi.fn() };
 vi.stubGlobal('speechSynthesis', engine);
 vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
 return engine;
}

afterEach(() => vi.unstubAllGlobals());

describe('result speech', () => {
 it('never queues speech unless Chrome exposes a voice explicitly marked local', () => {
  const engine = setup([{ lang: 'en-US', localService: false, default: true }]);
  const speaker = createResultSpeech();
  expect(speaker.hasLocalVoice()).toBe(false);
  expect(speaker.speak('Do not send this elsewhere.')).toBe('unavailable');
  expect(engine.speak).not.toHaveBeenCalled();
  expect(engine.cancel).not.toHaveBeenCalled();
 });

 it('selects a local language match rather than the matching remote voice', () => {
  const local = { lang: 'en-GB', localService: true };
  const engine = setup([{ lang: 'en-US', localService: false }, { lang: 'fr-FR', localService: true, default: true }, local]);
  const speaker = createResultSpeech();
  expect(speaker.speak('The comparison is ready.', { language: 'en-US' })).toBe('queued');
  expect(engine.speak).toHaveBeenCalledWith(expect.objectContaining({ voice: local, lang: 'en-GB' }));
 });

 it('bounds speech without leaving an invalid partial Unicode character', () => {
  const engine = setup([{ lang: 'en-US', localService: true }]);
  const speaker = createResultSpeech();
  expect(speaker.speak('x'.repeat(MAX_SPOKEN_RESULT_LENGTH - 1) + '🙂 then more')).toBe('queued');
  expect(engine.speak.mock.calls[0]![0].text).toBe('x'.repeat(MAX_SPOKEN_RESULT_LENGTH - 1));
  expect(speaker.speak(' \n  \t ')).toBe('empty');
  expect(engine.speak).toHaveBeenCalledTimes(1);
 });

 it('cancels owned speech only, disregarding callbacks from superseded utterances', () => {
  const engine = setup([{ lang: 'en-US', localService: true }]);
  const onError = vi.fn();
  const speaker = createResultSpeech();
  speaker.cancel();
  expect(engine.cancel).not.toHaveBeenCalled();
  speaker.speak('First answer', { onError });
  const stale = engine.speak.mock.calls[0]![0].onerror;
  speaker.speak('New answer', { onError });
  stale?.({ error: 'audio-hardware' });
  expect(onError).not.toHaveBeenCalled();
  engine.speak.mock.calls[1]![0].onerror?.({ error: 'not-allowed' });
  expect(onError).toHaveBeenCalledWith('not-allowed');
  speaker.cancel();
  expect(engine.cancel).toHaveBeenCalledTimes(1);
 });

 it('rechecks voices when speech is requested, allowing Chrome to populate them after startup', () => {
  const voices: { lang: string; localService: boolean }[] = [];
  const engine = setup(voices);
  const speaker = createResultSpeech();
  expect(speaker.hasLocalVoice()).toBe(false);
  voices.push({ lang: 'en-US', localService: true });
  expect(speaker.hasLocalVoice()).toBe(true);
  expect(speaker.speak('Ready now.')).toBe('queued');
  expect(engine.speak).toHaveBeenCalledTimes(1);
 });

 it('preserves the text-only workflow when speech is absent or throws', () => {
  const speaker = createResultSpeech();
  vi.stubGlobal('speechSynthesis', undefined);
  expect(speaker.speak('Read me.')).toBe('unavailable');
  const engine = setup([{ lang: 'en-US', localService: true }]);
  engine.speak.mockImplementation(() => { throw new Error('Test audio device failed'); });
  expect(speaker.speak('Read me.')).toBe('unavailable');
  expect(engine.cancel).toHaveBeenCalledTimes(1);
 });
});
