import {
  Score,
  Measure,
  Pitch,
  NoteEvent,
  TimeSignature,
  HandTemplate,
  NoteStep,
  AccidentalType,
  NoteDuration,
} from '../types/score';

/**
 * Format a Pitch into clean letter notation matching the custom Pianotastic format.
 * Examples: "C", "D#", "Eb", "F#", "G", "Ab", "B"
 */
export function formatNoteLetter(pitch: Pitch): string {
  if (!pitch || !pitch.step) return '—';
  let acc = '';
  if (pitch.accidental === 'sharp') acc = '#';
  else if (pitch.accidental === 'flat') acc = 'b';
  else if (pitch.accidental === 'double_sharp') acc = '##';
  else if (pitch.accidental === 'double_flat') acc = 'bb';
  return `${pitch.step}${acc}`;
}

/**
 * Total number of beat columns in a measure based on its time signature.
 */
export function getMeasureTotalBeats(measure: Measure, defaultTs: TimeSignature): number {
  if (measure.timeSignature?.numerator) {
    return measure.timeSignature.numerator;
  }
  return defaultTs?.numerator || 4;
}

/**
 * Determines whether a specific beat in Measure 1 is locked by the Pickup Beat setting.
 * When pickupBeat = 3, Beat 1 and Beat 2 (index 0 and 1) are locked.
 */
export function isBeatLockedByPickup(
  measureNumber: number,
  beatIndex: number,
  pickupBeat: number = 1
): boolean {
  if (measureNumber !== 1) return false;
  const pBeat = Math.max(1, pickupBeat);
  return beatIndex + 1 < pBeat;
}

/**
 * Finds the first editable position in the score taking into account pickup beats.
 */
export function getFirstEditablePosition(score: Score): {
  measureId: string;
  beatIndex: number;
  subBeatIndex: number;
} {
  if (!score.measures || score.measures.length === 0) {
    return { measureId: '', beatIndex: 0, subBeatIndex: 0 };
  }
  const firstMeasure = score.measures[0];
  const pickupBeat = score.metadata.pickupBeat || 1;
  const totalBeats = getMeasureTotalBeats(firstMeasure, score.metadata.initialTimeSignature);
  // pickupBeat is 1-based (e.g. 3 -> beatIndex 2)
  const initialBeatIndex = Math.min(totalBeats - 1, Math.max(0, pickupBeat - 1));
  return {
    measureId: firstMeasure.id,
    beatIndex: initialBeatIndex,
    subBeatIndex: 0,
  };
}

/**
 * Returns the effective Value (notes per beat: 1, 2, 3, or 4) for a given beat.
 * The Value setting begins applying from the beat where it was changed onward.
 * Previous beats strictly retain their original Value.
 */
export function getEffectiveBeatValue(
  score: Score,
  measureIndex: number,
  beatIndex: number
): number {
  if (!score.measures || score.measures.length === 0) return 1;

  // Scan backwards from (measureIndex, beatIndex) to find the most recent explicit Value
  for (let mIdx = measureIndex; mIdx >= 0; mIdx--) {
    const measure = score.measures[mIdx];
    if (!measure) continue;
    const totalBeats = getMeasureTotalBeats(measure, score.metadata.initialTimeSignature);
    const startBeat = mIdx === measureIndex ? beatIndex : totalBeats - 1;

    for (let b = startBeat; b >= 0; b--) {
      const explicitVal = measure.beatValues?.[b];
      if (explicitVal && [1, 2, 3, 4].includes(explicitVal)) {
        return explicitVal;
      }
    }
  }

  return 1; // Default is 1 note per beat
}

/**
 * Extracts note pitches for each beat of a measure.
 * Falls back to converting legacy or imported rhEvents/lhEvents if beatNotes is not yet set.
 */
export function getMeasureBeatPitches(
  measure: Measure,
  totalBeats: number,
  handTemplate: HandTemplate = 'Both'
): Pitch[][] {
  const result: Pitch[][] = [];

  // 1. If explicit beatNotes exists, return it
  if (measure.beatNotes && Object.keys(measure.beatNotes).length > 0) {
    for (let b = 0; b < totalBeats; b++) {
      result.push(measure.beatNotes[b] || []);
    }
    return result;
  }

  // 2. Otherwise derive from rhEvents (or lhEvents if LH-only)
  const events = handTemplate === 'LH' ? measure.lhEvents : measure.rhEvents;
  const beatBuckets: Pitch[][] = Array.from({ length: totalBeats }, () => []);

  if (events && events.length > 0) {
    let currentBeatAcc = 0;
    for (const ev of events) {
      if (ev.type === 'note' && ev.pitches && ev.pitches.length > 0) {
        const beatIdx = Math.floor(currentBeatAcc);
        if (beatIdx >= 0 && beatIdx < totalBeats) {
          beatBuckets[beatIdx].push(...ev.pitches);
        }
      }
      // Calculate duration in quarter beats
      let beatLen = 1;
      if (ev.duration === 'whole') beatLen = 4;
      else if (ev.duration === 'half') beatLen = 2;
      else if (ev.duration === 'quarter') beatLen = 1;
      else if (ev.duration === 'eighth') beatLen = 0.5;
      else if (ev.duration === 'sixteenth') beatLen = 0.25;
      if (ev.isDotted) beatLen *= 1.5;
      currentBeatAcc += beatLen;
    }
  }

  for (let b = 0; b < totalBeats; b++) {
    result.push(beatBuckets[b]);
  }

  return result;
}

