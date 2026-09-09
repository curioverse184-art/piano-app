import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Score,
  Measure,
  NoteEvent,
  Pitch,
  NoteStep,
  ToolMode,
  NoteDuration,
  AccidentalType,
  SelectionState,
  Hand,
  TimeSignature,
  LearningLayerSettings,
  DEFAULT_LEARNING_LAYER,
  SavedProject,
  ScoreTextAnnotation,
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
import { PropertiesPanel } from './components/properties/PropertiesPanel';
import { BottomPlaybackBar } from './components/playback/BottomPlaybackBar';
import { VirtualPiano } from './components/piano/VirtualPiano';
import { HomeScreen } from './components/home/HomeScreen';
import { PrintStudio } from './components/print/PrintStudio';
import { ErrorBoundary } from './components/common/ErrorBoundary';

// Modals
import { CustomTimeSignatureModal } from './components/modals/CustomTimeSignatureModal';
import { ChordDialogModal } from './components/modals/ChordDialogModal';
import { KeyboardShortcutsModal } from './components/modals/KeyboardShortcutsModal';
import { MeasureContextMenu } from './components/modals/MeasureContextMenu';
import { NavigationPalette } from './components/navigation/NavigationPalette';
import { MidiDeviceModal } from './components/midi/MidiDeviceModal';
import { NewScoreSetupModal } from './components/modals/NewScoreSetupModal';
import { SaveAsModal } from './components/modals/SaveAsModal';
import { ProjectLibraryModal } from './components/modals/ProjectLibraryModal';
import { TextAnnotationModal } from './components/modals/TextAnnotationModal';
import { UnsavedChangesModal } from './components/modals/UnsavedChangesModal';

