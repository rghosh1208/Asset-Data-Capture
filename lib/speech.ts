// Voice notes via the Web Speech API. Hands are often full or dirty in the
// field, so dictating notes beats thumb-typing. Support is best-effort: iOS
// Safari and Chrome expose it under the webkit prefix; where it's missing we
// simply hide the mic button.

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function getCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function speechSupported(): boolean {
  return getCtor() !== null;
}

export interface DictationHandle {
  stop: () => void;
}

/**
 * Start dictation. onTranscript fires with the full text accumulated so far
 * (final segments joined with the latest interim segment) so the caller can
 * live-update a textarea. onEnd fires when recognition stops for any reason.
 */
export function startDictation(
  onTranscript: (text: string, isFinal: boolean) => void,
  onEnd?: () => void,
): DictationHandle | null {
  const Ctor = getCtor();
  if (!Ctor) return null;

  const rec = new Ctor();
  rec.lang = 'en-US';
  rec.continuous = true;
  rec.interimResults = true;

  let finalText = '';

  rec.onresult = (e: any) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const seg = e.results[i];
      const txt = seg[0]?.transcript ?? '';
      if (seg.isFinal) finalText += txt;
      else interim += txt;
    }
    const combined = (finalText + interim).replace(/\s+/g, ' ').trimStart();
    onTranscript(combined, interim === '');
  };

  rec.onerror = () => {
    /* surfaced via onend; nothing actionable here */
  };
  rec.onend = () => {
    if (onEnd) onEnd();
  };

  try {
    rec.start();
  } catch {
    return null;
  }

  return {
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    },
  };
}
