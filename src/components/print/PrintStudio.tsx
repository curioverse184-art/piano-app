import React, { useState, useRef, useMemo } from 'react';
import { Score, HandTemplate } from '../../types/score';
import {
  Printer,
  ArrowLeft,
  FileText,
  Sliders,
  Eye,
  Download,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Check,
  Layout,
  Maximize,
} from 'lucide-react';
import { NotationRenderer } from '../notation/NotationRenderer';

interface PrintStudioProps {
  score: Score;
  onBackToEditor: () => void;
}

export const PrintStudio: React.FC<PrintStudioProps> = ({ score, onBackToEditor }) => {
  // Settings State - Default to A4 and score's orientation
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(
    score.layoutSettings.orientation || 'portrait'
  );
  const [paperSize, setPaperSize] = useState<'letter' | 'a4' | 'legal'>('a4');
  const [margins, setMargins] = useState<'normal' | 'narrow' | 'wide'>('normal');
  const [scale, setScale] = useState<number>(100);
  const [overrideBarsPerLine, setOverrideBarsPerLine] = useState<number | null>(null);

  // Content Visibility Toggles
  const [showTitleHeader, setShowTitleHeader] = useState<boolean>(true);
  const [showChordSymbols, setShowChordSymbols] = useState<boolean>(true);
  const [showLyrics, setShowLyrics] = useState<boolean>(true);
  const [showTextAnnotations, setShowTextAnnotations] = useState<boolean>(true);
  const [showBarNumbers, setShowBarNumbers] = useState<boolean>(true);
  const [showFooter, setShowFooter] = useState<boolean>(true);

  // Preview Zoom
  const [previewZoom, setPreviewZoom] = useState<number>(0.85);

  const printAreaRef = useRef<HTMLDivElement>(null);

  // Prepare print-configured score
  const printScore = useMemo<Score>(() => {
    return {
      ...score,
      textAnnotations: showTextAnnotations ? score.textAnnotations : [],
      layoutSettings: {
        ...score.layoutSettings,
        barsPerLine: overrideBarsPerLine || score.layoutSettings.barsPerLine || 4,
        measuresPerSystemAuto: overrideBarsPerLine || score.layoutSettings.measuresPerSystemAuto || 4,
        measureLockPerLine:
          overrideBarsPerLine !== null
            ? overrideBarsPerLine
            : score.layoutSettings.measureLockPerLine,
      },
    };
  }, [score, overrideBarsPerLine, showTextAnnotations]);

  // Execute system print
  const handlePrint = () => {
    window.print();
  };

  // Dimensions based on paper size
  const paperDimensions = useMemo(() => {
    if (paperSize === 'a4') {
      return orientation === 'portrait' ? { width: '210mm', minHeight: '297mm' } : { width: '297mm', minHeight: '210mm' };
    }
    if (paperSize === 'legal') {
      return orientation === 'portrait' ? { width: '8.5in', minHeight: '14in' } : { width: '14in', minHeight: '8.5in' };
    }
    // Letter default
    return orientation === 'portrait' ? { width: '8.5in', minHeight: '11in' } : { width: '11in', minHeight: '8.5in' };
  }, [paperSize, orientation]);

  const marginPadding = useMemo(() => {
    if (margins === 'narrow') return 'p-6';
    if (margins === 'wide') return 'p-14';
    return 'p-10'; // normal
  }, [margins]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-stone-200 text-stone-900 font-sans select-none">
      {/* ================= LEFT SETTINGS PANEL (WORD STYLE) ================= */}
      <div className="w-80 md:w-96 h-full bg-white border-r border-stone-300 flex flex-col z-20 shadow-xl print:hidden flex-shrink-0">
        {/* Panel Header */}
        <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50">
          <button
            onClick={onBackToEditor}
            className="flex items-center space-x-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 px-2.5 py-1.5 rounded-lg hover:bg-stone-200/70 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Editor</span>
          </button>
          <div className="flex items-center space-x-1.5">
            <FileText className="w-4 h-4 text-amber-600" />
            <h1 className="font-serif font-bold text-stone-900 text-base">Print Preview</h1>
          </div>
        </div>

        {/* Primary Action Button */}
        <div className="p-5 border-b border-stone-200 bg-stone-50/50 space-y-2.5">
          <button
            onClick={handlePrint}
            className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-semibold rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 text-sm"
          >
            <Printer className="w-4 h-4" />
            <span>Print Sheet Music</span>
          </button>
          <p className="text-[11px] text-stone-500 text-center">
            To create a PDF, select <strong>Save as PDF</strong> as your printer destination.
          </p>
        </div>

        {/* Scrollable Settings Form */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs">
          {/* Orientation */}
          <div>
            <label className="font-bold text-stone-800 uppercase tracking-wider text-[10px] block mb-2">
              Orientation
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOrientation('portrait')}
                className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors ${
                  orientation === 'portrait'
                    ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-2xs'
                    : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                }`}
              >
                <div className="w-3 h-4 border border-current rounded-xs"></div>
                <span>Portrait</span>
              </button>
              <button
                type="button"
                onClick={() => setOrientation('landscape')}
                className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors ${
                  orientation === 'landscape'
                    ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-2xs'
                    : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                }`}
              >
                <div className="w-4 h-3 border border-current rounded-xs"></div>
                <span>Landscape</span>
              </button>
            </div>
          </div>

          {/* Paper Size */}
          <div>
            <label className="font-bold text-stone-800 uppercase tracking-wider text-[10px] block mb-2">
              Paper Size
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['letter', 'a4', 'legal'] as const).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setPaperSize(size)}
                  className={`py-1.5 px-2 rounded-lg border text-xs font-medium uppercase tracking-wide transition-colors ${
                    paperSize === size
                      ? 'bg-amber-50 border-amber-500 text-amber-900 font-bold shadow-2xs'
                      : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* Margins */}
          <div>
            <label className="font-bold text-stone-800 uppercase tracking-wider text-[10px] block mb-2">
              Page Margins
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['narrow', 'normal', 'wide'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMargins(m)}
                  className={`py-1.5 px-2 rounded-lg border text-xs font-medium capitalize transition-colors ${
                    margins === m
                      ? 'bg-amber-50 border-amber-500 text-amber-900 font-bold shadow-2xs'
                      : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Scaling Slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-bold text-stone-800 uppercase tracking-wider text-[10px]">
                Notation Scale
              </label>
              <span className="font-mono font-bold text-amber-800 text-xs">{scale}%</span>
            </div>
            <input
              type="range"
              min="75"
              max="125"
              step="5"
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="w-full accent-amber-600 cursor-pointer"
            />
          </div>

          {/* Measures Per Line Override */}
          <div>
            <label className="font-bold text-stone-800 uppercase tracking-wider text-[10px] block mb-2">
              Bars Per Line (Print Override)
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => setOverrideBarsPerLine(null)}
                className={`py-1.5 px-2 rounded-lg border text-xs font-medium transition-colors ${
                  overrideBarsPerLine === null
                    ? 'bg-amber-50 border-amber-500 text-amber-900 font-bold'
                    : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                }`}
              >
                Auto ({score.layoutSettings.barsPerLine || 4})
              </button>
              {[2, 3, 4].map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setOverrideBarsPerLine(b)}
                  className={`py-1.5 px-2 rounded-lg border text-xs font-medium transition-colors ${
                    overrideBarsPerLine === b
                      ? 'bg-amber-50 border-amber-500 text-amber-900 font-bold'
                      : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  {b} Bars
                </button>
              ))}
            </div>
          </div>

          {/* Content Elements Toggles */}
          <div className="space-y-2 pt-2 border-t border-stone-200">
            <label className="font-bold text-stone-800 uppercase tracking-wider text-[10px] block mb-2">
              Print Elements
            </label>

            <label className="flex items-center space-x-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showTitleHeader}
                onChange={(e) => setShowTitleHeader(e.target.checked)}
                className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 accent-amber-600"
              />
              <span className="font-medium text-stone-700">Title & Metadata Header</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showChordSymbols}
                onChange={(e) => setShowChordSymbols(e.target.checked)}
                className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 accent-amber-600"
              />
              <span className="font-medium text-stone-700">Chord Symbols</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showLyrics}
                onChange={(e) => setShowLyrics(e.target.checked)}
                className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 accent-amber-600"
              />
              <span className="font-medium text-stone-700">Song Lyrics</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showTextAnnotations}
                onChange={(e) => setShowTextAnnotations(e.target.checked)}
                className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 accent-amber-600"
              />
              <span className="font-medium text-stone-700">Score Text Annotations</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showBarNumbers}
                onChange={(e) => setShowBarNumbers(e.target.checked)}
                className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 accent-amber-600"
              />
              <span className="font-medium text-stone-700">Measure / Bar Numbers</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showFooter}
                onChange={(e) => setShowFooter(e.target.checked)}
                className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 accent-amber-600"
              />
              <span className="font-medium text-stone-700">Page Numbers & Copyright</span>
            </label>
          </div>
        </div>
      </div>

      {/* ================= RIGHT LIVE PAPER PREVIEW ================= */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Preview Top Control Bar */}
        <div className="h-12 bg-stone-100 border-b border-stone-300 px-6 flex items-center justify-between z-10 print:hidden shadow-xs">
          <div className="flex items-center space-x-2 text-xs font-semibold text-stone-600">
            <Eye className="w-3.5 h-3.5 text-stone-400" />
            <span>Interactive Paper Preview</span>
            <span className="text-stone-400">•</span>
            <span className="font-medium text-stone-500 capitalize">
              {paperSize} ({orientation})
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPreviewZoom((z) => Math.max(0.5, z - 0.1))}
              className="p-1.5 rounded-lg bg-white border border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-50"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-mono font-bold text-stone-700 w-12 text-center">
              {Math.round(previewZoom * 100)}%
            </span>
            <button
              onClick={() => setPreviewZoom((z) => Math.min(1.5, z + 0.1))}
              className="p-1.5 rounded-lg bg-white border border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-50"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPreviewZoom(0.85)}
              className="px-2 py-1 text-xs font-semibold rounded-lg bg-white border border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-50 ml-1"
            >
              Fit
            </button>
          </div>
        </div>

        {/* Floating Paper Preview Canvas */}
        <div className="flex-1 overflow-auto p-8 flex justify-center items-start bg-stone-200/90 print:p-0 print:bg-white">
          <div
            ref={printAreaRef}
            id="print-sheet-paper"
            className={`bg-white rounded-lg shadow-2xl border border-stone-300 transition-transform origin-top print:shadow-none print:border-none print:m-0 print:p-0 ${marginPadding}`}
            style={{
              width: paperDimensions.width,
              minHeight: paperDimensions.minHeight,
              transform: `scale(${previewZoom})`,
              marginBottom: `${Math.max(40, (previewZoom - 1) * 600)}px`,
            }}
          >
            {/* Printable Document Title Header */}
            {showTitleHeader && (
              <div className="border-b border-stone-200/80 pb-4 mb-6 text-center">
                <h1 className="font-serif font-bold text-2xl md:text-3xl text-stone-900 tracking-tight">
                  {score.metadata.title || 'Untitled Composition'}
                </h1>
                {score.metadata.subtitle && (
                  <p className="font-serif italic text-stone-600 text-sm mt-0.5">
                    {score.metadata.subtitle}
                  </p>
                )}
                <div className="flex items-center justify-between text-xs text-stone-600 font-medium mt-3 px-2">
                  <span>
                    {score.metadata.lyricist ? `Words by ${score.metadata.lyricist}` : ''}
                  </span>
                  <span>
                    {score.metadata.composer ? `Music by ${score.metadata.composer}` : ''}
                  </span>
                </div>
              </div>
            )}

            {/* Score Notation Component */}
            <div
              style={{
                transform: scale !== 100 ? `scale(${scale / 100})` : undefined,
                transformOrigin: 'top center',
              }}
            >
              <NotationRenderer
                score={printScore}
                toolMode="select"
                selection={{ measureId: null, staff: 'RH', eventId: null }}
                playbackPosition={null}
                onSelectBeat={() => {}}
                onSelectMeasure={() => {}}
                onUpdateBeatChord={() => {}}
                onUpdateBeatLyric={() => {}}
                onToggleBeatSymbol={() => {}}
                onToggleLineBreak={() => {}}
              />
            </div>

            {/* Printable Document Footer */}
            {showFooter && (
              <div className="border-t border-stone-200/80 pt-4 mt-8 flex items-center justify-between text-[11px] text-stone-500">
                <span>{score.metadata.copyright || '© Pianotastic Music Studio'}</span>
                <span>Page 1 of 1</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
