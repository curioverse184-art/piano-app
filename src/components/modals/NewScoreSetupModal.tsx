import React, { useState } from 'react';
import { HandTemplate } from '../../types/score';
import { MAJOR_SCALES, MINOR_SCALES } from '../../utils/musicTheory';
import { INDIAN_TAALS } from '../../utils/indianTaals';
import { NewScoreConfig } from '../../services/projectStorageService';
import {
  X,
  ArrowRight,
  ArrowLeft,
  Check,
  Music,
  Sliders,
  Sparkles,
  Info,
  Clock,
  Hash,
  Layers,
  ChevronDown,
} from 'lucide-react';

interface NewScoreSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateScore: (config: NewScoreConfig) => void;
}

export const NewScoreSetupModal: React.FC<NewScoreSetupModalProps> = ({
  isOpen,
  onClose,
  onCreateScore,
}) => {
  // Step state
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1: Template selection ('Both', 'RH', 'LH')
  const [selectedTemplate, setSelectedTemplate] = useState<HandTemplate>('Both');

  // Step 2: Score Settings
  const [scaleMode, setScaleMode] = useState<'major' | 'minor'>('major');
  const [selectedScaleId, setSelectedScaleId] = useState<string>('C_major');
  const [selectedTaalId, setSelectedTaalId] = useState<string>('Dadra');
  const [tempoBpm, setTempoBpm] = useState<number>(80);
  const [measuresCount, setMeasuresCount] = useState<number>(16);
  const [pickupBeat, setPickupBeat] = useState<number>(1);
  const [barsPerLine, setBarsPerLine] = useState<number>(4);

  // Custom options toggle
  const [isCustomExpanded, setIsCustomExpanded] = useState<boolean>(false);
  const [customNumerator, setCustomNumerator] = useState<number>(4);
  const [customDenominator, setCustomDenominator] = useState<number>(4);

  // Metadata
  const [title, setTitle] = useState<string>('My Piano Composition');
  const [subtitle, setSubtitle] = useState<string>('');
  const [composer, setComposer] = useState<string>('Pianotastic Academy');
  const [lyricist, setLyricist] = useState<string>('');
  const [copyright, setCopyright] = useState<string>('© Pianotastic Academy. All rights reserved.');

  if (!isOpen) return null;

  const currentTaalDef = INDIAN_TAALS.find((t) => t.id === selectedTaalId) || INDIAN_TAALS[0];

  const handleNext = () => {
    setStep(2);
  };

  const handleBack = () => {
    setStep(1);
  };

  const handleDone = () => {
    const config: NewScoreConfig = {
      template: selectedTemplate,
      scaleId: selectedScaleId,
      taalId: selectedTaalId,
      tempoBpm,
      measuresCount: Math.max(1, measuresCount),
      pickupBeat: Math.max(1, pickupBeat),
      pickupMeasure: 1, // backwards compat
      barsPerLine: Math.max(1, barsPerLine),
      title: title.trim() || 'Untitled Score',
      subtitle: subtitle.trim(),
      composer: composer.trim() || 'Pianotastic Academy',
      lyricist: lyricist.trim(),
      copyright: copyright.trim(),
      customNumerator: isCustomExpanded ? customNumerator : undefined,
      customDenominator: isCustomExpanded ? customDenominator : undefined,
    };
    onCreateScore(config);
  };

  // Helper for quick measure presets
  const measurePresets = [8, 12, 16, 24, 32];

  // Helper to render live staff preview
  const renderLiveStaffPreview = (template: HandTemplate) => {
    const isBoth = template === 'Both';
    const isRH = template === 'RH';
    const isLH = template === 'LH';

    return (
      <div className="w-full bg-[#fdfbf7] p-4 rounded-xl border border-stone-200/90 shadow-inner flex flex-col items-center select-none overflow-hidden">
        {/* Paper title mock */}
        <div className="text-center mb-3">
          <span className="text-[10px] tracking-wider uppercase font-bold text-amber-700 block">
            {isBoth ? 'Grand Staff Piano Template' : isRH ? 'Right Hand (Treble) Template' : 'Left Hand (Bass) Template'}
          </span>
          <h4 className="font-serif text-sm font-bold text-stone-800 tracking-tight">
            {title || 'Untitled Composition'}
          </h4>
          <p className="text-[10px] text-stone-500 font-serif italic">
            {isBoth ? 'Treble & Bass Clefs • Piano Grand Staff' : isRH ? 'Treble Clef • Solo Melody / Right Hand' : 'Bass Clef • Accompaniment / Left Hand'}
          </p>
        </div>

        {/* Pianotastic Custom Notation Format Preview */}
        <div className="w-full bg-white rounded-lg border border-stone-300 p-2.5 shadow-xs">
          <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
            <span>Pianotastic Notation Format</span>
            <span className="text-amber-700 font-semibold">{selectedTemplate === 'Both' ? 'Both Hands' : selectedTemplate === 'RH' ? 'Right Hand' : 'Left Hand'}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Measure 1 Block */}
            <div className="border border-stone-300 rounded-md bg-white overflow-hidden text-xs">
              {/* Measure Header */}
              <div className="flex items-center justify-between px-2 py-0.5 bg-stone-50 border-b border-stone-200 text-[10px] text-stone-600 font-bold">
                <span>
                  Bar 1 {pickupBeat > 1 && <span className="text-amber-700">(Pickup @ Beat {pickupBeat})</span>}
                </span>
                <span className="text-[9px] uppercase text-stone-400 font-semibold">Intro</span>
              </div>
              {/* Chord Row */}
              <div className="grid grid-cols-4 px-1 py-0.5 text-center text-blue-600 font-bold text-xs">
                <span>C</span>
                <span></span>
                <span></span>
                <span>G</span>
              </div>
              {/* Beat Number Row */}
              <div className="grid grid-cols-4 px-1 text-center text-[10px] font-bold text-stone-400 border-t border-stone-100">
                <span className={pickupBeat > 1 ? 'text-amber-700' : ''}>1{pickupBeat > 1 ? '🔒' : ''}</span>
                <span className={pickupBeat > 2 ? 'text-amber-700' : ''}>2{pickupBeat > 2 ? '🔒' : ''}</span>
                <span className={pickupBeat > 3 ? 'text-amber-700' : ''}>3{pickupBeat > 3 ? '🔒' : ''}</span>
                <span>4</span>
              </div>
              {/* Note Letter Row */}
              <div className="grid grid-cols-4 px-1 py-1 text-center text-sm font-bold text-stone-900 border-t border-stone-100">
                <span className={pickupBeat > 1 ? 'text-stone-300' : ''}>{pickupBeat > 1 ? '—' : 'C'}</span>
                <span className={pickupBeat > 2 ? 'text-stone-300' : ''}>{pickupBeat > 2 ? '—' : 'D'}</span>
                <span className={pickupBeat > 3 ? 'text-stone-300' : ''}>{pickupBeat > 3 ? '—' : 'E'}</span>
                <span>F</span>
              </div>
              {/* Lyrics Row */}
              <div className="grid grid-cols-4 px-1 py-0.5 text-center text-[10px] text-stone-600 border-t border-stone-100 bg-stone-50/50">
                <span>{pickupBeat > 1 ? '' : 'Pia-'}</span>
                <span>{pickupBeat > 2 ? '' : 'no-'}</span>
                <span>{pickupBeat > 3 ? '' : 'tas-'}</span>
                <span>tic</span>
              </div>
            </div>

            {/* Measure 2 Block */}
            <div className="border border-stone-300 rounded-md bg-white overflow-hidden text-xs">
              {/* Measure Header */}
              <div className="flex items-center justify-between px-2 py-0.5 bg-stone-50 border-b border-stone-200 text-[10px] text-stone-600 font-bold">
                <span>Bar 2</span>
                <span className="text-[9px] uppercase text-stone-400 font-semibold">Verse</span>
              </div>
              {/* Chord Row */}
              <div className="grid grid-cols-4 px-1 py-0.5 text-center text-blue-600 font-bold text-xs">
                <span>Am</span>
                <span></span>
                <span>F</span>
                <span></span>
              </div>
              {/* Beat Number Row */}
              <div className="grid grid-cols-4 px-1 text-center text-[10px] font-bold text-stone-400 border-t border-stone-100">
                <span>1</span>
                <span>2</span>
                <span>3</span>
                <span>4</span>
              </div>
              {/* Note Letter Row */}
              <div className="grid grid-cols-4 px-1 py-1 text-center text-sm font-bold text-stone-900 border-t border-stone-100">
                <span>G</span>
                <span>A</span>
                <span>B</span>
                <span>C</span>
              </div>
              {/* Lyrics Row */}
              <div className="grid grid-cols-4 px-1 py-0.5 text-center text-[10px] text-stone-600 border-t border-stone-100 bg-stone-50/50">
                <span>Do</span>
                <span>Re</span>
                <span>Mi</span>
                <span>Fa</span>
              </div>
            </div>
          </div>
        </div>

        {/* Live specs pill */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-3 text-[11px] text-stone-600 font-medium">
          <span className="bg-amber-100/80 text-amber-900 px-2 py-0.5 rounded-md border border-amber-200">
            {selectedTemplate === 'Both' ? 'Both Hands' : selectedTemplate === 'RH' ? 'Right Hand' : 'Left Hand'}
          </span>
          <span className="bg-stone-200/70 text-stone-700 px-2 py-0.5 rounded-md">
            {MAJOR_SCALES.find((s) => s.id === selectedScaleId)?.name ||
              MINOR_SCALES.find((s) => s.id === selectedScaleId)?.name ||
              'C Major'}
          </span>
          {selectedTaalId !== 'None' && (
            <span className="bg-orange-100 text-orange-900 px-2 py-0.5 rounded-md border border-orange-200 font-semibold">
              Taal: {currentTaalDef.name} ({currentTaalDef.beats} Beats)
            </span>
          )}
          <span className="bg-stone-200/70 text-stone-700 px-2 py-0.5 rounded-md">
            {tempoBpm} BPM
          </span>
          <span className="bg-stone-200/70 text-stone-700 px-2 py-0.5 rounded-md">
            {measuresCount} Bars
          </span>
          {pickupBeat > 1 && (
            <span className="bg-blue-100 text-blue-900 px-2 py-0.5 rounded-md border border-blue-200 font-semibold">
              Starts Beat {pickupBeat}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      id="new-score-setup-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-stone-900 text-white flex items-center justify-between border-b border-stone-800">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-stone-100">
                {step === 1 ? 'New Page Setup — Step 1: Select Template' : 'New Page Setup — Step 2: Additional Score Information'}
              </h3>
              <p className="text-xs text-stone-400">
                {step === 1
                  ? 'Choose your hand layout template to generate staff notation'
                  : 'Configure key signature, rhythm taal, tempo, bar count & metadata'}
              </p>
            </div>
          </div>
          <button
            id="close-new-page-modal"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Progress Indicators */}
        <div className="px-6 py-2.5 bg-stone-100 border-b border-stone-200/80 flex items-center justify-between text-xs font-medium">
          <div className="flex items-center space-x-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step === 1 ? 'bg-amber-600 text-white shadow-xs' : 'bg-stone-300 text-stone-700'
              }`}
            >
              1
            </span>
            <span className={step === 1 ? 'font-bold text-stone-900' : 'text-stone-600'}>
              Template Selection
            </span>
            <span className="text-stone-400">→</span>
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step === 2 ? 'bg-amber-600 text-white shadow-xs' : 'bg-stone-300 text-stone-700'
              }`}
            >
              2
            </span>
            <span className={step === 2 ? 'font-bold text-stone-900' : 'text-stone-600'}>
              Score Settings & Indian Taal
            </span>
          </div>

          <span className="text-stone-500 text-[11px]">
            Step {step} of 2
          </span>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto flex-1 text-stone-800">
          {/* STEP 1: Template Selection (Left: Options, Right: Live Preview) */}
          {step === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* LEFT SIDE — Template Options */}
              <div className="md:col-span-5 space-y-3">
                <div className="mb-2">
                  <h4 className="font-bold text-sm text-stone-900">Select Hand Template</h4>
                  <p className="text-xs text-stone-500">
                    Choose whether you are writing for Left Hand, Right Hand, or Both Hands.
                  </p>
                </div>

                {/* Template Option 1: Left Hand */}
                <button
                  id="template-option-lh"
                  onClick={() => setSelectedTemplate('LH')}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-start space-x-3.5 ${
                    selectedTemplate === 'LH'
                      ? 'border-amber-600 bg-amber-50/50 shadow-md ring-2 ring-amber-500/20'
                      : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50/60'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center text-base font-bold shrink-0 ${
                      selectedTemplate === 'LH'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-stone-100 text-stone-700'
                    }`}
                  >
                    LH
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-stone-900">Left Hand</span>
                      {selectedTemplate === 'LH' && <Check className="w-4 h-4 text-amber-600" />}
                    </div>
                    <p className="text-xs text-stone-600 mt-0.5">
                      Bass Clef only. Single 5-line staff ideal for bass lines, left-hand studies, and cello/bass accompaniment.
                    </p>
                  </div>
                </button>

                {/* Template Option 2: Right Hand */}
                <button
                  id="template-option-rh"
                  onClick={() => setSelectedTemplate('RH')}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-start space-x-3.5 ${
                    selectedTemplate === 'RH'
                      ? 'border-amber-600 bg-amber-50/50 shadow-md ring-2 ring-amber-500/20'
                      : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50/60'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center text-base font-bold shrink-0 ${
                      selectedTemplate === 'RH'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-stone-100 text-stone-700'
                    }`}
                  >
                    RH
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-stone-900">Right Hand</span>
                      {selectedTemplate === 'RH' && <Check className="w-4 h-4 text-amber-600" />}
                    </div>
                    <p className="text-xs text-stone-600 mt-0.5">
                      Treble Clef only. Single 5-line staff ideal for vocal leads, solo melodies, right-hand etudes, and lead sheets.
                    </p>
                  </div>
                </button>

                {/* Template Option 3: Both Hands */}
                <button
                  id="template-option-both"
                  onClick={() => setSelectedTemplate('Both')}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-start space-x-3.5 ${
                    selectedTemplate === 'Both'
                      ? 'border-amber-600 bg-amber-50/50 shadow-md ring-2 ring-amber-500/20'
                      : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50/60'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center text-base font-bold shrink-0 ${
                      selectedTemplate === 'Both'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-stone-100 text-stone-700'
                    }`}
                  >
                    BH
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-stone-900">Both Hands</span>
                      {selectedTemplate === 'Both' && <Check className="w-4 h-4 text-amber-600" />}
                    </div>
                    <p className="text-xs text-stone-600 mt-0.5">
                      Grand Staff with Brace. Complete piano score pairing Treble and Bass staves for two-handed performance.
                    </p>
                  </div>
                </button>
              </div>

              {/* RIGHT SIDE — Live Preview Panel */}
              <div className="md:col-span-7 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-stone-900">Live Template Preview</h4>
                  <span className="text-[11px] text-stone-500">Updates immediately upon selection</span>
                </div>

                {renderLiveStaffPreview(selectedTemplate)}

                <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 text-xs text-stone-600 flex items-start space-x-2">
                  <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    Click <strong>Next</strong> to configure Scale/Key, Indian Taal, Tempo, Measure count, and Starting/Pickup bar.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Additional Score Information */}
          {step === 2 && (
            <div className="space-y-6">
              {/* Top Banner: Keep selected template and live preview available */}
              <div className="bg-amber-50/40 p-3 rounded-xl border border-amber-200/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center space-x-2.5">
                  <span className="px-2.5 py-1 bg-amber-600 text-white font-bold text-xs rounded-md shadow-2xs">
                    Template: {selectedTemplate === 'Both' ? 'Both Hands (Grand Staff)' : selectedTemplate === 'RH' ? 'Right Hand (Treble)' : 'Left Hand (Bass)'}
                  </span>
                  <span className="text-xs text-stone-600">
                    Live preview active below. Adjust musical settings and click <strong>Done</strong> to open editor.
                  </span>
                </div>

                <button
                  onClick={handleBack}
                  className="text-xs font-semibold text-amber-800 hover:text-amber-950 underline self-start md:self-auto"
                >
                  Change Hand Template
                </button>
              </div>

              {/* Musical Settings Grid */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                <div className="md:col-span-7 space-y-5">
                  {/* 1. Scale / Key Selection */}
                  <div className="space-y-2 bg-stone-50/60 p-4 rounded-xl border border-stone-200/90">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-stone-900 uppercase tracking-wider flex items-center space-x-1.5">
                        <Music className="w-3.5 h-3.5 text-amber-600" />
                        <span>1. Scale / Key</span>
                      </label>

                      {/* Major / Minor Tab Switcher */}
                      <div className="flex items-center space-x-1 bg-stone-200/70 p-0.5 rounded-lg text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setScaleMode('major');
                            setSelectedScaleId('C_major');
                          }}
                          className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                            scaleMode === 'major'
                              ? 'bg-white text-stone-900 shadow-xs'
                              : 'text-stone-600 hover:text-stone-900'
                          }`}
                        >
                          12 Major Scales
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setScaleMode('minor');
                            setSelectedScaleId('A_minor');
                          }}
                          className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                            scaleMode === 'minor'
                              ? 'bg-white text-stone-900 shadow-xs'
                              : 'text-stone-600 hover:text-stone-900'
                          }`}
                        >
                          12 Minor Scales
                        </button>
                      </div>
                    </div>

                    {/* Scale Grid (12 Major or 12 Minor) */}
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 pt-1">
                      {(scaleMode === 'major' ? MAJOR_SCALES : MINOR_SCALES).map((scale) => {
                        const isSelected = selectedScaleId === scale.id;
                        return (
                          <button
                            key={scale.id}
                            type="button"
                            onClick={() => setSelectedScaleId(scale.id)}
                            className={`p-2 rounded-lg border text-left transition-all ${
                              isSelected
                                ? 'bg-amber-600 text-white font-bold border-amber-600 shadow-2xs'
                                : 'bg-white border-stone-200 text-stone-800 hover:bg-stone-100'
                            }`}
                          >
                            <span className="block text-xs font-bold leading-none">{scale.name}</span>
                            <span
                              className={`block text-[10px] mt-1 leading-tight truncate ${
                                isSelected ? 'text-amber-100' : 'text-stone-500'
                              }`}
                            >
                              {scale.accidentalSummary}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Indian Taal Selection */}
                  <div className="space-y-2 bg-orange-50/40 p-4 rounded-xl border border-orange-200/80">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-stone-900 uppercase tracking-wider flex items-center space-x-1.5">
                        <Layers className="w-3.5 h-3.5 text-orange-600" />
                        <span>2. Indian Taal</span>
                      </label>
                      <span className="text-[11px] text-orange-900 font-semibold bg-orange-100 px-2 py-0.5 rounded">
                        Classical Beat Cycle
                      </span>
                    </div>

                    <p className="text-xs text-stone-600">
                      Select an Indian classical rhythmic meter to configure the cycle bars.
                    </p>

                    {/* Taal Select */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      {INDIAN_TAALS.map((taal) => {
                        const isSelected = selectedTaalId === taal.id;
                        return (
                          <button
                            key={taal.id}
                            type="button"
                            onClick={() => setSelectedTaalId(taal.id)}
                            className={`p-2.5 rounded-lg border text-left transition-all ${
                              isSelected
                                ? 'bg-orange-600 text-white font-bold border-orange-600 shadow-2xs'
                                : 'bg-white border-stone-200 text-stone-800 hover:bg-orange-50/50'
                            }`}
                          >
                            <span className="block text-xs font-bold">{taal.name}</span>
                            <span
                              className={`block text-[10px] mt-0.5 ${
                                isSelected ? 'text-orange-100' : 'text-stone-500'
                              }`}
                            >
                              {taal.id === 'None' ? 'Western meter' : `${taal.beats} Beats`}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Taal Preview / Example Box */}
                    {selectedTaalId !== 'None' && (
                      <div className="p-3 bg-white rounded-lg border border-orange-200 text-xs space-y-1 mt-2">
                        <div className="flex items-center justify-between font-mono font-bold text-orange-900 text-sm">
                          <span>
                            {currentTaalDef.name} → {currentTaalDef.representation}
                          </span>
                          <span className="text-xs font-sans text-stone-500 font-normal">
                            1 Cycle = 1 Measure
                          </span>
                        </div>
                        <p className="text-stone-600 text-[11px]">
                          <strong>Vibhags & Bols:</strong> {currentTaalDef.vibhags}
                        </p>
                        {currentTaalDef.bolsExample && (
                          <p className="text-stone-500 text-[10px] font-mono italic">
                            {currentTaalDef.bolsExample}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 3. Tempo, Measures Count & Pickup Measure */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Tempo */}
                    <div className="bg-stone-50/60 p-3.5 rounded-xl border border-stone-200/90 space-y-2">
                      <label className="text-xs font-bold text-stone-900 flex items-center space-x-1">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>3. Tempo (BPM)</span>
                      </label>
                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => setTempoBpm((prev) => Math.max(40, prev - 5))}
                          className="w-7 h-7 rounded border border-stone-300 bg-white font-bold hover:bg-stone-100 flex items-center justify-center text-stone-700 text-sm"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={40}
                          max={240}
                          value={tempoBpm}
                          onChange={(e) => setTempoBpm(Number(e.target.value) || 80)}
                          className="w-full text-center px-2 py-1 bg-white border border-stone-300 rounded font-bold text-sm text-stone-800"
                        />
                        <button
                          type="button"
                          onClick={() => setTempoBpm((prev) => Math.min(240, prev + 5))}
                          className="w-7 h-7 rounded border border-stone-300 bg-white font-bold hover:bg-stone-100 flex items-center justify-center text-stone-700 text-sm"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-[10px] text-stone-500 text-center block">
                        Speed of song
                      </span>
                    </div>

                    {/* Measures Count */}
                    <div className="bg-stone-50/60 p-3.5 rounded-xl border border-stone-200/90 space-y-2">
                      <label className="text-xs font-bold text-stone-900 flex items-center space-x-1">
                        <Hash className="w-3.5 h-3.5 text-amber-600" />
                        <span>4. Total Measures</span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={120}
                        value={measuresCount}
                        onChange={(e) => setMeasuresCount(Number(e.target.value) || 16)}
                        className="w-full text-center px-2 py-1 bg-white border border-stone-300 rounded font-bold text-sm text-stone-800"
                      />
                      <div className="flex justify-between gap-1">
                        {measurePresets.map((cnt) => (
                          <button
                            key={cnt}
                            type="button"
                            onClick={() => setMeasuresCount(cnt)}
                            className={`flex-1 py-0.5 text-[10px] font-semibold rounded border ${
                              measuresCount === cnt
                                ? 'bg-stone-900 text-white border-stone-900'
                                : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-100'
                            }`}
                          >
                            {cnt}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Pickup Beat (Starting Beat in Measure 1) */}
                    <div className="bg-amber-50/60 p-3.5 rounded-xl border border-amber-200/80 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-amber-950 flex items-center space-x-1">
                          <span>Pickup Beat</span>
                        </label>
                        <span className="text-[9px] bg-amber-100 text-amber-900 font-bold px-1.5 py-0.5 rounded">
                          Beat in Bar 1
                        </span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        {[1, 2, 3, 4, 5, 6].slice(0, currentTaalDef.id !== 'None' ? currentTaalDef.recommendedTimeSignature.numerator : (customNumerator || 4)).map((b) => (
                          <button
                            key={b}
                            type="button"
                            onClick={() => setPickupBeat(b)}
                            className={`flex-1 py-1 text-xs font-bold rounded border transition-colors ${
                              pickupBeat === b
                                ? 'bg-amber-700 text-white border-amber-700 shadow-xs'
                                : 'bg-white border-amber-200 text-amber-950 hover:bg-amber-100/60'
                            }`}
                          >
                            Beat {b}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-amber-900/80 leading-tight">
                        {pickupBeat === 1 ? (
                          <span>Score starts at <strong>Measure 1 → Beat 1</strong> (no pickup).</span>
                        ) : (
                          <span>
                            Beats 1 to {pickupBeat - 1} of Measure 1 will be locked (🔒). Notation entry begins at <strong>Measure 1 → Beat {pickupBeat}</strong>.
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Clarification Note on Pickup Beat */}
                  <div className="p-3 bg-stone-100/80 rounded-lg text-[11px] text-stone-600 flex items-start space-x-2 border border-stone-200/80">
                    <Info className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" />
                    <div>
                      <strong>Pickup Beat Setting:</strong> Determines the exact starting beat within <strong>Measure 1</strong>. When set to {pickupBeat > 1 ? `Beat ${pickupBeat}` : 'Beat 1'}, earlier beats in Measure 1 are locked and displayed as blank dashes (—), while Measure 1 retains its standard bar numbering and layout.
                    </div>
                  </div>

                  {/* 5. Custom Option Toggle */}
                  <div className="border border-stone-200 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setIsCustomExpanded(!isCustomExpanded)}
                      className="w-full p-3.5 bg-stone-50 hover:bg-stone-100 flex items-center justify-between text-left text-xs font-bold text-stone-800 transition-colors"
                    >
                      <div className="flex items-center space-x-2">
                        <Sliders className="w-4 h-4 text-amber-600" />
                        <span>5. Custom Score Setup Options (Bars per line, Time Signature)</span>
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 text-stone-500 transition-transform ${
                          isCustomExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {isCustomExpanded && (
                      <div className="p-4 bg-white space-y-4 border-t border-stone-200 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Bars per line */}
                          <div>
                            <label className="block text-xs font-bold text-stone-700 mb-1">
                              Bars per Line / Measures per System
                            </label>
                            <div className="flex items-center space-x-1.5">
                              {[2, 3, 4, 5, 6].map((bpl) => (
                                <button
                                  key={bpl}
                                  type="button"
                                  onClick={() => setBarsPerLine(bpl)}
                                  className={`flex-1 py-1 rounded font-bold border text-xs ${
                                    barsPerLine === bpl
                                      ? 'bg-stone-900 text-white border-stone-900'
                                      : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-100'
                                  }`}
                                >
                                  {bpl}
                                </button>
                              ))}
                            </div>
                            <span className="text-[10px] text-stone-500 mt-1 block">
                              Dynamic engraving reflow automatically aligns bars to fit page margins.
                            </span>
                          </div>

                          {/* Custom Time Signature */}
                          <div>
                            <label className="block text-xs font-bold text-stone-700 mb-1">
                              Custom Time Signature
                            </label>
                            <div className="flex items-center space-x-2">
                              <input
                                type="number"
                                min={1}
                                max={32}
                                value={customNumerator}
                                onChange={(e) => setCustomNumerator(Number(e.target.value) || 4)}
                                className="w-14 text-center px-2 py-1 border border-stone-300 rounded font-bold"
                              />
                              <span className="font-bold text-stone-500">/</span>
                              <select
                                value={customDenominator}
                                onChange={(e) => setCustomDenominator(Number(e.target.value) || 4)}
                                className="w-16 px-2 py-1 border border-stone-300 rounded font-bold bg-white"
                              >
                                <option value={2}>2</option>
                                <option value={4}>4</option>
                                <option value={8}>8</option>
                                <option value={16}>16</option>
                              </select>
                            </div>
                            <span className="text-[10px] text-stone-500 mt-1 block">
                              Overrides standard meter when specified.
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Side: Score Metadata & Mini Preview */}
                <div className="md:col-span-5 space-y-4">
                  {/* Live Mini Preview */}
                  {renderLiveStaffPreview(selectedTemplate)}

                  {/* 6. Score Metadata Form */}
                  <div className="bg-stone-50/70 p-4 rounded-xl border border-stone-200/90 space-y-3">
                    <h5 className="font-bold text-xs uppercase tracking-wider text-stone-700 border-b border-stone-200/80 pb-1.5">
                      6. Score Information & Credits
                    </h5>

                    {/* Title */}
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-700 mb-0.5">
                        Title
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Song / Composition Title"
                        className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded text-xs text-stone-900 focus:ring-1 focus:ring-amber-500"
                      />
                    </div>

                    {/* Subtitle */}
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-700 mb-0.5">
                        Subtitle (Optional)
                      </label>
                      <input
                        type="text"
                        value={subtitle}
                        onChange={(e) => setSubtitle(e.target.value)}
                        placeholder="e.g. Op. 1 No. 2 • Piano Lesson Étude"
                        className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded text-xs text-stone-900 focus:ring-1 focus:ring-amber-500"
                      />
                    </div>

                    {/* Composer & Lyricist */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-stone-700 mb-0.5">
                          Composer
                        </label>
                        <input
                          type="text"
                          value={composer}
                          onChange={(e) => setComposer(e.target.value)}
                          placeholder="Composer Name"
                          className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded text-xs text-stone-900 focus:ring-1 focus:ring-amber-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-stone-700 mb-0.5">
                          Lyricist (Optional)
                        </label>
                        <input
                          type="text"
                          value={lyricist}
                          onChange={(e) => setLyricist(e.target.value)}
                          placeholder="Lyricist Name"
                          className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded text-xs text-stone-900 focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                    </div>

                    {/* Copyright */}
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-700 mb-0.5">
                        Copyright Information
                      </label>
                      <input
                        type="text"
                        value={copyright}
                        onChange={(e) => setCopyright(e.target.value)}
                        placeholder="© Pianotastic Academy. All rights reserved."
                        className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded text-xs text-stone-900 focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-stone-100 border-t border-stone-200 flex items-center justify-between">
          <div>
            {step === 2 ? (
              <button
                id="modal-back-btn"
                onClick={handleBack}
                className="px-4 py-2 rounded-lg bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 text-xs font-semibold flex items-center space-x-1.5 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            ) : (
              <button
                id="modal-cancel-btn"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {step === 2 && (
              <button
                id="modal-step2-cancel-btn"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-200/60 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
            )}

            {step === 1 ? (
              <button
                id="modal-next-btn"
                onClick={handleNext}
                className="px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center space-x-2 shadow-sm transition-all"
              >
                <span>Next</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                id="modal-done-btn"
                onClick={handleDone}
                className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center space-x-2 shadow-md transition-all ring-2 ring-emerald-500/20"
              >
                <Check className="w-4 h-4" />
                <span>Done — Open Page Editor</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
