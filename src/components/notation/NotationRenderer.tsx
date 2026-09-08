import React, { useState, useRef, useMemo } from 'react';
import {
  Score,
  Measure,
  Pitch,
  ToolMode,
  NoteDuration,
  AccidentalType,
  SelectionState,
  Hand,
  ChordSymbolEvent,
} from '../../types/score';
import {
  formatNoteLetter,
  getMeasureTotalBeats,
  isBeatLockedByPickup,
  getMeasureBeatPitches,
  hasOctaveDotAbove,
  hasOctaveDotBelow,
} from '../../utils/pianotasticNotation';
import { Check, Trash2, X } from 'lucide-react';

interface NotationRendererProps {
  score: Score;
  toolMode: ToolMode;
  selectedDuration?: NoteDuration;
  selectedAccidental?: AccidentalType | null;
  activeHand?: Hand;
  selection: SelectionState;
  playbackPosition: { measureIndex: number; beat: number } | null;
  currentBeatValue?: number;
  onSelectMeasure: (measureId: string) => void;
  onSelectBeat: (
    measureId: string,
    beatIndex: number,
    subBeatIndex?: number,
    selectionType?: 'note' | 'beat' | 'chord' | 'lyrics' | 'symbol'
  ) => void;
  onInsertNote?: (measureId: string, staff: 'RH' | 'LH', pitch: Pitch, beatOffset?: number) => void;
  onDeleteSelected?: () => void;
  onMeasureWidthChange?: (measureId: string, newWidth: number) => void;
  onMeasureContextMenu?: (measure: Measure, x: number, y: number) => void;
  onOpenNavigationPalette?: (measure: Measure) => void;
  onUpdateBeatLyric?: (measureId: string, beatIndex: number, text: string, subBeatIndex?: number) => void;
  onUpdateBeatChord?: (measureId: string, beatIndex: number, chord: string) => void;
  onToggleBeatSymbol?: (measureId: string, beatIndex: number, symbol: string) => void;
  onToggleLineBreak?: (measureId: string) => void;
}