export default function App() {
  // Navigation & Startup view state: persist across refreshes
  const [viewMode, setViewMode] = useState<'home' | 'editor' | 'print'>(() => {
    const saved = localStorage.getItem('pianotastic_last_view_mode');
    return saved === 'editor' ? 'editor' : 'home';
  });
  const [isNewScoreModalOpen, setIsNewScoreModalOpen] = useState(false);
  const [isSaveAsModalOpen, setIsSaveAsModalOpen] = useState(false);
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [unsavedModalConfig, setUnsavedModalConfig] = useState<{
    isOpen: boolean;
    actionType: 'new' | 'open' | 'home';
    pendingTarget?: SavedProject | Score | null;
  }>({
    isOpen: false,
    actionType: 'new',
    pendingTarget: null,
  });

  const [savedProjects, setSavedProjects] = useState<SavedProject[]>(() =>
    ProjectStorageService.getSavedProjects()
  );

  // Score state: restore last active project if available
  const [score, setScore] = useState<Score>(() => {
    const projects = ProjectStorageService.getSavedProjects();
    const lastActiveId = localStorage.getItem('pianotastic_last_active_project_id');
    if (lastActiveId) {
      const found = projects.find((p) => p.id === lastActiveId || p.score?.id === lastActiveId);
      if (found?.score) return found.score;
    }
    return projects[0]?.score || SAMPLE_SCORES.etude;
  });

  // Keep viewMode and active score ID persisted
  useEffect(() => {
    localStorage.setItem('pianotastic_last_view_mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (score?.id) {
      localStorage.setItem('pianotastic_last_active_project_id', score.id);
    }
  }, [score?.id]);

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
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);

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
  const [textModalConfig, setTextModalConfig] = useState<{
    isOpen: boolean;
    initialData?: Partial<ScoreTextAnnotation>;
    measureId: string;
    measureNumber: number;
    beatIndex: number;
    placement: 'above' | 'below' | 'free';
  } | null>(null);
  const [appToast, setAppToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setAppToast(msg);
    setTimeout(() => setAppToast(null), 3500);
  }, []);

  // Push score to undo stack
  const pushScoreState = useCallback((newScore: Score) => {
    setHistory((prev) => {
      const upToCurrent = prev.slice(0, historyIndex + 1);
      return [...upToCurrent, newScore];
    });
    setHistoryIndex((prev) => prev + 1);
    setScore(newScore);
    setIsDirty(true);
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
    setIsDirty(false);
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
    setIsDirty(false);
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
    // Auto-save current project state internally
    const updated = ProjectStorageService.saveProject(score);
    setSavedProjects(updated);
    setIsDirty(false);
    // Stop audio playback if active
    audioEngine.stopPlayback();
    setPlaybackPosition(null);
    setViewMode('home');
  }, [score]);

  // Internal Save Project (No download)
  const handleSaveProject = useCallback(() => {
    try {
      const updated = ProjectStorageService.saveProject(score);
      setSavedProjects(updated);
      localStorage.setItem('pianotastic_last_active_project_id', score.id);
      setIsDirty(false);
      showToast(`Saved "${score.metadata.title}" internally`);
    } catch (err) {
      console.error('Error saving project internally:', err);
    }
  }, [score, showToast]);

  // Prompt-guarded New / Open / Home actions for Unsaved Changes
  const requestNewProject = useCallback(() => {
    if (isDirty) {
      setUnsavedModalConfig({
        isOpen: true,
        actionType: 'new',
        pendingTarget: null,
      });
    } else {
      handleOpenNewPageModal();
    }
  }, [isDirty, handleOpenNewPageModal]);

  const requestOpenProject = useCallback((target?: SavedProject | Score) => {
    if (isDirty) {
      setUnsavedModalConfig({
        isOpen: true,
        actionType: 'open',
        pendingTarget: target || null,
      });
    } else {
      if (target) {
        handleSelectProject(target);
      } else {
        setIsLibraryModalOpen(true);
      }
    }
  }, [isDirty, handleSelectProject]);

  const requestNavigateHome = useCallback(() => {
    if (isDirty) {
      setUnsavedModalConfig({
        isOpen: true,
        actionType: 'home',
        pendingTarget: null,
      });
    } else {
      handleNavigateHome();
    }
  }, [isDirty, handleNavigateHome]);

  // Internal Save Copy / Save As (No download)
  const handleSaveCopy = useCallback(
    (newTitle: string) => {
      try {
        const newScore: Score = {
          ...score,
          id: `proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          metadata: {
            ...score.metadata,
            title: newTitle,
          },
        };
        setScore(newScore);
        pushScoreState(newScore);
        const updated = ProjectStorageService.saveProject(newScore);
        setSavedProjects(updated);
        localStorage.setItem('pianotastic_last_active_project_id', newScore.id);
        setIsDirty(false);
        showToast(`Saved copy as "${newTitle}" internally`);
      } catch (err) {
        console.error('Error saving copy internally:', err);
      }
    },
    [score, pushScoreState, showToast]
  );

  // Add Measure at End handler
  const handleAddMeasureAtEnd = useCallback(() => {
    setScore((prev) => {
      const beatsCount = prev.metadata.initialTimeSignature?.numerator || 4;
      const rhEvents: NoteEvent[] = Array.from({ length: beatsCount }, (_, i) => ({
        id: `rh_${Date.now()}_${i}`,
        type: 'note',
        pitches: [],
        duration: 'quarter',
        beatValue: 1,
        subdivisionPitches: [[]],
      }));
      const lhEvents: NoteEvent[] = Array.from({ length: beatsCount }, (_, i) => ({
        id: `lh_${Date.now()}_${i}`,
        type: 'note',
        pitches: [],
        duration: 'quarter',
        beatValue: 1,
        subdivisionPitches: [[]],
      }));

      const newMeasure: Measure = {
        id: `m_${Date.now()}`,
        measureNumber: prev.measures.length + 1,
        barlineType: 'single',
        chordSymbols: [],
        rhEvents,
        lhEvents,
      };

      const newMeasures = [...prev.measures, newMeasure];
      const updated: Score = { ...prev, measures: newMeasures };
      pushScoreState(updated);
      setSelection({
        measureId: newMeasure.id,
        staff: 'RH',
        eventId: null,
        beatIndex: 0,
        subBeatIndex: 0,
      });
      showToast(`Added Measure ${newMeasure.measureNumber} at end`);
      return updated;
    });
  }, [pushScoreState, showToast]);

  // Change Canonical Time Signature
  const handleChangeTimeSignature = useCallback(
    (newTimeSig: TimeSignature) => {
      setScore((prev) => {
        const oldNumerator = prev.metadata.initialTimeSignature?.numerator || 4;
        const newNumerator = newTimeSig.numerator;

        const updatedMeasures = prev.measures.map((m) => {
          let newRh = [...m.rhEvents];
          let newLh = [...m.lhEvents];

          if (newNumerator > oldNumerator) {
            for (let b = oldNumerator; b < newNumerator; b++) {
              newRh.push({
                id: `rh_${Date.now()}_${b}`,
                type: 'note',
                pitches: [],
                duration: 'quarter',
                beatValue: 1,
                subdivisionPitches: [[]],
              });
              newLh.push({
                id: `lh_${Date.now()}_${b}`,
                type: 'note',
                pitches: [],
                duration: 'quarter',
                beatValue: 1,
                subdivisionPitches: [[]],
              });
            }
          } else if (newNumerator < oldNumerator) {
            newRh = newRh.slice(0, newNumerator);
            newLh = newLh.slice(0, newNumerator);
          }

          return {
            ...m,
            rhEvents: newRh,
            lhEvents: newLh,
            timeSignature: newTimeSig,
          };
        });

        const updated: Score = {
          ...prev,
          metadata: {
            ...prev.metadata,
            initialTimeSignature: newTimeSig,
          },
          measures: updatedMeasures,
        };
        pushScoreState(updated);
        showToast(`Time signature set to ${newTimeSig.numerator}/${newTimeSig.denominator}`);
        return updated;
      });
    },
    [pushScoreState, showToast]
  );

  // Internal Duplicate Project from library
  const handleDuplicateProject = useCallback(
    (project: SavedProject) => {
      try {
        const copyScore: Score = {
          ...project.score,
          id: `proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          metadata: {
            ...project.score.metadata,
            title: `${project.name} (Copy)`,
          },
        };
        const updated = ProjectStorageService.saveProject(copyScore);
        setSavedProjects(updated);
        showToast(`Duplicated "${project.name}"`);
      } catch (err) {
        console.error('Error duplicating project:', err);
      }
    },
    [showToast]
  );

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
    try {
      const currentMeasureId = selection.measureId || score.measures[0]?.id;
      const measureIdx = Math.max(0, score.measures.findIndex((m) => m.id === currentMeasureId));
      const targetMeasure = score.measures[measureIdx];
      if (!targetMeasure) return;
      const currentBeatIndex = selection.beatIndex !== undefined ? selection.beatIndex : 0;

      // Respect Pickup Beat restrictions
      const pickup = score.metadata.pickupBeat || 1;
      if (isBeatLockedByPickup(targetMeasure.measureNumber, currentBeatIndex, pickup)) {
        showToast(`Beat ${currentBeatIndex + 1} is locked by Pickup Beat ${pickup}`);
        return;
      }

      const safeVal = Math.max(1, Math.min(4, newValue));
      const nextBeatValues = {
        ...(targetMeasure.beatValues || {}),
        [currentBeatIndex]: safeVal,
      };

      const curBeatNotes = [...(targetMeasure.beatNotes?.[currentBeatIndex] || [])];
      if (safeVal > 1) {
        while (curBeatNotes.length < safeVal) {
          curBeatNotes.push(null as any);
        }
        if (curBeatNotes.length > safeVal) {
          curBeatNotes.length = safeVal;
        }
      } else {
        if (curBeatNotes.length > 1) {
          curBeatNotes.length = 1;
        }
      }

      const updatedMeasure: Measure = {
        ...targetMeasure,
        beatValues: nextBeatValues,
        beatNotes: {
          ...(targetMeasure.beatNotes || {}),
          [currentBeatIndex]: curBeatNotes,
        },
      };

      const syncedMeasure = syncMeasureEventsFromBeatData(
        updatedMeasure,
        score.metadata.initialTimeSignature,
        score.metadata.handTemplate || 'Both'
      );

      const updatedMeasures = score.measures.map((m, i) => (i === measureIdx ? syncedMeasure : m));
      const updated: Score = { ...score, measures: updatedMeasures };
      pushScoreState(updated);

      // Preserve cursor measure, beat, and safely clamp subdivision
      setSelection((sel) => {
        const currentSub = sel.subBeatIndex || 0;
        const safeSub = Math.min(currentSub, safeVal - 1);
        return {
          ...sel,
          subBeatIndex: Math.max(0, safeSub),
        };
      });

      showToast(`Value ${safeVal}: ${safeVal} note${safeVal > 1 ? 's' : ''} per beat`);
    } catch (err) {
      console.error('Error changing beat value:', err);
    }
  }, [selection, score, pushScoreState, showToast]);

  // Quick Change Bars Per Line (1 to 6)
  const handleChangeBarsPerLine = useCallback((bars: number) => {
    handleUpdateLayout({ barsPerLine: bars, measuresPerSystemAuto: bars, layoutMode: 'auto' });
  }, [handleUpdateLayout]);

  // Insert Note in Pianotastic Custom Notation Format
  const handlePianotasticNoteInput = useCallback((pitch: Pitch) => {
    try {
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

      // Set pitch at subBeatIndex, preserving empty subdivisions (null)
      const curBeatNotes = [...(currentMeasure.beatNotes?.[curBeat] || [])];
      while (curBeatNotes.length < effectiveVal) {
        curBeatNotes.push(null as any);
      }
      if (curBeatNotes.length > effectiveVal) {
        curBeatNotes.length = effectiveVal;
      }
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

      // Sound feedback with audio safety guard
      try {
        audioEngine.playPitch(pitch, score.metadata.initialKeySignature, 0.65);
      } catch (audioErr) {
        console.warn('Audio playback error:', audioErr);
      }
    } catch (err) {
      console.error('Note input error:', err);
    }
  }, [selection, score, activeHand, pushScoreState]);

  // Advance subdivision without entering a note (creates intentional empty slot '.')
  const handleAdvanceSubdivisionWithoutNote = useCallback(() => {
    try {
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

      if (isBeatLockedByPickup(currentMeasure.measureNumber, curBeat, pickup)) {
        curBeat = pickup - 1;
      }
      let curSubBeat = selection.subBeatIndex || 0;
      const effectiveVal = getEffectiveBeatValue(score, measureIdx, curBeat);
      if (curSubBeat >= effectiveVal) {
        curSubBeat = 0;
      }

      // Ensure slot at curSubBeat is explicitly null (empty subdivision '.')
      const curBeatNotes = [...(currentMeasure.beatNotes?.[curBeat] || [])];
      while (curBeatNotes.length < effectiveVal) {
        curBeatNotes.push(null as any);
      }
      if (curBeatNotes.length > effectiveVal) {
        curBeatNotes.length = effectiveVal;
      }
      curBeatNotes[curSubBeat] = null as any;

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
    } catch (err) {
      console.error('Error advancing subdivision:', err);
    }
  }, [selection, score, activeHand, pushScoreState]);

  // Clear notes in active beat or subdivision, leaving '.' or '—'
  const handleClearCurrentBeat = useCallback(() => {
    try {
      const currentMeasureId = selection.measureId || score.measures[0]?.id;
      const measureIdx = Math.max(0, score.measures.findIndex((m) => m.id === currentMeasureId));
      const currentMeasure = score.measures[measureIdx];
      if (!currentMeasure) return;

      const curBeat = selection.beatIndex !== undefined ? selection.beatIndex : 0;
      const pickup = score.metadata.pickupBeat || 1;
      if (isBeatLockedByPickup(currentMeasure.measureNumber, curBeat, pickup)) return;

      const curSubBeat = selection.subBeatIndex || 0;
      const effectiveVal = getEffectiveBeatValue(score, measureIdx, curBeat);
      const curBeatNotes = currentMeasure.beatNotes?.[curBeat] || [];

      // If subdivision has a note in a multi-note beat, clear just that subdivision to '.'
      if (effectiveVal > 1 && curBeatNotes.length > 0 && curBeatNotes[curSubBeat] && curBeatNotes[curSubBeat]?.step) {
        const nextNotes = { ...(currentMeasure.beatNotes || {}) };
        const updatedSlotNotes = [...(nextNotes[curBeat] || [])];
        while (updatedSlotNotes.length < effectiveVal) {
          updatedSlotNotes.push(null as any);
        }
        if (updatedSlotNotes.length > effectiveVal) {
          updatedSlotNotes.length = effectiveVal;
        }
        updatedSlotNotes[curSubBeat] = null as any;
        nextNotes[curBeat] = updatedSlotNotes;

        const updatedM: Measure = {
          ...currentMeasure,
          beatNotes: nextNotes,
        };
        const syncedM = syncMeasureEventsFromBeatData(
          updatedM,
          score.metadata.initialTimeSignature,
          score.metadata.handTemplate || 'Both'
        );

        const updatedMeasures = score.measures.map((m, i) => (i === measureIdx ? syncedM : m));
        const updated: Score = { ...score, measures: updatedMeasures };
        pushScoreState(updated);
        return;
      }

      if (effectiveVal === 1 && curBeatNotes.length > 0) {
        // Clear notes for this beat -> renders '—'
        const nextNotes = { ...(currentMeasure.beatNotes || {}) };
        delete nextNotes[curBeat];

        const updatedM: Measure = {
          ...currentMeasure,
          beatNotes: nextNotes,
        };
        const syncedM = syncMeasureEventsFromBeatData(
          updatedM,
          score.metadata.initialTimeSignature,
          score.metadata.handTemplate || 'Both'
        );

        const updatedMeasures = score.measures.map((m, i) => (i === measureIdx ? syncedM : m));
        const updated: Score = { ...score, measures: updatedMeasures };
        pushScoreState(updated);
      } else {
        // Slot/beat is already empty; step back to previous editable subdivision / beat
        if (curSubBeat > 0) {
          setSelection((sel) => ({ ...sel, subBeatIndex: curSubBeat - 1 }));
        } else if (curBeat > 0) {
          if (!isBeatLockedByPickup(currentMeasure.measureNumber, curBeat - 1, pickup)) {
            const prevBeatVal = getEffectiveBeatValue(score, measureIdx, curBeat - 1);
            setSelection((sel) => ({
              ...sel,
              beatIndex: curBeat - 1,
              subBeatIndex: Math.max(0, prevBeatVal - 1),
            }));
          }
        } else if (measureIdx > 0) {
          const prevM = score.measures[measureIdx - 1];
          const prevTotal = getMeasureTotalBeats(prevM, score.metadata.initialTimeSignature);
          const prevBeatVal = getEffectiveBeatValue(score, measureIdx - 1, prevTotal - 1);
          setSelection({
            measureId: prevM.id,
            staff: activeHand === 'LH' ? 'LH' : 'RH',
            eventId: null,
            beatIndex: prevTotal - 1,
            subBeatIndex: Math.max(0, prevBeatVal - 1),
          });
        }
      }
    } catch (err) {
      console.error('Error clearing beat:', err);
    }
  }, [selection, score, activeHand, pushScoreState]);

  // Update Beat Lyric
  const handleUpdateBeatLyric = useCallback(
    (measureId: string, beatIndex: number, text: string, subBeatIndex?: number) => {
      setScore((prev) => {
        const updatedMeasures = prev.measures.map((m) => {
          if (m.id !== measureId) return m;
          const nextLyrics = { ...(m.beatLyrics || {}) };
          const key =
            subBeatIndex !== undefined && subBeatIndex > 0
              ? `${beatIndex}_${subBeatIndex}`
              : beatIndex;
          if (text && text.trim()) {
            nextLyrics[key] = text.trim();
          } else {
            delete nextLyrics[key];
          }
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
    },
    [pushScoreState]
  );

  // Update Beat Chord Symbol (attached directly and strictly to this beat)
  const handleUpdateBeatChord = useCallback(
    (measureId: string, beatIndex: number, chord: string) => {
      setScore((prev) => {
        const updatedMeasures = prev.measures.map((m) => {
          if (m.id !== measureId) return m;
          const nextChords = { ...(m.beatChords || {}) };
          let nextChordSymbols = [...(m.chordSymbols || [])];

          if (chord && chord.trim()) {
            nextChords[beatIndex] = chord.trim();
            // Sync with chordSymbols
            nextChordSymbols = nextChordSymbols.filter((c) => Math.floor(c.beatOffset) !== beatIndex);
            nextChordSymbols.push({
              id: `cs_${Date.now()}_${beatIndex}`,
              beatOffset: beatIndex,
              root: chord.trim(),
              quality: '',
              formatted: chord.trim(),
            });
          } else {
            delete nextChords[beatIndex];
            // CRITICAL FIX: Ensure matching chordSymbols entry is completely purged as well
            nextChordSymbols = nextChordSymbols.filter((c) => Math.floor(c.beatOffset) !== beatIndex);
          }

          const updatedM: Measure = {
            ...m,
            beatChords: nextChords,
            chordSymbols: nextChordSymbols,
          };
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
    },
    [pushScoreState]
  );

  // Toggle Beat Symbol (such as ⌣ curved symbol, staccato, accent, etc.)
  const handleToggleBeatSymbol = useCallback(
    (measureId: string, beatIndex: number, symbol: string) => {
      setScore((prev) => {
        const updatedMeasures = prev.measures.map((m) => {
          if (m.id !== measureId) return m;
          const curSymbols = [...(m.beatSymbols?.[beatIndex] || [])];
          let nextSymbols: string[];
          if (curSymbols.includes(symbol)) {
            nextSymbols = curSymbols.filter((s) => s !== symbol);
          } else {
            nextSymbols = [...curSymbols, symbol];
          }
          const nextBeatSymbols = { ...(m.beatSymbols || {}) };
          if (nextSymbols.length > 0) {
            nextBeatSymbols[beatIndex] = nextSymbols;
          } else {
            delete nextBeatSymbols[beatIndex];
          }
          const updatedM: Measure = { ...m, beatSymbols: nextBeatSymbols };
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
    },
    [pushScoreState]
  );

  // Toggle Manual Line Break after current or specified measure (does not mutate global barsPerLine)
  const handleToggleLineBreak = useCallback(
    (targetMeasureId?: string) => {
      const mId = targetMeasureId || selection.measureId || score.measures[0]?.id;
      if (!mId) return;
      const mIdx = score.measures.findIndex((m) => m.id === mId);
      if (mIdx < 0) return;

      // If targetMeasureId is passed explicitly from clicking a measure's badge, toggle that measure directly.
      // When pressing Enter while selecting a measure (e.g. Bar 3), break after Bar 2 so Bar 3 wraps to next line.
      const breakTargetIdx = targetMeasureId ? mIdx : (mIdx > 0 ? mIdx - 1 : 0);
      const targetM = score.measures[breakTargetIdx];
      const newBreak = !targetM.systemBreak;

      const updatedMeasures = score.measures.map((m, idx) =>
        idx === breakTargetIdx ? { ...m, systemBreak: newBreak } : m
      );
      const updated: Score = {
        ...score,
        measures: updatedMeasures,
      };
      pushScoreState(updated);

      showToast(
        newBreak
          ? `Line break added after Bar ${breakTargetIdx + 1} ↵ (measures wrapped to next line)`
          : `Line break removed from Bar ${breakTargetIdx + 1}`
      );
    },
    [selection.measureId, score, pushScoreState, showToast]
  );

  // Text Annotation Handlers
  const handleDeleteTextAnnotation = useCallback(
    (textId: string) => {
      setScore((prev) => {
        const updatedScore: Score = {
          ...prev,
          textAnnotations: (prev.textAnnotations || []).filter((t) => t.id !== textId),
        };
        pushScoreState(updatedScore);
        return updatedScore;
      });
      setSelection((sel) => ({
        ...sel,
        textAnnotationId: undefined,
        selectionType: sel.textAnnotationId === textId || sel.eventId === textId ? 'beat' : sel.selectionType,
        eventId: sel.eventId === textId ? null : sel.eventId,
      }));
      showToast('Text annotation deleted');
    },
    [pushScoreState, showToast]
  );

  const handleSaveTextAnnotation = useCallback(
    (annotationData: Partial<ScoreTextAnnotation>) => {
      let targetId = annotationData.id;
      setScore((prev) => {
        const existing = prev.textAnnotations || [];
        targetId = targetId || `text_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const isEditing = existing.some((t) => t.id === targetId);

        let updated: ScoreTextAnnotation[];
        if (isEditing) {
          updated = existing.map((t) =>
            t.id === targetId ? ({ ...t, ...annotationData } as ScoreTextAnnotation) : t
          );
        } else {
          const newAnnotation: ScoreTextAnnotation = {
            id: targetId,
            text: annotationData.text || '',
            measureId: annotationData.measureId || selection.measureId || prev.measures[0]?.id || 'm1',
            measureNumber: annotationData.measureNumber || 1,
            beatIndex: annotationData.beatIndex ?? (selection.beatIndex !== undefined ? selection.beatIndex : 0),
            placement: annotationData.placement || 'above',
            offsetX: annotationData.offsetX ?? 0,
            offsetY: annotationData.offsetY ?? 0,
            fontSize: annotationData.fontSize ?? 14,
            fontWeight: annotationData.fontWeight ?? 'normal',
            fontStyle: annotationData.fontStyle ?? 'normal',
            textDecoration: annotationData.textDecoration ?? 'none',
            textAlign: annotationData.textAlign ?? 'left',
            color: annotationData.color ?? '#0f172a',
          };
          updated = [...existing, newAnnotation];
        }

        const updatedScore: Score = {
          ...prev,
          textAnnotations: updated,
        };
        pushScoreState(updatedScore);
        return updatedScore;
      });

      if (targetId) {
        setSelection((sel) => ({
          ...sel,
          textAnnotationId: targetId,
          selectionType: 'text',
          eventId: targetId,
        }));
      }

      setTextModalConfig(null);
      showToast(annotationData.id ? 'Text updated' : 'Text added to score');
    },
    [selection, pushScoreState, showToast]
  );

  const handleUpdateTextAnnotation = useCallback(
    (textId: string, patch: Partial<ScoreTextAnnotation>) => {
      setScore((prev) => {
        const updatedScore: Score = {
          ...prev,
          textAnnotations: (prev.textAnnotations || []).map((t) =>
            t.id === textId ? { ...t, ...patch } : t
          ),
        };
        pushScoreState(updatedScore);
        return updatedScore;
      });
    },
    [pushScoreState]
  );

  const handleMoveTextAnnotation = useCallback((textId: string, offsetX: number, offsetY: number) => {
    setScore((prev) => ({
      ...prev,
      textAnnotations: (prev.textAnnotations || []).map((t) =>
        t.id === textId ? { ...t, offsetX, offsetY } : t
      ),
    }));
  }, []);

  const handleSelectTextAnnotation = useCallback(
    (textId: string) => {
      const textObj = (score.textAnnotations || []).find((t) => t.id === textId);
      setSelection((prev) => ({
        ...prev,
        textAnnotationId: textId,
        selectionType: 'text',
        eventId: textId,
        measureId: textObj?.measureId || prev.measureId,
        beatIndex: textObj?.beatIndex !== undefined ? textObj.beatIndex : prev.beatIndex,
      }));
    },
    [score.textAnnotations]
  );

  const handleEditTextAnnotation = useCallback((textAnnotation: ScoreTextAnnotation) => {
    setTextModalConfig({
      isOpen: true,
      initialData: textAnnotation,
      measureId: textAnnotation.measureId,
      measureNumber: textAnnotation.measureNumber,
      beatIndex: textAnnotation.beatIndex !== undefined ? textAnnotation.beatIndex : 0,
      placement: textAnnotation.placement || 'above',
    });
  }, []);

  const handleOpenAddTextModal = useCallback(
    (measureId: string, beatIndex: number, placement?: 'above' | 'below') => {
      const meas = score.measures.find((m) => m.id === measureId);
      setTextModalConfig({
        isOpen: true,
        measureId,
        measureNumber: meas?.measureNumber || 1,
        beatIndex,
        placement: placement || 'above',
      });
    },
    [score.measures]
  );

  // Delete Selected Event (chord, lyric, text annotation, or note/beat)
  const handleDeleteSelected = useCallback(() => {
    if (selection.textAnnotationId || selection.selectionType === 'text') {
      const textId = selection.textAnnotationId || (selection.eventId as string);
      if (textId) {
        handleDeleteTextAnnotation(textId);
        return;
      }
    }
    if (selection.selectionType === 'chord') {
      if (selection.measureId && selection.beatIndex !== undefined) {
        handleUpdateBeatChord(selection.measureId, selection.beatIndex, '');
        showToast(`Chord on Beat ${selection.beatIndex + 1} deleted`);
      }
      return;
    }
    if (selection.selectionType === 'lyrics') {
      if (selection.measureId && selection.beatIndex !== undefined) {
        handleUpdateBeatLyric(selection.measureId, selection.beatIndex, '', selection.subBeatIndex);
        showToast(`Lyric on Beat ${selection.beatIndex + 1} cleared`);
      }
      return;
    }
    handleClearCurrentBeat();
  }, [
    selection,
    handleDeleteTextAnnotation,
    handleUpdateBeatChord,
    handleUpdateBeatLyric,
    handleClearCurrentBeat,
    showToast,
  ]);

  // Transpose Selected Note Up / Down (supports Pianotastic subdivision notes and standard events)
  const handleTransposeSelected = useCallback((stepDelta: number) => {
    try {
      const currentMeasureId = selection.measureId || score.measures[0]?.id;
      const measureIdx = Math.max(0, score.measures.findIndex((m) => m.id === currentMeasureId));
      const currentMeasure = score.measures[measureIdx];
      if (!currentMeasure) return;

      const curBeat = selection.beatIndex !== undefined ? selection.beatIndex : 0;
      const curSubBeat = selection.subBeatIndex || 0;
      const curBeatNotes = currentMeasure.beatNotes?.[curBeat] || [];

      if (curBeatNotes[curSubBeat] && curBeatNotes[curSubBeat]?.step) {
        // Transpose the active Pianotastic subdivision note!
        const curPitch = curBeatNotes[curSubBeat];
        const curStepVal = getDiatonicStepValue(curPitch);
        const nextStepVal = curStepVal + stepDelta;
        const nextPitch = pitchFromDiatonicStepValue(nextStepVal);
        const updatedPitch: Pitch = {
          step: nextPitch.step,
          octave: nextPitch.octave,
          accidental: curPitch.accidental,
        };

        const nextNotes = { ...(currentMeasure.beatNotes || {}) };
        const updatedSlotNotes = [...curBeatNotes];
        updatedSlotNotes[curSubBeat] = updatedPitch;
        nextNotes[curBeat] = updatedSlotNotes;

        const updatedM: Measure = {
          ...currentMeasure,
          beatNotes: nextNotes,
        };
        const syncedM = syncMeasureEventsFromBeatData(
          updatedM,
          score.metadata.initialTimeSignature,
          score.metadata.handTemplate || 'Both'
        );

        const updatedMeasures = score.measures.map((m, i) => (i === measureIdx ? syncedM : m));
        const updated: Score = { ...score, measures: updatedMeasures };
        pushScoreState(updated);
        try {
          audioEngine.playPitch(updatedPitch, score.metadata.initialKeySignature, 0.4);
        } catch (audioErr) {
          console.warn('Audio pitch error:', audioErr);
        }
        return;
      }

      // Fallback for grand staff note event
      if (!selection.eventId) return;
      const updatedMeasures = score.measures.map((m) => {
        if (m.id !== currentMeasureId) return m;
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
          if (updatedPitches[0]) {
            try {
              audioEngine.playPitch(updatedPitches[0], score.metadata.initialKeySignature, 0.4);
            } catch (err) {
              console.warn('Audio pitch error:', err);
            }
          }
          return { ...ev, pitches: updatedPitches };
        });
        return {
          ...m,
          rhEvents: selection.staff === 'RH' ? updatedList : m.rhEvents,
          lhEvents: selection.staff === 'LH' ? updatedList : m.lhEvents,
        };
      });
      const updated: Score = { ...score, measures: updatedMeasures };
      pushScoreState(updated);
    } catch (err) {
      console.error('Error in handleTransposeSelected:', err);
    }
  }, [selection, score, pushScoreState]);

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only process shortcuts when in notation editor
      if (viewMode !== 'editor') {
        return;
      }

      // Ignore if user is in an input or textarea or contenteditable element
      const targetEl = e.target as HTMLElement | null;
      const activeEl = document.activeElement as HTMLElement | null;
      if (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(targetEl?.tagName || '') ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl?.tagName || '') ||
        targetEl?.isContentEditable ||
        activeEl?.isContentEditable
      ) {
        return;
      }

      // Ignore shortcuts if modal or dialog is open
      if (
        isNewScoreModalOpen ||
        isSaveAsModalOpen ||
        isLibraryModalOpen ||
        isCustomTimeSigOpen ||
        isChordDialogOpen ||
        isShortcutsOpen ||
        Boolean(textModalConfig?.isOpen)
      ) {
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

      // Space -> Play / Pause from selected measure/beat/subdivision
      if (e.code === 'Space') {
        e.preventDefault();
        if (audioEngine.getIsPlaying()) {
          audioEngine.pausePlayback();
        } else {
          let mIdx = 0;
          let bIdx = 0;
          let subIdx = 0;
          if (selection?.measureId) {
            const found = score.measures.findIndex((m) => m.id === selection.measureId);
            if (found !== -1) {
              mIdx = found;
              bIdx = selection.beatIndex !== undefined ? selection.beatIndex : 0;
              subIdx = selection.subBeatIndex !== undefined ? selection.subBeatIndex : 0;
            }
          } else if (playbackPosition) {
            mIdx = playbackPosition.measureIndex;
            bIdx = Math.floor(playbackPosition.beat);
          }
          audioEngine.playScore(score, mIdx, bIdx, subIdx);
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
      if (e.key.toLowerCase() === 't') {
        setToolMode('text');
        return;
      }

      // Shift + C -> Open Chord Symbol Dialog (Must require Shift so normal C enters pitch)
      if (e.shiftKey && (e.key === 'C' || e.key === 'c' || e.code === 'KeyC')) {
        e.preventDefault();
        setIsChordDialogOpen(true);
        return;
      }

      // Note Value shortcuts: 1..4 and F1..F4 (Pianotastic notation workflow)
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        if (e.key === '1' || e.key === 'F1' || e.code === 'Digit1' || e.code === 'Numpad1' || e.code === 'F1') {
          e.preventDefault();
          handleChangeBeatValue(1);
          return;
        }
        if (e.key === '2' || e.key === 'F2' || e.code === 'Digit2' || e.code === 'Numpad2' || e.code === 'F2') {
          e.preventDefault();
          handleChangeBeatValue(2);
          return;
        }
        if (e.key === '3' || e.key === 'F3' || e.code === 'Digit3' || e.code === 'Numpad3' || e.code === 'F3') {
          e.preventDefault();
          handleChangeBeatValue(3);
          return;
        }
        if (e.key === '4' || e.key === 'F4' || e.code === 'Digit4' || e.code === 'Numpad4' || e.code === 'F4') {
          e.preventDefault();
          handleChangeBeatValue(4);
          return;
        }
      }

      // Intentional empty subdivision (dot / period '.') in Pianotastic notation
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === '.') {
        e.preventDefault();
        handleAdvanceSubdivisionWithoutNote();
        return;
      }

      // Delete / Backspace -> Clears selected text or beat to '—' or subdivision to '.', or moves back
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (selection.textAnnotationId || selection.selectionType === 'text') {
          const textId = selection.textAnnotationId || (selection.eventId as string);
          if (textId) {
            handleDeleteTextAnnotation(textId);
            return;
          }
        }
        handleClearCurrentBeat();
        return;
      }

      // Enter -> Manual Line Break
      if (e.key === 'Enter') {
        e.preventDefault();
        handleToggleLineBreak();
        return;
      }

      // Horizontal arrow navigation across beats and subdivisions
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const currentMeasureId = selection.measureId || score.measures[0]?.id;
        const measureIdx = Math.max(0, score.measures.findIndex((m) => m.id === currentMeasureId));
        const curMeasure = score.measures[measureIdx];
        if (!curMeasure) return;
        const curBeat = selection.beatIndex !== undefined ? selection.beatIndex : 0;
        const curSub = selection.subBeatIndex || 0;
        const pickup = score.metadata.pickupBeat || 1;

        if (curSub > 0) {
          // Move to previous subdivision within this beat
          setSelection((sel) => ({ ...sel, subBeatIndex: curSub - 1 }));
        } else if (curBeat > 0) {
          if (!isBeatLockedByPickup(curMeasure.measureNumber, curBeat - 1, pickup)) {
            const prevBeatVal = getEffectiveBeatValue(score, measureIdx, curBeat - 1);
            setSelection((sel) => ({
              ...sel,
              beatIndex: curBeat - 1,
              subBeatIndex: Math.max(0, prevBeatVal - 1),
            }));
          }
        } else if (measureIdx > 0) {
          const prevM = score.measures[measureIdx - 1];
          const prevTotal = getMeasureTotalBeats(prevM, score.metadata.initialTimeSignature);
          const prevBeatVal = getEffectiveBeatValue(score, measureIdx - 1, prevTotal - 1);
          setSelection({
            measureId: prevM.id,
            staff: activeHand === 'LH' ? 'LH' : 'RH',
            eventId: null,
            beatIndex: prevTotal - 1,
            subBeatIndex: Math.max(0, prevBeatVal - 1),
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
        const curSub = selection.subBeatIndex || 0;
        const totalBeats = getMeasureTotalBeats(curMeasure, score.metadata.initialTimeSignature);
        const effVal = getEffectiveBeatValue(score, measureIdx, curBeat);

        if (curSub + 1 < effVal) {
          // Move to next subdivision within this beat
          setSelection((sel) => ({ ...sel, subBeatIndex: curSub + 1 }));
        } else if (curBeat < totalBeats - 1) {
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
      if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey &&
        ['C', 'D', 'E', 'F', 'G', 'A', 'B'].includes(upper)
      ) {
        e.preventDefault();
        const octave = activeHand === 'LH' ? 3 : 4;
        const pitch: Pitch = {
          step: upper as NoteStep,
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
    handleAdvanceSubdivisionWithoutNote,
    handleToggleLineBreak,
    handleTransposeSelected,
    handlePianotasticNoteInput,
    handleChangeBeatValue,
    score,
    playbackPosition,
    selection,
    activeHand,
    selectedAccidental,
    viewMode,
    isNewScoreModalOpen,
    isSaveAsModalOpen,
    isLibraryModalOpen,
    isCustomTimeSigOpen,
    isChordDialogOpen,
    isShortcutsOpen,
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

  // 2. Print Studio Screen (Dedicated view for paper printing and PDF generation)
  if (viewMode === 'print') {
    return (
      <PrintStudio
        score={score}
        onBackToEditor={() => setViewMode('editor')}
      />
    );
  }

  // 3. Notation Studio Editor Screen
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
        onNavigateHome={requestNavigateHome}
        onOpenNewPageModal={requestNewProject}
        onSaveProject={handleSaveProject}
        onOpenSaveAs={() => setIsSaveAsModalOpen(true)}
        onOpenProjectLibrary={() => requestOpenProject()}
        onOpenPrintStudio={() => setViewMode('print')}
        onAddMeasure={handleAddMeasureAtEnd}
        onOpenCustomTimeSignature={() => setIsCustomTimeSigOpen(true)}
        onChangeTimeSignature={handleChangeTimeSignature}
        onOpenChordDialog={() => setIsChordDialogOpen(true)}
        onResetLayout={handleResetLayout}
      />

      {/* 2. Main Notation Toolbar */}
      {(() => {
        const activeMeasureIdx = score.measures.findIndex((m) => m.id === selection.measureId);
        const curMeasureNum = activeMeasureIdx >= 0 ? activeMeasureIdx + 1 : 1;
        const curBeatNum = (selection.beatIndex !== undefined ? selection.beatIndex : 0) + 1;
        const curSubBeatNum = (selection.subBeatIndex !== undefined ? selection.subBeatIndex : 0) + 1;
        const curBeatVal = getEffectiveBeatValue(
          score,
          Math.max(0, activeMeasureIdx),
          selection.beatIndex !== undefined ? selection.beatIndex : 0
        );
        const positionText = `Bar ${curMeasureNum} • Beat ${curBeatNum}${
          curBeatVal > 1 ? ` [${curSubBeatNum}/${curBeatVal}]` : ''
        } • Value ${curBeatVal}`;

        return (
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
            currentBeatValue={curBeatVal}
            onChangeBeatValue={handleChangeBeatValue}
            activePositionText={positionText}
            isInspectorOpen={isInspectorOpen}
            onToggleInspector={() => setIsInspectorOpen((prev) => !prev)}
          />
        );
      })()}

      {/* Central Workspace: Left Palette + Score Canvas + Right Inspector */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* 3. Left-side Tool Palette */}
        <LeftToolPalette
          score={score}
          onUpdateLayout={handleUpdateLayout}
        />

        {/* 4. Central Score Canvas (Custom Pianotastic Notation) */}
        <div
          id="score-viewport-container"
          className="flex-1 h-full overflow-y-auto overflow-x-auto flex flex-col bg-stone-200/50 relative scroll-smooth"
        >
          <ErrorBoundary fallbackMessage="The notation canvas encountered a temporary rendering issue. Your edits and project are safe.">
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
              onSelectBeat={(measureId, beatIndex, subBeatIndex, selectionType) =>
                setSelection((sel) => ({
                  ...sel,
                  measureId,
                  beatIndex,
                  subBeatIndex: subBeatIndex ?? 0,
                  selectionType: selectionType || 'beat',
                  eventId: null,
                }))
              }
              onUpdateBeatLyric={handleUpdateBeatLyric}
              onUpdateBeatChord={handleUpdateBeatChord}
              onToggleBeatSymbol={handleToggleBeatSymbol}
              onInsertNote={handleInsertNote}
              onDeleteSelected={handleDeleteSelected}
              onMeasureWidthChange={handleMeasureWidthChange}
              onMeasureContextMenu={(measure, x, y) =>
                setContextMenu({ measure, x, y })
              }
              onOpenNavigationPalette={(measure) =>
                setNavigationModalMeasure(measure)
              }
              onToggleLineBreak={handleToggleLineBreak}
              onSelectTextAnnotation={handleSelectTextAnnotation}
              onEditTextAnnotation={handleEditTextAnnotation}
              onOpenAddTextModal={handleOpenAddTextModal}
              onMoveTextAnnotation={handleMoveTextAnnotation}
              onDeleteTextAnnotation={handleDeleteTextAnnotation}
            />
          </ErrorBoundary>
        </div>

        {/* 5. Right-side Collapsible Contextual Properties Inspector */}
        <PropertiesPanel
          isOpen={isInspectorOpen}
          onClose={() => setIsInspectorOpen(false)}
          score={score}
          selection={selection}
          activeHand={activeHand}
          currentBeatValue={getEffectiveBeatValue(
            score,
            Math.max(0, score.measures.findIndex((m) => m.id === (selection.measureId || score.measures[0]?.id))),
            selection.beatIndex !== undefined ? selection.beatIndex : 0
          )}
          onChangeBeatValue={handleChangeBeatValue}
          onUpdateBeatChord={handleUpdateBeatChord}
          onUpdateBeatLyric={handleUpdateBeatLyric}
          onToggleBeatSymbol={handleToggleBeatSymbol}
          onClearCurrentBeat={handleClearCurrentBeat}
          onTransposeSelected={handleTransposeSelected}
          onToggleLineBreak={handleToggleLineBreak}
          onSelectBeat={(mId, bIdx, subIdx) =>
            setSelection((sel) => ({
              ...sel,
              measureId: mId,
              beatIndex: bIdx,
              subBeatIndex: subIdx ?? 0,
            }))
          }
          onUpdateScoreMetadata={handleUpdateMetadata}
          onUpdateLayout={handleUpdateLayout}
          onUpdateMeasure={handleUpdateMeasure}
          onAddMeasure={handleAddMeasure}
          onInsertMeasureBefore={handleInsertMeasureBefore}
          onInsertMeasureAfter={handleInsertMeasureAfter}
          onDuplicateMeasure={handleDuplicateMeasure}
          onDeleteMeasure={handleDeleteMeasure}
          onClearMeasure={handleClearMeasure}
          onOpenCustomTimeSignature={() => setIsCustomTimeSigOpen(true)}
          onOpenChordDialog={() => setIsChordDialogOpen(true)}
          onResetLayout={handleResetLayout}
          onOpenAddTextModal={handleOpenAddTextModal}
          onEditTextAnnotation={handleEditTextAnnotation}
          onDeleteTextAnnotation={handleDeleteTextAnnotation}
          onUpdateTextAnnotation={handleUpdateTextAnnotation}
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
        selection={selection}
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
          const currentBeat = selection.beatIndex !== undefined ? selection.beatIndex : 0;
          handleUpdateBeatChord(selection.measureId, currentBeat, chord.formatted);
          if (chord.formatted) {
            audioEngine.playChord(chord.formatted);
          }
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
          onToggleLineBreak={handleToggleLineBreak}
        />
      )}

      {/* Floating Layout / Action Toast Notification */}
      {appToast && (
        <div className="fixed bottom-14 left-1/2 -translate-x-1/2 z-50 bg-stone-900/95 text-white px-4 py-2 rounded-full shadow-lg border border-stone-700 text-xs font-medium backdrop-blur-xs flex items-center space-x-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <span>{appToast}</span>
        </div>
      )}

      {/* Save Copy As Modal */}
      <SaveAsModal
        isOpen={isSaveAsModalOpen}
        currentTitle={score.metadata.title}
        onClose={() => setIsSaveAsModalOpen(false)}
        onSaveCopy={handleSaveCopy}
      />

      {/* Project Library Modal */}
      <ProjectLibraryModal
        isOpen={isLibraryModalOpen}
        projects={savedProjects}
        currentProjectId={score.id}
        onClose={() => setIsLibraryModalOpen(false)}
        onOpenProject={(proj) => {
          setIsLibraryModalOpen(false);
          requestOpenProject(proj);
        }}
        onDeleteProject={handleDeleteProject}
        onDuplicateProject={handleDuplicateProject}
        onNewProject={() => {
          setIsLibraryModalOpen(false);
          requestNewProject();
        }}
      />

      {/* Unsaved Changes Confirmation Modal */}
      <UnsavedChangesModal
        isOpen={unsavedModalConfig.isOpen}
        projectTitle={score.metadata.title}
        actionType={unsavedModalConfig.actionType}
        onSaveAndProceed={() => {
          handleSaveProject();
          const act = unsavedModalConfig.actionType;
          const target = unsavedModalConfig.pendingTarget;
          setUnsavedModalConfig({ isOpen: false, actionType: 'new', pendingTarget: null });
          if (act === 'new') {
            handleOpenNewPageModal();
          } else if (act === 'open') {
            if (target) {
              handleSelectProject(target);
            } else {
              setIsLibraryModalOpen(true);
            }
          } else if (act === 'home') {
            audioEngine.stopPlayback();
            setPlaybackPosition(null);
            setViewMode('home');
          }
        }}
        onDiscardAndProceed={() => {
          setIsDirty(false);
          const act = unsavedModalConfig.actionType;
          const target = unsavedModalConfig.pendingTarget;
          setUnsavedModalConfig({ isOpen: false, actionType: 'new', pendingTarget: null });
          if (act === 'new') {
            handleOpenNewPageModal();
          } else if (act === 'open') {
            if (target) {
              handleSelectProject(target);
            } else {
              setIsLibraryModalOpen(true);
            }
          } else if (act === 'home') {
            audioEngine.stopPlayback();
            setPlaybackPosition(null);
            setViewMode('home');
          }
        }}
        onCancel={() => {
          setUnsavedModalConfig({ isOpen: false, actionType: 'new', pendingTarget: null });
        }}
      />

      {/* New Page Template Setup Modal */}
      <NewScoreSetupModal
        isOpen={isNewScoreModalOpen}
        onClose={handleCloseNewPageModal}
        onCreateScore={handleCreateScore}
      />

      {/* Score Text Annotation Tool Modal */}
      {textModalConfig?.isOpen && (
        <TextAnnotationModal
          isOpen={textModalConfig.isOpen}
          onClose={() => setTextModalConfig(null)}
          onSaveText={handleSaveTextAnnotation}
          onDeleteText={handleDeleteTextAnnotation}
          initialData={
            textModalConfig.initialData || {
              measureId: textModalConfig.measureId,
              measureNumber: textModalConfig.measureNumber,
              beatIndex: textModalConfig.beatIndex,
              placement: textModalConfig.placement,
            }
          }
          targetMeasureNumber={textModalConfig.measureNumber}
          targetBeatNumber={textModalConfig.beatIndex + 1}
        />
      )}
    </div>
  );
}