/**
 * Synchronize rhEvents and lhEvents with beatNotes so that audioEngine playback,
 * MIDI generation, and MusicXML export stay 100% playable and valid.
 */
export function syncMeasureEventsFromBeatData(
  measure: Measure,
  defaultTs: TimeSignature,
  handTemplate: HandTemplate = 'Both'
): Measure {
  const totalBeats = getMeasureTotalBeats(measure, defaultTs);
  const rhEvents: NoteEvent[] = [];
  const lhEvents: NoteEvent[] = [];

  const now = Date.now();

  for (let b = 0; b < totalBeats; b++) {
    const pitches = measure.beatNotes?.[b] || [];
    const lyric = measure.beatLyrics?.[b];
    const value = measure.beatValues?.[b] || 1;

    if (pitches.length === 0) {
      // Empty beat: insert rest
      if (handTemplate !== 'LH') {
        rhEvents.push({
          id: `rh_${measure.id}_b${b}_rest`,
          type: 'rest',
          pitches: [],
          duration: 'quarter',
          lyricSyllable: lyric,
        });
      }
      if (handTemplate !== 'RH') {
        lhEvents.push({
          id: `lh_${measure.id}_b${b}_rest`,
          type: 'rest',
          pitches: [],
          duration: 'quarter',
        });
      }
    } else {
      // Notes entered: create NoteEvents according to note count / value
      const duration: NoteDuration =
        pitches.length === 1 ? 'quarter' : pitches.length === 2 ? 'eighth' : 'sixteenth';

      pitches.forEach((p, pIdx) => {
        const evId = `rh_${measure.id}_b${b}_n${pIdx}_${now}`;
        if (handTemplate !== 'LH') {
          rhEvents.push({
            id: evId,
            type: 'note',
            pitches: [p],
            duration,
            lyricSyllable: pIdx === 0 ? lyric : undefined,
          });
        }
        if (handTemplate !== 'RH') {
          lhEvents.push({
            id: `lh_${measure.id}_b${b}_n${pIdx}_${now}`,
            type: 'note',
            pitches: [{ ...p, octave: Math.max(1, p.octave - 1) }], // lh accompaniment an octave lower
            duration,
          });
        }
      });
    }
  }

  return {
    ...measure,
    rhEvents: handTemplate === 'LH' ? [] : rhEvents,
    lhEvents: handTemplate === 'RH' ? [] : lhEvents,
  };
}

/**
 * Calculates the next cursor position after entering a note:
 * - If current beat requires more notes (for Value 2, 3, or 4), stays on beat and increments subBeatIndex.
 * - If beat is completed, auto-advances to the next beat.
 * - When completing the final beat of a measure, automatically moves to Beat 1 of the next measure.
 */
export function calculateNextCursorPosition(
  score: Score,
  currentMeasureId: string,
  currentBeatIndex: number,
  currentSubBeatIndex: number,
  effectiveValue: number
): {
  nextMeasureId: string;
  nextBeatIndex: number;
  nextSubBeatIndex: number;
  shouldAppendMeasure: boolean;
} {
  // 1. If more notes are needed to complete the current beat's Value:
  if (currentSubBeatIndex + 1 < effectiveValue) {
    return {
      nextMeasureId: currentMeasureId,
      nextBeatIndex: currentBeatIndex,
      nextSubBeatIndex: currentSubBeatIndex + 1,
      shouldAppendMeasure: false,
    };
  }

  // 2. Beat completed! Move to next beat
  const measureIdx = score.measures.findIndex((m) => m.id === currentMeasureId);
  const currentMeasure = score.measures[measureIdx] || score.measures[0];
  const totalBeats = getMeasureTotalBeats(currentMeasure, score.metadata.initialTimeSignature);

  if (currentBeatIndex + 1 < totalBeats) {
    // Move to next beat in current measure
    return {
      nextMeasureId: currentMeasureId,
      nextBeatIndex: currentBeatIndex + 1,
      nextSubBeatIndex: 0,
      shouldAppendMeasure: false,
    };
  }

  // 3. Final beat of measure completed! Move to Beat 1 of next measure
  if (measureIdx + 1 < score.measures.length) {
    const nextMeasure = score.measures[measureIdx + 1];
    return {
      nextMeasureId: nextMeasure.id,
      nextBeatIndex: 0,
      nextSubBeatIndex: 0,
      shouldAppendMeasure: false,
    };
  }

  // 4. We reached the end of the score! Signal to append a new measure
  return {
    nextMeasureId: currentMeasureId,
    nextBeatIndex: 0,
    nextSubBeatIndex: 0,
    shouldAppendMeasure: true,
  };
}