export const NotationRenderer: React.FC<NotationRendererProps> = ({
  score,
  toolMode,
  selection,
  playbackPosition,
  onSelectMeasure,
  onSelectBeat,
  onMeasureContextMenu,
  onOpenNavigationPalette,
  onUpdateBeatLyric,
  onUpdateBeatChord,
  onToggleBeatSymbol,
  onToggleLineBreak,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Inline Editing Popovers State
  const [activeChordPopover, setActiveChordPopover] = useState<{
    measureId: string;
    beatIndex: number;
    initialValue: string;
    x: number;
    y: number;
  } | null>(null);

  const [activeLyricPopover, setActiveLyricPopover] = useState<{
    measureId: string;
    beatIndex: number;
    subBeatIndex: number;
    initialValue: string;
    x: number;
    y: number;
  } | null>(null);

  const [chordInputValue, setChordInputValue] = useState('');
  const [lyricInputValue, setLyricInputValue] = useState('');

  // Dimensions & Layout constants
  const isLandscape = score.layoutSettings.orientation === 'landscape';
  const pageWidth = isLandscape ? 1120 : 860;
  const pageHeight = isLandscape ? 800 : 1160;
  const zoom = score.layoutSettings.zoom || 1.0;

  const handTemplate = score.metadata.handTemplate || 'Both';
  const pickupBeat = score.metadata.pickupBeat || 1;

  const staffMarginLeft = 40;
  const staffMarginRight = 40;
  const contentWidth = pageWidth - staffMarginLeft - staffMarginRight;

  const measureBlockHeight = 140;
  const systemGap = 36;

  // Helper to find chord for beat
  const getChordForBeat = (measure: Measure, beatIndex: number): string | undefined => {
    if (measure.beatChords && measure.beatChords[beatIndex] !== undefined) {
      return measure.beatChords[beatIndex];
    }
    if (measure.chordSymbols && measure.chordSymbols.length > 0) {
      const cs = measure.chordSymbols.find((c) => Math.floor(c.beatOffset) === beatIndex);
      return cs?.formatted || (cs ? `${cs.root}${cs.quality || ''}` : undefined);
    }
    return undefined;
  };

  // Content-Aware Natural Width Calculator for Measure
  const getMeasureNaturalWidth = (measure: Measure): number => {
    const ts = measure.timeSignature || score.metadata.initialTimeSignature;
    const totalBeats = getMeasureTotalBeats(measure, ts);
    const baseBeatWidth = 44; // standard readable single-beat width
    const beatPitchesList = getMeasureBeatPitches(measure, totalBeats, handTemplate);
    let contentRequired = 0;

    for (let b = 0; b < totalBeats; b++) {
      const val = measure.beatValues?.[b] || 1;
      const pitches = beatPitchesList[b] || [];
      const count = Math.max(val, pitches.length, 1);

      // Note spacing: never shrink note size just to fit
      let noteSpacing = baseBeatWidth;
      if (count === 2) noteSpacing = 58;
      else if (count === 3) noteSpacing = 78;
      else if (count >= 4) noteSpacing = 24 * count + 6;

      // Accidental extra space
      const hasAccidental = pitches.some(
        (p) => p.accidental && p.accidental !== 'natural'
      );
      if (hasAccidental) noteSpacing += 8;

      // Chord text width requirement
      const chord = getChordForBeat(measure, b);
      let chordSpacing = 0;
      if (chord) {
        chordSpacing = chord.length * 8.5 + 14;
      }

      // Lyric text width requirement
      const lyric = measure.beatLyrics?.[b] || '';
      let lyricSpacing = 0;
      if (lyric) {
        lyricSpacing = lyric.length * 8 + 16;
      }
      for (let s = 1; s < count; s++) {
        const subLyric = measure.beatLyrics?.[`${b}_${s}`];
        if (subLyric) {
          lyricSpacing += subLyric.length * 7.5 + 10;
        }
      }

      const beatWidth = Math.max(baseBeatWidth, noteSpacing, chordSpacing, lyricSpacing);
      contentRequired += beatWidth;
    }

    // Left & right barlines, margins
    contentRequired += 24;
    const defaultBlankWidth = Math.max(170, totalBeats * baseBeatWidth + 24);

    return Math.max(defaultBlankWidth, contentRequired, measure.customWidth || 0);
  };

  // Dynamic Reflow & Measures per system calculation
  const systems = useMemo(() => {
    const sysList: { measures: { measure: Measure; width: number; measureIdx: number; naturalWidth: number }[] }[] = [];
    const measureLock = score.layoutSettings.measureLockPerLine;
    const isLocked = measureLock !== null && measureLock !== undefined && measureLock > 0;
    const userBarsPerLine =
      score.layoutSettings.barsPerLine || score.layoutSettings.measuresPerSystemAuto || 4;

    if (isLocked) {
      // 1. Measure Lock Per Line is ACTIVE: strictly L measures per line
      const L = Math.max(1, Math.round(measureLock));
      for (let i = 0; i < score.measures.length; i += L) {
        const lineMeasures = score.measures.slice(i, i + L);
        const systemMeasures = lineMeasures.map((m, offset) => ({
          measure: m,
          width: 0,
          measureIdx: i + offset,
          naturalWidth: getMeasureNaturalWidth(m),
        }));

        const isFullLine = systemMeasures.length === L;
        const totalNatural = systemMeasures.reduce((acc, m) => acc + m.naturalWidth, 0);

        // Distribute contentWidth across measures proportionally to naturalWidth
        // so denser measures get proportionately more width, while all lines
        // align cleanly to left and right page boundaries!
        const targetLineWidth = isFullLine
          ? contentWidth
          : Math.min(contentWidth, Math.max(totalNatural, (contentWidth / L) * systemMeasures.length));

        let accumulatedWidth = 0;
        systemMeasures.forEach((item, idx) => {
          if (idx === systemMeasures.length - 1) {
            item.width = targetLineWidth - accumulatedWidth;
          } else {
            const propWidth = Math.round((targetLineWidth * item.naturalWidth) / totalNatural);
            item.width = propWidth;
            accumulatedWidth += propWidth;
          }
        });

        sysList.push({ measures: systemMeasures });
      }
    } else {
      // 2. Dynamic Content-Aware Wrapping with Manual Line Breaks
      let currentSystem: { measure: Measure; width: number; measureIdx: number; naturalWidth: number }[] = [];
      let currentNaturalSum = 0;

      score.measures.forEach((m, idx) => {
        const natWidth = getMeasureNaturalWidth(m);
        const prevMeasure = currentSystem.length > 0 ? currentSystem[currentSystem.length - 1].measure : null;
        const prevHadManualBreak = prevMeasure ? Boolean(prevMeasure.systemBreak) : false;

        const wouldExceedBars = currentSystem.length >= userBarsPerLine;
        const wouldOverflowWidth = currentSystem.length > 0 && (currentNaturalSum + natWidth > contentWidth);

        const shouldBreak = prevHadManualBreak || wouldExceedBars || wouldOverflowWidth;

        if (currentSystem.length > 0 && shouldBreak) {
          const totalNat = currentNaturalSum;
          const isFullLine = currentSystem.length >= userBarsPerLine || wouldOverflowWidth;
          const targetLineWidth = isFullLine
            ? contentWidth
            : Math.min(contentWidth, Math.max(totalNat, (contentWidth / userBarsPerLine) * currentSystem.length));

          let accumulatedWidth = 0;
          currentSystem.forEach((item, itemIdx) => {
            if (itemIdx === currentSystem.length - 1) {
              item.width = targetLineWidth - accumulatedWidth;
            } else {
              const propWidth = Math.round((targetLineWidth * item.naturalWidth) / totalNat);
              item.width = propWidth;
              accumulatedWidth += propWidth;
            }
          });

          sysList.push({ measures: currentSystem });
          currentSystem = [];
          currentNaturalSum = 0;
        }

        currentSystem.push({
          measure: m,
          width: 0,
          measureIdx: idx,
          naturalWidth: natWidth,
        });
        currentNaturalSum += natWidth;
      });

      if (currentSystem.length > 0) {
        const totalNat = currentNaturalSum;
        const isFullLine = currentSystem.length >= userBarsPerLine;
        const targetLineWidth = isFullLine
          ? contentWidth
          : Math.min(contentWidth, Math.max(totalNat, (contentWidth / userBarsPerLine) * currentSystem.length));

        let accumulatedWidth = 0;
        currentSystem.forEach((item, itemIdx) => {
          if (itemIdx === currentSystem.length - 1) {
            item.width = targetLineWidth - accumulatedWidth;
          } else {
            const propWidth = Math.round((targetLineWidth * item.naturalWidth) / totalNat);
            item.width = propWidth;
            accumulatedWidth += propWidth;
          }
        });

        sysList.push({ measures: currentSystem });
      }
    }

    return sysList;
  }, [
    score.measures,
    score.layoutSettings.barsPerLine,
    score.layoutSettings.measuresPerSystemAuto,
    score.layoutSettings.measureLockPerLine,
    contentWidth,
    score.metadata.initialTimeSignature,
    handTemplate,
  ]);

  // Group systems into pages
  const pages = useMemo(() => {
    const systemsPerPage = isLandscape ? 4 : 5;
    const pageList: typeof systems[] = [];
    let curPage: typeof systems = [];

    systems.forEach((sys) => {
      const hasPageBreak = sys.measures.some((m) => m.measure.pageBreak);
      curPage.push(sys);
      if (curPage.length >= systemsPerPage || hasPageBreak) {
        pageList.push(curPage);
        curPage = [];
      }
    });

    if (curPage.length > 0) {
      pageList.push(curPage);
    }
    return pageList;
  }, [systems, isLandscape]);

  const quickChordPresets = ['C', 'Am', 'F', 'G7', 'Dm', 'Cmaj7', 'Em', 'A7', 'G', 'D'];

  return (
    <div
      ref={containerRef}
      id="notation-canvas-container"
      className="min-w-fit w-full flex flex-col items-center select-none pt-6 px-8 pb-48 space-y-8 relative min-h-full"
      style={{
        transform: zoom !== 1 ? `scale(${zoom})` : undefined,
        transformOrigin: 'top center',
        marginBottom: zoom > 1 ? `${(zoom - 1) * 800}px` : undefined,
      }}
    >
      {pages.map((pageSystems, pageIndex) => {
        const startY = pageIndex === 0 ? 150 : 50;
        const totalSystemSpan = pageSystems.length * (measureBlockHeight + systemGap);
        const dynamicPageHeight = Math.max(pageHeight, startY + totalSystemSpan + 60);

        let currentSystemY = startY;

        return (
          <div
            key={`page-${pageIndex}`}
            className="score-page bg-white shadow-md border border-stone-300 rounded-sm relative shrink-0"
            style={{
              width: `${pageWidth}px`,
              minHeight: `${dynamicPageHeight}px`,
              height: `${dynamicPageHeight}px`,
            }}
          >
            <svg
              width={pageWidth}
              height={dynamicPageHeight}
              viewBox={`0 0 ${pageWidth} ${dynamicPageHeight}`}
              className="w-full h-full block"
            >
              {/* Score Header on First Page */}
              {pageIndex === 0 && (
                <g className="score-header">
                  {/* Score Title */}
                  <text
                    x={pageWidth / 2}
                    y={56}
                    fontFamily="'Lora', Georgia, serif"
                    fontSize="26"
                    fontWeight="bold"
                    fill="#0f172a"
                    textAnchor="middle"
                  >
                    {score.metadata.title || 'Untitled Notation'}
                  </text>

                  {/* Subtitle */}
                  {score.metadata.subtitle && (
                    <text
                      x={pageWidth / 2}
                      y={82}
                      fontFamily="'Lora', Georgia, serif"
                      fontSize="14"
                      fontStyle="italic"
                      fill="#475569"
                      textAnchor="middle"
                    >
                      {score.metadata.subtitle}
                    </text>
                  )}

                  {/* Tempo & Time Signature (Top Left) */}
                  <g>
                    <text
                      x={staffMarginLeft}
                      y={123}
                      fontFamily="'Plus Jakarta Sans', sans-serif"
                      fontSize="12"
                      fontWeight="bold"
                      fill="#0f172a"
                    >
                      ♩ = {score.metadata.tempoBpm || 80}
                      <tspan fill="#64748b" fontWeight="normal">
                        {' '}
                        • {score.metadata.initialTimeSignature.numerator}/
                        {score.metadata.initialTimeSignature.denominator}
                        {score.metadata.indianTaal && score.metadata.indianTaal !== 'None'
                          ? ` • ${score.metadata.indianTaal}`
                          : ''}
                      </tspan>
                    </text>
                  </g>

                  {/* Composer & Lyricist (Top Right) */}
                  <g textAnchor="end">
                    <text
                      x={pageWidth - staffMarginRight}
                      y={118}
                      fontFamily="'Lora', Georgia, serif"
                      fontSize="12"
                      fontWeight="600"
                      fill="#1e293b"
                    >
                      {score.metadata.composer || 'Pianotastic Academy'}
                    </text>
                    {score.metadata.lyricist && (
                      <text
                        x={pageWidth - staffMarginRight}
                        y={132}
                        fontFamily="'Lora', Georgia, serif"
                        fontSize="10"
                        fontStyle="italic"
                        fill="#64748b"
                      >
                        Lyrics: {score.metadata.lyricist}
                      </text>
                    )}
                  </g>
                </g>
              )}

              {/* Render Systems / Lines */}
              {pageSystems.map((system, sysIdx) => {
                const systemY = currentSystemY;
                currentSystemY += measureBlockHeight + systemGap;

                let currentX = staffMarginLeft;

                return (
                  <g key={`sys-${sysIdx}`} className="score-system">
                    {system.measures.map(({ measure, width, measureIdx }, mIdxInSys) => {
                      const measureX = currentX;
                      currentX += width;

                      const isSelectedMeasure = selection.measureId === measure.id;
                      const totalBeats = getMeasureTotalBeats(measure, score.metadata.initialTimeSignature);
                      const colWidth = width / totalBeats;
                      const beatPitches = getMeasureBeatPitches(measure, totalBeats, handTemplate);

                      return (
                        <g
                          key={measure.id}
                          className="pianotastic-measure-block"
                          onContextMenu={(e) => {
                            e.preventDefault();
                            if (onMeasureContextMenu) {
                              onMeasureContextMenu(measure, e.clientX, e.clientY);
                            }
                          }}
                        >
                          {/* Volta Ending Bracket (1st, 2nd, 3rd Ending) */}
                          {measure.voltaEnding && (
                            <g>
                              <line
                                x1={measureX}
                                y1={systemY - 14}
                                x2={measureX + width}
                                y2={systemY - 14}
                                stroke="#1e293b"
                                strokeWidth="1.5"
                              />
                              <line
                                x1={measureX}
                                y1={systemY - 14}
                                x2={measureX}
                                y2={systemY - 4}
                                stroke="#1e293b"
                                strokeWidth="1.5"
                              />
                              <text
                                x={measureX + 4}
                                y={systemY - 18}
                                fontFamily="'Plus Jakarta Sans', sans-serif"
                                fontSize="10"
                                fontWeight="bold"
                                fill="#1e293b"
                              >
                                {measure.voltaEnding}.
                              </text>
                            </g>
                          )}

                          {/* Navigation Target badge (Segno, Coda, Fine) */}
                          {measure.navigationTarget && (
                            <text
                              x={measureX + width - 6}
                              y={systemY - 6}
                              fontFamily="'Lora', Georgia, serif"
                              fontSize="11"
                              fontWeight="bold"
                              fill="#b45309"
                              textAnchor="end"
                            >
                              {measure.navigationTarget === 'Segno'
                                ? '𝄋 Segno'
                                : measure.navigationTarget === 'Coda'
                                ? '𝄌 Coda'
                                : 'Fine'}
                            </text>
                          )}

                          {/* Pure Sheet Music Measure Surface (No boxes/borders, transparent click target) */}
                          <rect
                            x={measureX}
                            y={systemY}
                            width={width}
                            height={measureBlockHeight}
                            fill={isSelectedMeasure ? '#f8fafc' : 'transparent'}
                            fillOpacity={isSelectedMeasure ? '0.75' : '0'}
                            className="cursor-pointer"
                            onClick={() => onSelectMeasure(measure.id)}
                          />

                          {/* Left Barline (Start of System) */}
                          {mIdxInSys === 0 && !measure.repeatStart && (
                            <line
                              x1={measureX}
                              y1={systemY + 16}
                              x2={measureX}
                              y2={systemY + measureBlockHeight - 12}
                              stroke="#000000"
                              strokeWidth="1.75"
                              strokeLinecap="square"
                            />
                          )}

                          {/* Measure Number (Clean sheet music label, no box header) */}
                          <text
                            x={measureX + 6}
                            y={systemY + 14}
                            fontFamily="'Plus Jakarta Sans', sans-serif"
                            fontSize="11"
                            fontWeight="bold"
                            fill={isSelectedMeasure ? '#000000' : '#64748b'}
                          >
                            {measure.measureNumber}
                            {measure.measureNumber === 1 && pickupBeat > 1 && (
                              <tspan fill="#b45309" fontSize="9" fontWeight="bold">
                                {' '}
                                (Pickup @ Beat {pickupBeat})
                              </tspan>
                            )}
                          </text>

                          {/* Section Title (Center) */}
                          {measure.sectionName && (
                            <text
                              x={measureX + width / 2}
                              y={systemY + 14}
                              fontFamily="'Plus Jakarta Sans', sans-serif"
                              fontSize="10"
                              fontWeight="bold"
                              letterSpacing="1"
                              fill="#0f172a"
                              textAnchor="middle"
                            >
                              {measure.sectionName.toUpperCase()}
                            </text>
                          )}

                          {/* Navigation Icon / Hand Template (Right) */}
                          <g
                            className="cursor-pointer opacity-70 hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onOpenNavigationPalette) {
                                onOpenNavigationPalette(measure);
                              }
                            }}
                          >
                            <text
                              x={measureX + width - 8}
                              y={systemY + 14}
                              fontFamily="'Plus Jakarta Sans', sans-serif"
                              fontSize="9"
                              fontWeight="600"
                              fill="#64748b"
                              textAnchor="end"
                            >
                              {measure.navigationJump
                                ? measure.navigationJump
                                : handTemplate === 'Both'
                                ? 'Both'
                                : handTemplate}
                            </text>
                          </g>

                          {/* Manual Line Break Indicator (Enter) */}
                          {measure.systemBreak && (
                            <g
                              className="cursor-pointer group"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onToggleLineBreak) {
                                  onToggleLineBreak(measure.id);
                                }
                              }}
                            >
                              <rect
                                x={measureX + width - (measure.navigationJump ? 52 : 36)}
                                y={systemY + 2}
                                width={18}
                                height={14}
                                rx={3}
                                fill="#f1f5f9"
                                stroke="#94a3b8"
                                strokeWidth={1}
                              />
                              <text
                                x={measureX + width - (measure.navigationJump ? 43 : 27)}
                                y={systemY + 12}
                                fontFamily="'Plus Jakarta Sans', sans-serif"
                                fontSize="10"
                                fontWeight="bold"
                                fill="#475569"
                                textAnchor="middle"
                              >
                                ↵
                              </text>
                            </g>
                          )}

                          {/* Beat Columns (Pure Sheet Music: No horizontal or beat divider grid lines) */}
                          {Array.from({ length: totalBeats }, (_, b) => {
                            const colX = measureX + b * colWidth;
                            const colCenterX = colX + colWidth / 2;
                            const isLocked = isBeatLockedByPickup(measure.measureNumber, b, pickupBeat);
                            const isSelectedBeat =
                              selection.measureId === measure.id && selection.beatIndex === b;
                            const isPlayhead =
                              playbackPosition?.measureIndex === measureIdx &&
                              Math.floor(playbackPosition.beat) === b;

                            const chord = getChordForBeat(measure, b);
                            const pitches = beatPitches[b] || [];
                            const lyric = measure.beatLyrics?.[b] || '';
                            const symbols = measure.beatSymbols?.[b] || [];

                            return (
                              <g
                                key={`m-${measure.id}-b-${b}`}
                                className="beat-column-group"
                              >
                                {/* Playhead Active Illumination */}
                                {isPlayhead && (
                                  <rect
                                    x={colX + 1}
                                    y={systemY + 22}
                                    width={colWidth - 2}
                                    height={measureBlockHeight - 34}
                                    rx={4}
                                    fill="#3b82f6"
                                    fillOpacity="0.18"
                                  />
                                )}

                                {/* Selected Beat Highlight (Soft pill, no harsh borders) */}
                                {isSelectedBeat && (
                                  <rect
                                    x={colX + 2}
                                    y={systemY + 22}
                                    width={colWidth - 4}
                                    height={measureBlockHeight - 34}
                                    rx={4}
                                    fill="#fef3c7"
                                    fillOpacity="0.55"
                                  />
                                )}

                                {/* Locked Pickup Beat Background */}
                                {isLocked && (
                                  <rect
                                    x={colX + 1}
                                    y={systemY + 22}
                                    width={colWidth - 2}
                                    height={measureBlockHeight - 34}
                                    fill="#f8fafc"
                                    fillOpacity="0.6"
                                  />
                                )}

                                {/* ================= ROW 1: CHORD ROW (Clickable for Chord Entry) ================= */}
                                <g
                                  className="cursor-pointer group/chord"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isLocked) {
                                      onSelectBeat(measure.id, b, 0, 'chord');
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      setActiveChordPopover({
                                        measureId: measure.id,
                                        beatIndex: b,
                                        initialValue: chord || '',
                                        x: rect.left,
                                        y: rect.top,
                                      });
                                      setChordInputValue(chord || '');
                                    }
                                  }}
                                >
                                  <rect
                                    x={colX + 2}
                                    y={systemY + 24}
                                    width={colWidth - 4}
                                    height={18}
                                    fill="transparent"
                                    className="hover:fill-blue-500/10"
                                  />
                                  {chord ? (
                                    <text
                                      x={colCenterX}
                                      y={systemY + 38}
                                      fontFamily="'Plus Jakarta Sans', sans-serif"
                                      fontSize="13"
                                      fontWeight="bold"
                                      fill="#2563eb"
                                      textAnchor="middle"
                                    >
                                      {chord}
                                    </text>
                                  ) : (
                                    !isLocked && (
                                      <text
                                        x={colCenterX}
                                        y={systemY + 37}
                                        fontFamily="'Plus Jakarta Sans', sans-serif"
                                        fontSize="9"
                                        fill="#93c5fd"
                                        textAnchor="middle"
                                        className="opacity-0 group-hover/chord:opacity-100 transition-opacity"
                                      >
                                        + chord
                                      </text>
                                    )
                                  )}
                                </g>

                                {/* ================= ROW 2: BEAT NUMBER ROW ================= */}
                                <g
                                  className="cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isLocked) {
                                      onSelectBeat(measure.id, b, 0, 'beat');
                                    }
                                  }}
                                >
                                  <text
                                    x={colCenterX}
                                    y={systemY + 56}
                                    fontFamily="'Plus Jakarta Sans', sans-serif"
                                    fontSize="11"
                                    fontWeight="600"
                                    fill={isLocked ? '#94a3b8' : isSelectedBeat ? '#d97706' : '#64748b'}
                                    textAnchor="middle"
                                  >
                                    {b + 1}
                                    {isLocked && ' 🔒'}
                                  </text>
                                </g>

                                {/* ================= ROW 3: NOTE LETTER ROW ================= */}
                                <g
                                  className="cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isLocked) {
                                      onSelectBeat(measure.id, b, 0, 'note');
                                    }
                                  }}
                                >
                                  {isLocked ? (
                                    <text
                                      x={colCenterX}
                                      y={systemY + 84}
                                      fontFamily="'Plus Jakarta Sans', sans-serif"
                                      fontSize="18"
                                      fontWeight="bold"
                                      fill="#cbd5e1"
                                      textAnchor="middle"
                                    >
                                      —
                                    </text>
                                  ) : pitches.length === 0 ? (
                                    <text
                                      x={colCenterX}
                                      y={systemY + 84}
                                      fontFamily="'Plus Jakarta Sans', sans-serif"
                                      fontSize="18"
                                      fontWeight="bold"
                                      fill="#94a3b8"
                                      textAnchor="middle"
                                    >
                                      —
                                    </text>
                                  ) : (
                                    // Multiple or single notes within this beat
                                    <g>
                                      {pitches.map((p, pIdx) => {
                                        const count = pitches.length;
                                        let noteX = colCenterX;
                                        if (count === 2) {
                                          noteX =
                                            colX + (pIdx === 0 ? colWidth * 0.32 : colWidth * 0.68);
                                        } else if (count === 3) {
                                          noteX = colX + colWidth * (0.20 + pIdx * 0.30);
                                        } else if (count === 4) {
                                          noteX = colX + colWidth * (0.16 + pIdx * 0.22);
                                        }

                                        const isSubBeatActive =
                                          isSelectedBeat && (selection.subBeatIndex || 0) === pIdx;
                                        const isEmptySub = !p || !p.step;
                                        const isHigh = hasOctaveDotAbove(p);
                                        const isLow = hasOctaveDotBelow(p);

                                        return (
                                          <g
                                            key={`p-${pIdx}`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (!isLocked) {
                                                onSelectBeat(measure.id, b, pIdx, 'note');
                                              }
                                            }}
                                          >
                                            {/* Sub-beat cursor indicator */}
                                            {isSubBeatActive && (
                                              <circle
                                                cx={noteX}
                                                cy={systemY + 92}
                                                r={2.5}
                                                fill="#f59e0b"
                                              />
                                            )}

                                            {/* High Octave: Dot ABOVE note */}
                                            {!isEmptySub && isHigh && (
                                              <circle
                                                cx={noteX}
                                                cy={systemY + 67}
                                                r={2.2}
                                                fill={isSubBeatActive ? '#b45309' : '#000000'}
                                              />
                                            )}

                                            {/* Note letter or subdivision dot (e.g. '. B' or 'A .') */}
                                            <text
                                              x={noteX}
                                              y={systemY + 84}
                                              fontFamily="'Plus Jakarta Sans', sans-serif"
                                              fontSize={count > 2 ? '13' : count === 2 ? '16' : '18'}
                                              fontWeight="bold"
                                              fill={
                                                isSubBeatActive
                                                  ? '#b45309'
                                                  : isEmptySub
                                                  ? '#94a3b8'
                                                  : '#000000'
                                              }
                                              textAnchor="middle"
                                            >
                                              {isEmptySub ? (count > 1 ? '•' : '—') : formatNoteLetter(p)}
                                            </text>

                                            {/* Low Octave: Dot BELOW note */}
                                            {!isEmptySub && isLow && (
                                              <circle
                                                cx={noteX}
                                                cy={systemY + 91}
                                                r={2.2}
                                                fill={isSubBeatActive ? '#b45309' : '#000000'}
                                              />
                                            )}
                                          </g>
                                        );
                                      })}
                                    </g>
                                  )}
                                </g>

                                {/* ================= ROW 4: SYMBOLS ROW (Features ⌣ prominently) ================= */}
                                <g
                                  className="cursor-pointer group/symbol"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isLocked) {
                                      onSelectBeat(measure.id, b, 0, 'symbol');
                                      if (toolMode === 'symbol' || !symbols.includes('⌣')) {
                                        // Quick toggle ⌣ symbol on beat
                                        if (onToggleBeatSymbol) {
                                          onToggleBeatSymbol(measure.id, b, '⌣');
                                        }
                                      }
                                    }
                                  }}
                                >
                                  <rect
                                    x={colX + 2}
                                    y={systemY + 100}
                                    width={colWidth - 4}
                                    height={16}
                                    fill="transparent"
                                    className="hover:fill-purple-500/10"
                                  />
                                  {symbols.length > 0 ? (
                                    <text
                                      x={colCenterX}
                                      y={systemY + 114}
                                      fontFamily="'Plus Jakarta Sans', sans-serif"
                                      fontSize="17"
                                      fontWeight="bold"
                                      fill="#6b21a8"
                                      textAnchor="middle"
                                    >
                                      {symbols.join(' ')}
                                    </text>
                                  ) : (
                                    !isLocked && (
                                      <text
                                        x={colCenterX}
                                        y={systemY + 112}
                                        fontFamily="'Plus Jakarta Sans', sans-serif"
                                        fontSize="14"
                                        fill="#d8b4fe"
                                        textAnchor="middle"
                                        className="opacity-0 group-hover/symbol:opacity-100 transition-opacity"
                                      >
                                        ⌣
                                      </text>
                                    )
                                  )}
                                </g>

                                {/* ================= ROW 5: LYRICS ROW ================= */}
                                <g
                                  className="cursor-pointer group/lyric"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isLocked) {
                                      onSelectBeat(measure.id, b, 0, 'lyrics');
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      setActiveLyricPopover({
                                        measureId: measure.id,
                                        beatIndex: b,
                                        subBeatIndex: 0,
                                        initialValue: lyric,
                                        x: rect.left,
                                        y: rect.top,
                                      });
                                      setLyricInputValue(lyric);
                                    }
                                  }}
                                >
                                  <rect
                                    x={colX + 2}
                                    y={systemY + 120}
                                    width={colWidth - 4}
                                    height={18}
                                    fill="transparent"
                                    className="hover:fill-amber-500/10"
                                  />
                                  {lyric ? (
                                    <text
                                      x={colCenterX}
                                      y={systemY + 133}
                                      fontFamily="'Lora', Georgia, serif"
                                      fontSize="11"
                                      fontWeight="500"
                                      fontStyle="italic"
                                      fill="#334155"
                                      textAnchor="middle"
                                    >
                                      {lyric}
                                    </text>
                                  ) : (
                                    !isLocked && (
                                      <text
                                        x={colCenterX}
                                        y={systemY + 133}
                                        fontFamily="'Lora', Georgia, serif"
                                        fontSize="9"
                                        fill="#cbd5e1"
                                        textAnchor="middle"
                                        className="opacity-0 group-hover/lyric:opacity-100 transition-opacity"
                                      >
                                        + lyric
                                      </text>
                                    )
                                  )}
                                </g>
                              </g>
                            );
                          })}

                          {/* Barlines & Measure Boundaries (Pure Sheet Music: Simple Vertical Black Lines) */}
                          {/* Standard Measure Boundary (Vertical Black Barline) */}
                          {!measure.repeatEnd && measure.barlineType !== 'end' && measure.barlineType !== 'double' && (
                            <line
                              x1={measureX + width}
                              y1={systemY + 16}
                              x2={measureX + width}
                              y2={systemY + measureBlockHeight - 12}
                              stroke="#000000"
                              strokeWidth="1.5"
                              strokeLinecap="square"
                            />
                          )}

                          {/* Repeat Start (||:) on left edge */}
                          {measure.repeatStart && (
                            <g>
                              <line
                                x1={measureX + 4}
                                y1={systemY + 16}
                                x2={measureX + 4}
                                y2={systemY + measureBlockHeight - 12}
                                stroke="#000000"
                                strokeWidth="3"
                              />
                              <line
                                x1={measureX + 9}
                                y1={systemY + 16}
                                x2={measureX + 9}
                                y2={systemY + measureBlockHeight - 12}
                                stroke="#000000"
                                strokeWidth="1"
                              />
                              <circle cx={measureX + 14} cy={systemY + 54} r={2} fill="#000000" />
                              <circle cx={measureX + 14} cy={systemY + 80} r={2} fill="#000000" />
                            </g>
                          )}

                          {/* Repeat End (:||) on right edge */}
                          {measure.repeatEnd && (
                            <g>
                              {measure.repeatCount && measure.repeatCount > 2 && (
                                <text
                                  x={measureX + width - 14}
                                  y={systemY - 4}
                                  fontSize="9"
                                  fontWeight="bold"
                                  fill="#000000"
                                  textAnchor="end"
                                >
                                  {measure.repeatCount}x
                                </text>
                              )}
                              <circle
                                cx={measureX + width - 14}
                                cy={systemY + 54}
                                r={2}
                                fill="#000000"
                              />
                              <circle
                                cx={measureX + width - 14}
                                cy={systemY + 80}
                                r={2}
                                fill="#000000"
                              />
                              <line
                                x1={measureX + width - 9}
                                y1={systemY + 16}
                                x2={measureX + width - 9}
                                y2={systemY + measureBlockHeight - 12}
                                stroke="#000000"
                                strokeWidth="1"
                              />
                              <line
                                x1={measureX + width - 4}
                                y1={systemY + 16}
                                x2={measureX + width - 4}
                                y2={systemY + measureBlockHeight - 12}
                                stroke="#000000"
                                strokeWidth="3"
                              />
                            </g>
                          )}

                          {/* Final Barline */}
                          {measure.barlineType === 'end' && !measure.repeatEnd && (
                            <g>
                              <line
                                x1={measureX + width - 5}
                                y1={systemY + 16}
                                x2={measureX + width - 5}
                                y2={systemY + measureBlockHeight - 12}
                                stroke="#000000"
                                strokeWidth="1"
                              />
                              <line
                                x1={measureX + width - 2}
                                y1={systemY + 16}
                                x2={measureX + width - 2}
                                y2={systemY + measureBlockHeight - 12}
                                stroke="#000000"
                                strokeWidth="3"
                              />
                            </g>
                          )}

                          {/* Double Barline */}
                          {measure.barlineType === 'double' && !measure.repeatEnd && (
                            <g>
                              <line
                                x1={measureX + width - 4}
                                y1={systemY + 16}
                                x2={measureX + width - 4}
                                y2={systemY + measureBlockHeight - 12}
                                stroke="#000000"
                                strokeWidth="1"
                              />
                              <line
                                x1={measureX + width - 1}
                                y1={systemY + 16}
                                x2={measureX + width - 1}
                                y2={systemY + measureBlockHeight - 12}
                                stroke="#000000"
                                strokeWidth="1"
                              />
                            </g>
                          )}
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {/* Page Footer */}
              <g className="score-footer">
                <line
                  x1={staffMarginLeft}
                  y1={pageHeight - 36}
                  x2={pageWidth - staffMarginRight}
                  y2={pageHeight - 36}
                  stroke="#e2e8f0"
                  strokeWidth="1"
                />
                <text
                  x={staffMarginLeft}
                  y={pageHeight - 20}
                  fontFamily="'Plus Jakarta Sans', sans-serif"
                  fontSize="10"
                  fill="#94a3b8"
                >
                  {score.metadata.copyright || '© Pianotastic Academy'}
                </text>
                <text
                  x={pageWidth - staffMarginRight}
                  y={pageHeight - 20}
                  fontFamily="'Plus Jakarta Sans', sans-serif"
                  fontSize="10"
                  fill="#94a3b8"
                  textAnchor="end"
                >
                  Page {pageIndex + 1} of {pages.length}
                </text>
              </g>
            </svg>
          </div>
        );
      })}

      {/* ================= INLINE CHORD ENTRY POPOVER ================= */}
      {activeChordPopover && (
        <div
          className="fixed z-50 bg-white border border-stone-300 rounded-lg shadow-xl p-2.5 w-64 animate-in fade-in zoom-in-95 duration-75 text-xs text-stone-800"
          style={{
            top: Math.max(10, Math.min(window.innerHeight - 180, activeChordPopover.y - 120)),
            left: Math.max(10, Math.min(window.innerWidth - 270, activeChordPopover.x - 60)),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-stone-200">
            <span className="font-bold text-stone-900 text-[11px] uppercase tracking-wider">
              Beat {activeChordPopover.beatIndex + 1} Chord
            </span>
            <button
              onClick={() => setActiveChordPopover(null)}
              className="p-0.5 rounded text-stone-400 hover:text-stone-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick preset chips */}
          <div className="flex flex-wrap gap-1 mb-2">
            {quickChordPresets.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setChordInputValue(c);
                  if (onUpdateBeatChord) {
                    onUpdateBeatChord(activeChordPopover.measureId, activeChordPopover.beatIndex, c);
                  }
                  setActiveChordPopover(null);
                }}
                className={`px-1.5 py-0.5 rounded text-[11px] font-bold border transition-colors ${
                  chordInputValue === c
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-stone-50 border-stone-200 text-stone-800 hover:bg-blue-50 hover:border-blue-300'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Direct typing input */}
          <div className="flex items-center space-x-1 mb-2">
            <input
              type="text"
              autoFocus
              placeholder="e.g. C, Am, G7, Cmaj7"
              value={chordInputValue}
              onChange={(e) => setChordInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (onUpdateBeatChord) {
                    onUpdateBeatChord(
                      activeChordPopover.measureId,
                      activeChordPopover.beatIndex,
                      chordInputValue.trim()
                    );
                  }
                  setActiveChordPopover(null);
                } else if (e.key === 'Escape') {
                  setActiveChordPopover(null);
                }
              }}
              className="flex-1 bg-white border border-stone-300 rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={() => {
                if (onUpdateBeatChord) {
                  onUpdateBeatChord(
                    activeChordPopover.measureId,
                    activeChordPopover.beatIndex,
                    chordInputValue.trim()
                  );
                }
                setActiveChordPopover(null);
              }}
              className="px-2 py-1 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 text-xs"
            >
              Apply
            </button>
          </div>

          {/* Clear / Delete Chord Button */}
          <div className="flex items-center justify-between pt-1 border-t border-stone-100">
            <button
              onClick={() => {
                if (onUpdateBeatChord) {
                  onUpdateBeatChord(activeChordPopover.measureId, activeChordPopover.beatIndex, '');
                }
                setActiveChordPopover(null);
              }}
              className="text-[10px] text-red-600 hover:text-red-800 font-semibold flex items-center space-x-1"
            >
              <Trash2 className="w-3 h-3" />
              <span>Delete Chord</span>
            </button>
            <span className="text-[10px] text-stone-400">Press Enter ↵</span>
          </div>
        </div>
      )}

      {/* ================= INLINE LYRIC ENTRY POPOVER ================= */}
      {activeLyricPopover && (
        <div
          className="fixed z-50 bg-white border border-stone-300 rounded-lg shadow-xl p-2.5 w-64 animate-in fade-in zoom-in-95 duration-75 text-xs text-stone-800"
          style={{
            top: Math.max(10, Math.min(window.innerHeight - 150, activeLyricPopover.y - 100)),
            left: Math.max(10, Math.min(window.innerWidth - 270, activeLyricPopover.x - 60)),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-stone-200">
            <span className="font-bold text-stone-900 text-[11px] uppercase tracking-wider">
              Beat {activeLyricPopover.beatIndex + 1} Lyric
            </span>
            <button
              onClick={() => setActiveLyricPopover(null)}
              className="p-0.5 rounded text-stone-400 hover:text-stone-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center space-x-1 mb-2">
            <input
              type="text"
              autoFocus
              placeholder="Enter word or syllable..."
              value={lyricInputValue}
              onChange={(e) => setLyricInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  if (onUpdateBeatLyric) {
                    onUpdateBeatLyric(
                      activeLyricPopover.measureId,
                      activeLyricPopover.beatIndex,
                      lyricInputValue.trim()
                    );
                  }
                  setActiveLyricPopover(null);
                } else if (e.key === 'Escape') {
                  setActiveLyricPopover(null);
                }
              }}
              className="flex-1 bg-white border border-stone-300 rounded px-2 py-1 text-xs font-serif italic focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <button
              onClick={() => {
                if (onUpdateBeatLyric) {
                  onUpdateBeatLyric(
                    activeLyricPopover.measureId,
                    activeLyricPopover.beatIndex,
                    lyricInputValue.trim()
                  );
                }
                setActiveLyricPopover(null);
              }}
              className="px-2 py-1 bg-amber-600 text-white rounded font-bold hover:bg-amber-700 text-xs"
            >
              Set
            </button>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-stone-100">
            <button
              onClick={() => {
                if (onUpdateBeatLyric) {
                  onUpdateBeatLyric(activeLyricPopover.measureId, activeLyricPopover.beatIndex, '');
                }
                setActiveLyricPopover(null);
              }}
              className="text-[10px] text-red-600 hover:text-red-800 font-semibold flex items-center space-x-1"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear Lyric</span>
            </button>
            <span className="text-[10px] text-stone-400">Press Enter ↵</span>
          </div>
        </div>
      )}
    </div>
  );
};
