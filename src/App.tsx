import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Score,
  Measure,
  NoteEvent,
  Pitch,
  ToolMode,
  NoteDuration,
  AccidentalType,
  SelectionState,
  Hand,
  TimeSignature,
  LearningLayerSettings,
  DEFAULT_LEARNING_LAYER,
  SavedProject,
} from './types/score';
import { SAMPLE_SCORES } from './data/sampleScores';
import { audioEngine } from './services/audioEngine';
import { midiService } from './services/midiService';
import { getStaffStepOffset, pitchFromDiatonicStepValue, getDiatonicStepValue } from './utils/musicTheory';
import { ProjectStorageService, NewScoreConfig } from './services/projectStorageService';
import { ExportService } from './services/exportService';
import {
  getMeasureTotalBeats,
  isBeatLockedByPickup,
  getEffectiveBeatValue,
  calculateNextCursorPosition,
  syncMeasureEventsFromBeatData,
} from './utils/pianotasticNotation';

// Components
import { Header } from './components/layout/Header';
import { MainToolbar } from './components/toolbar/MainToolbar';
import { LeftToolPalette } from './components/palette/LeftToolPalette';
import { NotationRenderer } from './components/notation/NotationRenderer';
import { BeatValueBar } from './components/editor/BeatValueBar';
import { PropertiesPanel } from './components/properties/PropertiesPanel';
import { BottomPlaybackBar } from './components/playback/BottomPlaybackBar';
import { VirtualPiano } from './components/piano/VirtualPiano';
import { HomeScreen } from './components/home/HomeScreen';

// Modals
import { CustomTimeSignatureModal } from './components/modals/CustomTimeSignatureModal';
import { ChordDialogModal } from './components/modals/ChordDialogModal';
import { KeyboardShortcutsModal } from './components/modals/KeyboardShortcutsModal';
import { MeasureContextMenu } from './components/modals/MeasureContextMenu';
import { NavigationPalette } from './components/navigation/NavigationPalette';
import { MidiDeviceModal } from './components/midi/MidiDeviceModal';
import { NewScoreSetupModal } from './components/modals/NewScoreSetupModal';

export default function App() {
  // Navigation & Startup view state: start on Project/Home screen
  const [viewMode, setViewMode] = useState<'home' | 'editor'>('home');
  const [isNewScoreModalOpen, setIsNewScoreModalOpen] = useState(false);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>(() =>
    ProjectStorageService.getSavedProjects()
  );

  // Score state
  const [score, setScore] = useState<Score>(() => {
    const projects = ProjectStorageService.getSavedProjects();
    return projects[0]?.score || SAMPLE_SCORES.etude;
  });

  // Undo / Redo history
  const [history, setHistory] = useState<Score[]>([score]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Tools & Entry state
  const [toolMode, setToolMode] = useState<ToolMode>('note');
  const [selectedDuration, setSelectedDuration] = useState<NoteDuration>('quarter');
  const [isDotted, setIsDotted] = useState(false);
  const [selectedAccidental, setSelectedAccidental] = useState<AccidentalType | null>(null);
  const [activeHand, setActiveHand] = useState<Hand>('RH');

  // Selection state
  const [selection, setSelection] = useState<SelectionState>({
    measureId: 'm1',
    staff: 'RH',
    eventId: null,
    beatIndex: 0,
    subBeatIndex: 0,
  });

  // Playback & Input UI state
  const [playbackPosition, setPlaybackPosition] = useState<{ measureIndex: number; beat: number } | null>(null);
  const [isVirtualPianoOpen, setIsVirtualPianoOpen] = useState(true);

  // Modals state
  const [isCustomTimeSigOpen, setIsCustomTimeSigOpen] = useState(false);
  const [isChordDialogOpen, setIsChordDialogOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ measure: Measure; x: number; y: number } | null>(null);
  const [navigationModalMeasure, setNavigationModalMeasure] = useState<Measure | null>(null);
  const [isMidiModalOpen, setIsMidiModalOpen] = useState(false);
  const [midiMode, setMidiMode] = useState<'playback' | 'entry'>('entry');
  const [quantization, setQuantization] = useState('quarter');
  const [selectedChannel, setSelectedChannel] = useState(0);
  const [velocitySensitive, setVelocitySensitive] = useState(true);

  // Push score to undo stack
  const pushScoreState = useCallback((newScore: Score) => {
    setHistory((prev) => {
      const upToCurrent = prev.slice(0, historyIndex + 1);
      return [...upToCurrent, newScore];
    });
    setHistoryIndex((prev) => prev + 1);
    setScore(newScore);
  }, [historyIndex]);

  // Undo / Redo
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setScore(history[newIndex]);
    }
  }, [historyIndex, history]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setScore(history[newIndex]);
    }
  }, [historyIndex, history]);

  // Project & Home Screen Lifecycle
  const handleOpenNewPageModal = useCallback(() => {
    setIsNewScoreModalOpen(true);
  }, []);

  const handleCloseNewPageModal = useCallback(() => {
    setIsNewScoreModalOpen(false);
  }, []);

  const handleCreateScore = useCallback((config: NewScoreConfig) => {
    const newScore = ProjectStorageService.createNewScore(config);
    const updatedProjects = ProjectStorageService.saveProject(newScore);
    setSavedProjects(updatedProjects);
    setScore(newScore);
    setHistory([newScore]);
    setHistoryIndex(0);
    const initialBeatIndex = Math.max(0, (newScore.metadata.pickupBeat || 1) - 1);
    setSelection({
      measureId: newScore.measures[0]?.id || 'm1',
      staff: 'RH',
      eventId: null,
      beatIndex: initialBeatIndex,
      subBeatIndex: 0,
    });
    setIsVirtualPianoOpen(true);
    setIsNewScoreModalOpen(false);
    setViewMode('editor');
  }, []);

  const handleSelectProject = useCallback((projectOrScore: SavedProject | Score) => {
    const scoreToLoad: Score =
      'metadata' in projectOrScore && 'measures' in projectOrScore
        ? (projectOrScore as Score)
        : (projectOrScore as SavedProject).score;

    setScore(scoreToLoad);
    setHistory([scoreToLoad]);
    setHistoryIndex(0);
    const initialBeatIndex = Math.max(0, (scoreToLoad.metadata?.pickupBeat || 1) - 1);
    setSelection({
      measureId: scoreToLoad.measures[0]?.id || 'm1',
      staff: 'RH',
      eventId: null,
      beatIndex: initialBeatIndex,
      subBeatIndex: 0,
    });
    setIsVirtualPianoOpen(true);
    setViewMode('editor');
  }, []);

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const importedScore = await ExportService.importJSON(file);
      const updatedProjects = ProjectStorageService.saveProject(importedScore);
      setSavedProjects(updatedProjects);
      handleSelectProject(importedScore);
    } catch (err) {
      console.error('Failed to import project:', err);
    }
  }, [handleSelectProject]);

  const handleDeleteProject = useCallback((projectId: string) => {
    const updated = ProjectStorageService.deleteProject(projectId);
    setSavedProjects(updated);
  }, []);

  const handleNavigateHome = useCallback(() => {
    // Auto-save current project state
    const updated = ProjectStorageService.saveProject(score);
    setSavedProjects(updated);
    // Stop audio playback if active
    audioEngine.stopPlayback();
    setPlaybackPosition(null);
    setViewMode('home');
  }, [score]);

  // Update Score Metadata
  const handleUpdateMetadata = useCallback((patch: Partial<Score['metadata']>) => {
    setScore((prev) => {
      const updated: Score = {
        ...prev,
        metadata: { ...prev.metadata, ...patch },
      };
      pushScoreState(updated);
      return updated;
    });
  }, [pushScoreState]);

  // Update Layout Settings
  const handleUpdateLayout = useCallback((patch: Partial<Score['layoutSettings']>) => {
    setScore((prev) => {
      const updated: Score = {
        ...prev,
        layoutSettings: { ...prev.layoutSettings, ...patch },
      };
      pushScoreState(updated);
      return updated;
    });
  }, [pushScoreState]);

  // Update Measure
  const handleUpdateMeasure = useCallback((measureId: string, patch: Partial<Measure>) => {
    setScore((prev) => {
      const updatedMeasures = prev.measures.map((m) =>
        m.id === measureId ? { ...m, ...patch } : m
      );
      const updated: Score = { ...prev, measures: updatedMeasures };
      pushScoreState(updated);
      return updated;
    });
  }, [pushScoreState]);

  // Update Event
  const handleUpdateEvent = useCallback((
    measureId: string,
    staff: 'RH' | 'LH',
    eventId: string,
    patch: Partial<NoteEvent>
  ) => {
    setScore((prev) => {
      const updatedMeasures = prev.measures.map((m) => {
        if (m.id !== measureId) return m;
        const list = staff === 'RH' ? m.rhEvents : m.lhEvents;
        const updatedList = list.map((ev) =>
          ev.id === eventId ? { ...ev, ...patch } : ev
        );
        return {
          ...m,
          rhEvents: staff === 'RH' ? updatedList : m.rhEvents,
          lhEvents: staff === 'LH' ? updatedList : m.lhEvents,
        };
      });
      const updated: Score = { ...prev, measures: updatedMeasures };
      pushScoreState(updated);
      return updated;
    });
  }, [pushScoreState]);

  // Measure Operations
  const handleAddMeasure = useCallback(() => {
    setScore((prev) => {
      const newNum = prev.measures.length + 1;
      const newMeasure: Measure = {
        id: `m_${Date.now()}`,
        measureNumber: newNum,
        barlineType: 'single',
        chordSymbols: [],
        rhEvents: [
          {
            id: `rh_${Date.now()}`,
            type: 'rest',
            pitches: [],
            duration: 'whole',
          },
        ],
        lhEvents: [
          {
            id: `lh_${Date.now()}`,
            type: 'rest',
            pitches: [],
            duration: 'whole',
          },
        ],
      };
      const updated: Score = {
        ...prev,
        measures: [...prev.measures, newMeasure],
      };
      pushScoreState(updated);
      setSelection({ measureId: newMeasure.id, staff: 'RH', eventId: null });
      return updated;
    });
  }, [pushScoreState]);

  const handleInsertMeasureBefore = useCallback((targetMeasureId: string) => {
    setScore((prev) => {
      const idx = prev.measures.findIndex((m) => m.id === targetMeasureId);
      if (idx === -1) return prev;

      const newMeasure: Measure = {
        id: `m_${Date.now()}`,
        measureNumber: idx + 1,
        barlineType: 'single',
        chordSymbols: [],
        rhEvents: [{ id: `rh_${Date.now()}`, type: 'rest', pitches: [], duration: 'whole' }],
        lhEvents: [{ id: `lh_${Date.now()}`, type: 'rest', pitches: [], duration: 'whole' }],
      };

      const newMeasures = [...prev.measures];
      newMeasures.splice(idx, 0, newMeasure);
      // Renumber
      newMeasures.forEach((m, i) => {
        m.measureNumber = i + 1;
      });

      const updated: Score = { ...prev, measures: newMeasures };
      pushScoreState(updated);
      setSelection({ measureId: newMeasure.id, staff: 'RH', eventId: null });
      return updated;
    });
  }, [pushScoreState]);

  const handleInsertMeasureAfter = useCallback((targetMeasureId: string) => {
    setScore((prev) => {
      const idx = prev.measures.findIndex((m) => m.id === targetMeasureId);
      if (idx === -1) return prev;

      const newMeasure: Measure = {
        id: `m_${Date.now()}`,
        measureNumber: idx + 2,
        barlineType: 'single',
        chordSymbols: [],
        rhEvents: [{ id: `rh_${Date.now()}`, type: 'rest', pitches: [], duration: 'whole' }],
        lhEvents: [{ id: `lh_${Date.now()}`, type: 'rest', pitches: [], duration: 'whole' }],
      };

      const newMeasures = [...prev.measures];
      newMeasures.splice(idx + 1, 0, newMeasure);
      // Renumber
      newMeasures.forEach((m, i) => {
        m.measureNumber = i + 1;
      });

      const updated: Score = { ...prev, measures: newMeasures };
      pushScoreState(updated);
      setSelection({ measureId: newMeasure.id, staff: 'RH', eventId: null });
      return updated;
    });
  }, [pushScoreState]);

  const handleDuplicateMeasure = useCallback((targetMeasureId: string) => {
    setScore((prev) => {
      const idx = prev.measures.findIndex((m) => m.id === targetMeasureId);
      if (idx === -1) return prev;
      const target = prev.measures[idx];

      const cloned: Measure = JSON.parse(JSON.stringify(target));
      cloned.id = `m_${Date.now()}`;
      cloned.rhEvents.forEach((e) => (e.id = `rh_${Math.random()}`));
      cloned.lhEvents.forEach((e) => (e.id = `lh_${Math.random()}`));
      cloned.chordSymbols.forEach((c) => (c.id = `cs_${Math.random()}`));

      const newMeasures = [...prev.measures];
      newMeasures.splice(idx + 1, 0, cloned);
      newMeasures.forEach((m, i) => {
        m.measureNumber = i + 1;
      });

      const updated: Score = { ...prev, measures: newMeasures };
      pushScoreState(updated);
      setSelection({ measureId: cloned.id, staff: 'RH', eventId: null });
      return updated;
    });
  }, [pushScoreState]);

  const handleDeleteMeasure = useCallback((targetMeasureId: string) => {
    setScore((prev) => {
      if (prev.measures.length <= 1) return prev;
      const newMeasures = prev.measures.filter((m) => m.id !== targetMeasureId);
      newMeasures.forEach((m, i) => {
        m.measureNumber = i + 1;
      });
      const updated: Score = { ...prev, measures: newMeasures };
      pushScoreState(updated);
      setSelection({ measureId: newMeasures[0].id, staff: 'RH', eventId: null });
      return updated;
    });
  }, [pushScoreState]);

  const handleClearMeasure = useCallback((targetMeasureId: string) => {
    setScore((prev) => {
      const updatedMeasures = prev.measures.map((m) => {
        if (m.id !== targetMeasureId) return m;
        return {
          ...m,
          chordSymbols: [],
          rhEvents: [{ id: `rh_${Date.now()}`, type: 'rest' as const, pitches: [], duration: 'whole' as const }],
          lhEvents: [{ id: `lh_${Date.now()}`, type: 'rest' as const, pitches: [], duration: 'whole' as const }],
        };
      });
      const updated: Score = { ...prev, measures: updatedMeasures };
      pushScoreState(updated);
      return updated;
    });
  }, [pushScoreState]);

  const handleMeasureWidthChange = useCallback((measureId: string, newWidth: number) => {
    setScore((prev) => {
      const updatedMeasures = prev.measures.map((m) =>
        m.id === measureId ? { ...m, customWidth: newWidth } : m
      );
      return {
        ...prev,
        layoutSettings: { ...prev.layoutSettings, layoutMode: 'manual' },
        measures: updatedMeasures,
      };
    });
  }, []);

  const handleResetLayout = useCallback(() => {
    setScore((prev) => {
      const updatedMeasures = prev.measures.map((m) => ({
        ...m,
        customWidth: undefined,
        systemBreak: false,
        pageBreak: false,
      }));
      const updated: Score = {
        ...prev,
        layoutSettings: {
          ...prev.layoutSettings,
          layoutMode: 'auto',
        },
        measures: updatedMeasures,
      };
      pushScoreState(updated);
      return updated;
    });
  }, [pushScoreState]);

  // Insert Note Event
  const handleInsertNote = useCallback((
    targetMeasureId: string,
    targetStaff: 'RH' | 'LH',
    pitch: Pitch
  ) => {
    // Play pitch for auditory feedback
    audioEngine.playPitch(pitch, score.metadata.initialKeySignature, 0.5);

    setScore((prev) => {
      const updatedMeasures = prev.measures.map((m) => {
        if (m.id !== targetMeasureId) return m;
        const list = targetStaff === 'RH' ? [...m.rhEvents] : [...m.lhEvents];

        // If the only event is a single placeholder rest, replace it
        if (list.length === 1 && list[0].type === 'rest' && list[0].duration === 'whole') {
          list.length = 0;
        }

        const newEvent: NoteEvent = {
          id: `ev_${Date.now()}_${Math.random()}`,
          type: 'note',
          pitches: [pitch],
          duration: selectedDuration,
          isDotted,
          hand: targetStaff,
        };

        list.push(newEvent);

        return {
          ...m,
          rhEvents: targetStaff === 'RH' ? list : m.rhEvents,
          lhEvents: targetStaff === 'LH' ? list : m.lhEvents,
        };
      });

      const updated: Score = { ...prev, measures: updatedMeasures };
      pushScoreState(updated);
      return updated;
    });
  }, [selectedDuration, isDotted, score.metadata.initialKeySignature, pushScoreState]);

  // Change Beat Value (Notes per beat) from active beat forward
  const handleChangeBeatValue = useCallback((newValue: number) => {
    const currentMeasureId = selection.measureId || score.measures[0]?.id;
    const measureIdx = Math.max(0, score.measures.findIndex((m) => m.id === currentMeasureId));
    const currentBeatIndex = selection.beatIndex !== undefined ? selection.beatIndex : 0;

    setScore((prev) => {
      const targetMeasure = prev.measures[measureIdx];
      if (!targetMeasure) return prev;

      const nextBeatValues = {
        ...(targetMeasure.beatValues || {}),
        [currentBeatIndex]: newValue,
      };

      const updatedMeasure: Measure = {
        ...targetMeasure,
        beatValues: nextBeatValues,
      };

      const syncedMeasure = syncMeasureEventsFromBeatData(
        updatedMeasure,
        prev.metadata.initialTimeSignature,
        prev.metadata.handTemplate || 'Both'
      );

      const updatedMeasures = prev.measures.map((m, i) => (i === measureIdx ? syncedMeasure : m));
      const updated: Score = { ...prev, measures: updatedMeasures };
      pushScoreState(updated);
      return updated;
    });

    setSelection((sel) => ({
      ...sel,
      subBeatIndex: 0,
    }));
  }, [selection, score, pushScoreState]);

  // Quick Change Bars Per Line (1 to 6)
  const handleChangeBarsPerLine = useCallback((bars: number) => {
    handleUpdateLayout({ barsPerLine: bars, measuresPerSystemAuto: bars, layoutMode: 'auto' });
  }, [handleUpdateLayout]);

  // Insert Note in Pianotastic Custom Notation Format
  const handlePianotasticNoteInput = useCallback((pitch: Pitch) => {
    const currentMeasureId = selection.measureId || score.measures[0]?.id;
    const measureIdx = Math.max(0, score.measures.findIndex((m) => m.id === currentMeasureId));
    const currentMeasure = score.measures[measureIdx] || score.measures[0];
    if (!currentMeasure) return;

    const pickup = score.metadata.pickupBeat || 1;
    let curBeat =
      selection.beatIndex !== undefined
        ? selection.beatIndex
        : currentMeasure.measureNumber === 1
        ? pickup - 1
        : 0;

    // If locked by pickup beat, advance to first editable beat
    if (isBeatLockedByPickup(currentMeasure.measureNumber, curBeat, pickup)) {
      curBeat = pickup - 1;
    }
    let curSubBeat = selection.subBeatIndex || 0;

    const effectiveVal = getEffectiveBeatValue(score, measureIdx, curBeat);
    if (curSubBeat >= effectiveVal) {
      curSubBeat = 0;
    }

    // Set pitch at subBeatIndex
    const curBeatNotes = [...(currentMeasure.beatNotes?.[curBeat] || [])];
    curBeatNotes[curSubBeat] = pitch;

    const updatedMeasure: Measure = {
      ...currentMeasure,
      beatNotes: {
        ...(currentMeasure.beatNotes || {}),
        [curBeat]: curBeatNotes,
      },
    };

    const syncedMeasure = syncMeasureEventsFromBeatData(
      updatedMeasure,
      score.metadata.initialTimeSignature,
      score.metadata.handTemplate || 'Both'
    );

    // Calculate automatic cursor advancement
    const nextPos = calculateNextCursorPosition(
      score,
      currentMeasureId,
      curBeat,
      curSubBeat,
      effectiveVal
    );

    let newMeasures = score.measures.map((m) => (m.id === currentMeasureId ? syncedMeasure : m));
    let nextMeasureId = nextPos.nextMeasureId;
    let nextBeatIdx = nextPos.nextBeatIndex;
    let nextSubBeatIdx = nextPos.nextSubBeatIndex;

    if (nextPos.shouldAppendMeasure) {
      const newM: Measure = {
        id: `m_${Date.now()}`,
        measureNumber: newMeasures.length + 1,
        barlineType: 'single',
        chordSymbols: [],
        rhEvents: [],
        lhEvents: [],
        beatNotes: {},
        beatValues: {},
        beatLyrics: {},
      };
      const syncedNewM = syncMeasureEventsFromBeatData(
        newM,
        score.metadata.initialTimeSignature,
        score.metadata.handTemplate || 'Both'
      );
      newMeasures.push(syncedNewM);
      nextMeasureId = newM.id;
      nextBeatIdx = 0;
      nextSubBeatIdx = 0;
    }

    const updatedScore: Score = {
      ...score,
      measures: newMeasures,
    };

    pushScoreState(updatedScore);
    setSelection({
      measureId: nextMeasureId,
      staff: activeHand === 'LH' ? 'LH' : 'RH',
      eventId: null,
      beatIndex: nextBeatIdx,
      subBeatIndex: nextSubBeatIdx,
    });

    // Sound feedback
    audioEngine.playPitch(pitch, score.metadata.initialKeySignature, 0.65);
  }, [selection, score, activeHand, pushScoreState]);

  // Clear notes in active beat, leaving '—' dash
  const handleClearCurrentBeat = useCallback(() => {
    const currentMeasureId = selection.measureId || score.measures[0]?.id;
    const measureIdx = Math.max(0, score.measures.findIndex((m) => m.id === currentMeasureId));
    const currentMeasure = score.measures[measureIdx];
    if (!currentMeasure) return;

    const curBeat = selection.beatIndex !== undefined ? selection.beatIndex : 0;
    const pickup = score.metadata.pickupBeat || 1;
    if (isBeatLockedByPickup(currentMeasure.measureNumber, curBeat, pickup)) return;

    const curBeatNotes = currentMeasure.beatNotes?.[curBeat] || [];
    if (curBeatNotes.length > 0) {
      // Clear notes for this beat -> renders '—'
      setScore((prev) => {
        const targetM = prev.measures[measureIdx];
        const nextNotes = { ...(targetM.beatNotes || {}) };
        delete nextNotes[curBeat];

        const updatedM: Measure = {
          ...targetM,
          beatNotes: nextNotes,
        };
        const syncedM = syncMeasureEventsFromBeatData(
          updatedM,
          prev.metadata.initialTimeSignature,
          prev.metadata.handTemplate || 'Both'
        );

        const updatedMeasures = prev.measures.map((m, i) => (i === measureIdx ? syncedM : m));
        const updated: Score = { ...prev, measures: updatedMeasures };
        pushScoreState(updated);
        return updated;
      });
    } else {
      // Beat is already empty; step back to previous editable beat
      if (curBeat > 0) {
        if (!isBeatLockedByPickup(currentMeasure.measureNumber, curBeat - 1, pickup)) {
          setSelection((sel) => ({ ...sel, beatIndex: curBeat - 1, subBeatIndex: 0 }));
        }
      } else if (measureIdx > 0) {
        const prevM = score.measures[measureIdx - 1];
        const prevTotal = getMeasureTotalBeats(prevM, score.metadata.initialTimeSignature);
        setSelection({
          measureId: prevM.id,
          staff: activeHand === 'LH' ? 'LH' : 'RH',
          eventId: null,
          beatIndex: prevTotal - 1,
          subBeatIndex: 0,
        });
      }
    }
  }, [selection, score, activeHand, pushScoreState]);

  // Update Beat Lyric
  const handleUpdateBeatLyric = useCallback((measureId: string, beatIndex: number, text: string) => {
    setScore((prev) => {
      const updatedMeasures = prev.measures.map((m) => {
        if (m.id !== measureId) return m;
        const nextLyrics = { ...(m.beatLyrics || {}), [beatIndex]: text };
        const updatedM = { ...m, beatLyrics: nextLyrics };
        return syncMeasureEventsFromBeatData(
          updatedM,
          prev.metadata.initialTimeSignature,
          prev.metadata.handTemplate || 'Both'
        );
      });
      const updated = { ...prev, measures: updatedMeasures };
      pushScoreState(updated);
      return updated;
    });
  }, [pushScoreState]);

  // Update Beat Chord Symbol
  const handleUpdateBeatChord = useCallback((measureId: string, beatIndex: number, chord: string) => {
    setScore((prev) => {
      const updatedMeasures = prev.measures.map((m) => {
        if (m.id !== measureId) return m;
        const existing = (m.chordSymbols || []).filter((c) => Math.floor(c.beatOffset) !== beatIndex);
        if (chord.trim()) {
          existing.push({
            id: `cs_${Date.now()}`,
            beatOffset: beatIndex,
            root: chord.slice(0, 1).toUpperCase(),
            quality: chord.slice(1),
            formatted: chord,
          });
        }
        return { ...m, chordSymbols: existing };
      });
      const updated = { ...prev, measures: updatedMeasures };
      pushScoreState(updated);
      return updated;
    });
  }, [pushScoreState]);

  // Delete Selected Event (legacy)
  const handleDeleteSelected = useCallback(() => {
    handleClearCurrentBeat();
  }, [handleClearCurrentBeat]);

  // Transpose Selected Note Up / Down
  const handleTransposeSelected = useCallback((stepDelta: number) => {
    if (!selection.measureId || !selection.staff || !selection.eventId) return;
    setScore((prev) => {
      const updatedMeasures = prev.measures.map((m) => {
        if (m.id !== selection.measureId) return m;
        const list = selection.staff === 'RH' ? m.rhEvents : m.lhEvents;
        const updatedList = list.map((ev) => {
          if (ev.id !== selection.eventId || ev.type !== 'note') return ev;
          const updatedPitches = ev.pitches.map((p) => {
            const curStepVal = getDiatonicStepValue(p);
            const nextStepVal = curStepVal + stepDelta;
            const nextPitch = pitchFromDiatonicStepValue(nextStepVal);
            return {
              step: nextPitch.step,
              octave: nextPitch.octave,
              accidental: p.accidental,
            };
          });
          // Play preview of transposed note
          if (updatedPitches[0]) {
            audioEngine.playPitch(updatedPitches[0], prev.metadata.initialKeySignature, 0.4);
          }
          return { ...ev, pitches: updatedPitches };
        });
        return {
          ...m,
          rhEvents: selection.staff === 'RH' ? updatedList : m.rhEvents,
          lhEvents: selection.staff === 'LH' ? updatedList : m.lhEvents,
        };
      });
      const updated: Score = { ...prev, measures: updatedMeasures };
      pushScoreState(updated);
      return updated;
    });
  }, [selection, pushScoreState]);

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only process shortcuts when in notation editor
      if (viewMode !== 'editor') {
        return;
      }

      // Ignore if user is in an input or textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Space -> Play / Pause
      if (e.code === 'Space') {
        e.preventDefault();
        if (audioEngine.getIsPlaying()) {
          audioEngine.pausePlayback();
        } else {
          audioEngine.playScore(score, playbackPosition?.measureIndex || 0);
        }
        return;
      }

      // Tool switching
      if (e.key.toLowerCase() === 'v') {
        setToolMode('select');
        return;
      }
      if (e.key.toLowerCase() === 'n') {
        setToolMode('note');
        return;
      }
      if (e.key.toLowerCase() === 'r') {
        setToolMode('rest');
        return;
      }
      if (e.key.toLowerCase() === 'l') {
        setToolMode('lyrics');
        return;
      }
      if (e.key.toLowerCase() === 'c') {
        setIsChordDialogOpen(true);
        return;
      }

      // Durations (1-6)
      if (e.key === '1') { setSelectedDuration('whole'); return; }
      if (e.key === '2') { setSelectedDuration('half'); return; }
      if (e.key === '3') { setSelectedDuration('quarter'); return; }
      if (e.key === '4') { setSelectedDuration('eighth'); return; }
      if (e.key === '5') { setSelectedDuration('sixteenth'); return; }
      if (e.key === '6') { setSelectedDuration('thirty_second'); return; }
      if (e.key === '.') { setIsDotted((prev) => !prev); return; }

      // Delete / Backspace -> Clears beat to '—' or moves back
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleClearCurrentBeat();
        return;
      }

      // Horizontal arrow navigation across beats
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const currentMeasureId = selection.measureId || score.measures[0]?.id;
        const measureIdx = Math.max(0, score.measures.findIndex((m) => m.id === currentMeasureId));
        const curMeasure = score.measures[measureIdx];
        if (!curMeasure) return;
        const curBeat = selection.beatIndex !== undefined ? selection.beatIndex : 0;
        const pickup = score.metadata.pickupBeat || 1;
        if (curBeat > 0) {
          if (!isBeatLockedByPickup(curMeasure.measureNumber, curBeat - 1, pickup)) {
            setSelection((sel) => ({ ...sel, beatIndex: curBeat - 1, subBeatIndex: 0 }));
          }
        } else if (measureIdx > 0) {
          const prevM = score.measures[measureIdx - 1];
          const prevTotal = getMeasureTotalBeats(prevM, score.metadata.initialTimeSignature);
          setSelection({
            measureId: prevM.id,
            staff: activeHand === 'LH' ? 'LH' : 'RH',
            eventId: null,
            beatIndex: prevTotal - 1,
            subBeatIndex: 0,
          });
        }
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const currentMeasureId = selection.measureId || score.measures[0]?.id;
        const measureIdx = Math.max(0, score.measures.findIndex((m) => m.id === currentMeasureId));
        const curMeasure = score.measures[measureIdx];
        if (!curMeasure) return;
        const curBeat = selection.beatIndex !== undefined ? selection.beatIndex : 0;
        const totalBeats = getMeasureTotalBeats(curMeasure, score.metadata.initialTimeSignature);
        if (curBeat < totalBeats - 1) {
          setSelection((sel) => ({ ...sel, beatIndex: curBeat + 1, subBeatIndex: 0 }));
        } else if (measureIdx < score.measures.length - 1) {
          const nextM = score.measures[measureIdx + 1];
          setSelection({
            measureId: nextM.id,
            staff: activeHand === 'LH' ? 'LH' : 'RH',
            eventId: null,
            beatIndex: 0,
            subBeatIndex: 0,
          });
        }
        return;
      }

      // Vertical arrows -> Transposition
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleTransposeSelected(1);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleTransposeSelected(-1);
        return;
      }

      // Direct Computer Pitch Keys: C, D, E, F, G, A, B
      const upper = e.key.toUpperCase();
      if (['C', 'D', 'E', 'F', 'G', 'A', 'B'].includes(upper)) {
        const octave = activeHand === 'LH' ? 3 : 4;
        const pitch: Pitch = {
          step: upper as any,
          octave,
          accidental: selectedAccidental,
        };
        handlePianotasticNoteInput(pitch);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleUndo,
    handleRedo,
    handleClearCurrentBeat,
    handleTransposeSelected,
    handlePianotasticNoteInput,
    score,
    playbackPosition,
    selection,
    activeHand,
    selectedAccidental,
    viewMode,
  ]);

  // Web MIDI note input listener
  useEffect(() => {
    const unsubscribe = midiService.onNote((pitch) => {
      if (viewMode !== 'editor') return;
      handlePianotasticNoteInput(pitch);
    });
    return () => {
      unsubscribe();
    };
  }, [handlePianotasticNoteInput, viewMode]);

  // Audio Engine position callback
  useEffect(() => {
    audioEngine.setPositionCallback((measureIndex, beat) => {
      setPlaybackPosition({ measureIndex, beat });
    });
  }, []);

  // 1. Initial Opening Screen: Clean Home/Project screen
  if (viewMode === 'home') {
    return (
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#faf8f5]">
        <HomeScreen
          savedProjects={savedProjects}
          onOpenProject={handleSelectProject}
          onSelectProject={handleSelectProject}
          onOpenNewPageModal={handleOpenNewPageModal}
          onOpenNewPage={handleOpenNewPageModal}
          onDeleteProject={handleDeleteProject}
          onImportFile={handleImportFile}
        />

        {/* Template Selection Pop-up Modal */}
        <NewScoreSetupModal
          isOpen={isNewScoreModalOpen}
          onClose={handleCloseNewPageModal}
          onCreateScore={handleCreateScore}
        />
      </div>
    );
  }

  // 2. Notation Studio Editor Screen
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-stone-100 font-sans text-stone-900">
      {/* 1. Top Application Header */}
      <Header
        score={score}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onUpdateMetadata={handleUpdateMetadata}
        onUpdateLayout={handleUpdateLayout}
        onLoadScore={(newScore) => {
          setScore(newScore);
          pushScoreState(newScore);
        }}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onResetScore={(templateKey) => {
          const t = SAMPLE_SCORES[templateKey] || SAMPLE_SCORES.blank;
          setScore(t);
          pushScoreState(t);
        }}
        onNavigateHome={handleNavigateHome}
        onOpenNewPageModal={handleOpenNewPageModal}
      />

      {/* 2. Main Notation Toolbar */}
      <MainToolbar
        toolMode={toolMode}
        onSetToolMode={setToolMode}
        selectedDuration={selectedDuration}
        onSetDuration={setSelectedDuration}
        isDotted={isDotted}
        onToggleDotted={() => setIsDotted(!isDotted)}
        selectedAccidental={selectedAccidental}
        onSetAccidental={setSelectedAccidental}
        activeHand={activeHand}
        onSetHand={setActiveHand}
      />

      {/* Central Workspace: Left Palette + Score Canvas + Right Inspector */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* 3. Left-side Tool Palette */}
        <LeftToolPalette
          score={score}
          onUpdateLayout={handleUpdateLayout}
        />

        {/* 4. Central Score Canvas (Custom Pianotastic Notation) */}
        <div className="flex-1 h-full overflow-hidden flex flex-col bg-stone-200/50">
          <NotationRenderer
            score={score}
            toolMode={toolMode}
            selectedDuration={selectedDuration}
            selectedAccidental={selectedAccidental}
            activeHand={activeHand}
            selection={selection}
            playbackPosition={playbackPosition}
            onSelectMeasure={(measureId) =>
              setSelection((sel) => ({ ...sel, measureId, eventId: null }))
            }
            onSelectBeat={(measureId, beatIndex, subBeatIndex) =>
              setSelection((sel) => ({
                ...sel,
                measureId,
                beatIndex,
                subBeatIndex: subBeatIndex ?? 0,
                eventId: null,
              }))
            }
            onUpdateBeatLyric={handleUpdateBeatLyric}
            onUpdateBeatChord={handleUpdateBeatChord}
            onInsertNote={handleInsertNote}
            onDeleteSelected={handleDeleteSelected}
            onMeasureWidthChange={handleMeasureWidthChange}
            onMeasureContextMenu={(measure, x, y) =>
              setContextMenu({ measure, x, y })
            }
            onOpenNavigationPalette={(measure) =>
              setNavigationModalMeasure(measure)
            }
          />
        </div>

        {/* Dedicated Pianotastic Beat Value & Bars Per Line Palette */}
        <BeatValueBar
          score={score}
          selection={selection}
          onChangeBeatValue={handleChangeBeatValue}
          onChangeBarsPerLine={handleChangeBarsPerLine}
        />

        {/* 5. Right-side Properties Panel */}
        <PropertiesPanel
          score={score}
          selection={selection}
          onUpdateScoreMetadata={handleUpdateMetadata}
          onUpdateLayout={handleUpdateLayout}
          onUpdateMeasure={handleUpdateMeasure}
          onUpdateEvent={handleUpdateEvent}
          onAddMeasure={handleAddMeasure}
          onInsertMeasureBefore={handleInsertMeasureBefore}
          onInsertMeasureAfter={handleInsertMeasureAfter}
          onDuplicateMeasure={handleDuplicateMeasure}
          onDeleteMeasure={handleDeleteMeasure}
          onClearMeasure={handleClearMeasure}
          onOpenCustomTimeSignature={() => setIsCustomTimeSigOpen(true)}
          onOpenChordDialog={() => setIsChordDialogOpen(true)}
          onResetLayout={handleResetLayout}
        />
      </div>

      {/* Virtual Piano Expandable Keyboard (88-Keys Default) */}
      <VirtualPiano
        isOpen={isVirtualPianoOpen}
        onClose={() => setIsVirtualPianoOpen(false)}
        onKeyPress={handlePianotasticNoteInput}
        selectedAccidental={selectedAccidental}
      />

      {/* 6. Bottom Playback & Control Bar */}
      <BottomPlaybackBar
        score={score}
        onUpdateScoreMetadata={handleUpdateMetadata}
        isVirtualPianoOpen={isVirtualPianoOpen}
        onToggleVirtualPiano={() => setIsVirtualPianoOpen(!isVirtualPianoOpen)}
        playbackPosition={playbackPosition}
        onOpenMidiModal={() => setIsMidiModalOpen(true)}
      />

      {/* MODALS */}
      <CustomTimeSignatureModal
        isOpen={isCustomTimeSigOpen}
        onClose={() => setIsCustomTimeSigOpen(false)}
        currentTs={score.metadata.initialTimeSignature}
        onApply={(ts: TimeSignature, applyToAll: boolean) => {
          if (applyToAll) {
            handleUpdateMetadata({ initialTimeSignature: ts });
            setScore((prev) => {
              const updatedMeasures = prev.measures.map((m) => ({
                ...m,
                timeSignature: undefined, // inherit new score time signature
              }));
              const updated = { ...prev, measures: updatedMeasures };
              pushScoreState(updated);
              return updated;
            });
          } else if (selection.measureId) {
            handleUpdateMeasure(selection.measureId, { timeSignature: ts });
          }
        }}
      />

      <ChordDialogModal
        isOpen={isChordDialogOpen}
        onClose={() => setIsChordDialogOpen(false)}
        onInsertChord={(chord) => {
          if (!selection.measureId) return;
          const targetMeasure = score.measures.find((m) => m.id === selection.measureId);
          if (!targetMeasure) return;

          const newChordSymbols = [...targetMeasure.chordSymbols];
          newChordSymbols.push({
            id: `cs_${Date.now()}`,
            beatOffset: 0,
            root: chord.root,
            quality: chord.quality,
            bass: chord.bass,
            formatted: chord.formatted,
          });

          handleUpdateMeasure(selection.measureId, { chordSymbols: newChordSymbols });
        }}
      />

      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      {/* Navigation Tool Modal / Palette */}
      {navigationModalMeasure && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-100">
            <NavigationPalette
              activeMeasure={score.measures.find((m) => m.id === navigationModalMeasure.id) || navigationModalMeasure}
              measures={score.measures}
              onUpdateMeasure={(mId, patch) => handleUpdateMeasure(mId, patch)}
              onClose={() => setNavigationModalMeasure(null)}
            />
          </div>
        </div>
      )}

      {/* MIDI Device Configuration Modal */}
      <MidiDeviceModal
        isOpen={isMidiModalOpen}
        onClose={() => setIsMidiModalOpen(false)}
        midiMode={midiMode}
        onSetMidiMode={setMidiMode}
        quantization={quantization}
        onSetQuantization={setQuantization}
        selectedChannel={selectedChannel}
        onSetSelectedChannel={setSelectedChannel}
        velocitySensitive={velocitySensitive}
        onSetVelocitySensitive={setVelocitySensitive}
      />

      {contextMenu && (
        <MeasureContextMenu
          measure={contextMenu.measure}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onAddBefore={handleInsertMeasureBefore}
          onAddAfter={handleInsertMeasureAfter}
          onDuplicate={handleDuplicateMeasure}
          onDelete={handleDeleteMeasure}
          onClear={handleClearMeasure}
          onResetWidth={(mId) => handleMeasureWidthChange(mId, undefined as any)}
          onOpenNavigation={(measure) => setNavigationModalMeasure(measure)}
        />
      )}

      {/* New Page Template Setup Modal */}
      <NewScoreSetupModal
        isOpen={isNewScoreModalOpen}
        onClose={handleCloseNewPageModal}
        onCreateScore={handleCreateScore}
      />
    </div>
  );
}
