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
  getEffectiveBeatValue,
} from '../../utils/pianotasticNotation';

interface NotationRendererProps {
  score: Score;
  toolMode: ToolMode;
  selectedDuration: NoteDuration;
  selectedAccidental: AccidentalType | null;
  activeHand: Hand;
  selection: SelectionState;
  playbackPosition: { measureIndex: number; beat: number } | null;
  currentBeatValue?: number;
  onSelectMeasure: (measureId: string) => void;
  onSelectEvent?: (measureId: string, staff: 'RH' | 'LH', eventId: string, pitchIndex?: number) => void;
  onSelectBeat: (measureId: string, beatIndex: number, subBeatIndex?: number) => void;
  onInsertNote?: (measureId: string, staff: 'RH' | 'LH', pitch: Pitch, beatOffset?: number) => void;
  onDeleteSelected?: () => void;
  onMeasureWidthChange?: (measureId: string, newWidth: number) => void;
  onMeasureContextMenu?: (measure: Measure, x: number, y: number) => void;
  onOpenNavigationPalette?: (measure: Measure) => void;
  onUpdateBeatLyric?: (measureId: string, beatIndex: number, text: string) => void;
  onUpdateBeatChord?: (measureId: string, beatIndex: number, chord: string) => void;
}

export const NotationRenderer: React.FC<NotationRendererProps> = ({
  score,
  selection,
  playbackPosition,
  onSelectMeasure,
  onSelectBeat,
  onMeasureContextMenu,
  onOpenNavigationPalette,
  onUpdateBeatLyric,
  onUpdateBeatChord,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [editingLyric, setEditingLyric] = useState<{
    measureId: string;
    beatIndex: number;
    text: string;
  } | null>(null);

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

  const measureBlockHeight = 132;
  const systemGap = 32;

  // Dynamic Reflow & Measures per system calculation
  const systems = useMemo(() => {
    const sysList: { measures: { measure: Measure; width: number; measureIdx: number }[] }[] = [];
    const layoutMode = score.layoutSettings.layoutMode || 'auto';
    const userBarsPerLine = score.layoutSettings.barsPerLine || score.layoutSettings.measuresPerSystemAuto || 4;

    // Minimum readable measure width
    const minMeasureWidth = 120;
    const maxBarsAllowed = Math.max(1, Math.floor(contentWidth / minMeasureWidth));
    const effectiveBarsPerLine = Math.min(userBarsPerLine, maxBarsAllowed);

    let currentSystem: { measure: Measure; width: number; measureIdx: number }[] = [];

    score.measures.forEach((m, idx) => {
      const shouldBreak =
        (layoutMode === 'manual' && m.systemBreak) ||
        (layoutMode === 'auto' && currentSystem.length >= effectiveBarsPerLine);

      if (currentSystem.length > 0 && shouldBreak) {
        sysList.push({ measures: currentSystem });
        currentSystem = [];
      }

      currentSystem.push({ measure: m, width: 0, measureIdx: idx });
    });

    if (currentSystem.length > 0) {
      sysList.push({ measures: currentSystem });
    }

    // Dynamic Reflow & Intelligent Horizontal Alignment:
    // Distribute measures evenly across contentWidth so all systems start and end at exact margins
    sysList.forEach((sys) => {
      const N = sys.measures.length;
      if (N === 0) return;

      const baseWidth = Math.floor(contentWidth / N);
      const remainder = contentWidth - baseWidth * N;
      sys.measures.forEach((item, i) => {
        item.width = baseWidth + (i < remainder ? 1 : 0);
      });
    });

    return sysList;
  }, [score.measures, score.layoutSettings.barsPerLine, score.layoutSettings.measuresPerSystemAuto, score.layoutSettings.layoutMode, contentWidth]);

  // Group systems into pages
  const pages = useMemo(() => {
    const systemsPerPage = isLandscape ? 4 : 6;
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

  // Helper to find chord symbol at beat offset
  const getChordForBeat = (measure: Measure, beatIndex: number): ChordSymbolEvent | undefined => {
    if (!measure.chordSymbols || measure.chordSymbols.length === 0) return undefined;
    return measure.chordSymbols.find(
      (c) => Math.floor(c.beatOffset) === beatIndex
    );
  };

  return (
    <div
      ref={containerRef}
      className="w-full flex flex-col items-center select-none py-8 space-y-12"
      style={{
        transform: `scale(${zoom})`,
        transformOrigin: 'top center',
      }}
    >
      {pages.map((pageSystems, pageIndex) => {
        let currentSystemY = pageIndex === 0 ? 150 : 60;

        return (
          <div
            key={`page-${pageIndex}`}
            className="relative bg-white shadow-2xl rounded-sm transition-shadow duration-300"
            style={{ width: `${pageWidth}px`, minHeight: `${pageHeight}px` }}
          >
            <svg
              className="score-page-svg w-full h-full block"
              viewBox={`0 0 ${pageWidth} ${pageHeight}`}
              width={pageWidth}
              height={pageHeight}
            >
              {/* Pure White Background */}
              <rect x="0" y="0" width={pageWidth} height={pageHeight} fill="#ffffff" />

              {/* Page 1 Header (Piece Title, Metadata, Academy Branding) */}
              {pageIndex === 0 && (
                <g className="score-header">
                  {/* Academy Brand Top Bar */}
                  {score.layoutSettings.showAcademyBranding !== false && (
                    <g>
                      <text
                        x={staffMarginLeft}
                        y={32}
                        fontFamily="'Plus Jakarta Sans', sans-serif"
                        fontSize="11"
                        fontWeight="700"
                        letterSpacing="1.5"
                        fill="#0284c7"
                        textAnchor="start"
                      >
                        PIANOTASTIC ACADEMY
                      </text>
                      <text
                        x={pageWidth - staffMarginRight}
                        y={32}
                        fontFamily="'Plus Jakarta Sans', sans-serif"
                        fontSize="10"
                        fontWeight="600"
                        letterSpacing="1"
                        fill="#64748b"
                        textAnchor="end"
                      >
                        CUSTOM NOTATION STUDIO • {handTemplate === 'Both' ? 'BOTH HANDS' : handTemplate === 'RH' ? 'RIGHT HAND' : 'LEFT HAND'}
                      </text>
                      <line
                        x1={staffMarginLeft}
                        y1={40}
                        x2={pageWidth - staffMarginRight}
                        y2={40}
                        stroke="#e2e8f0"
                        strokeWidth="1"
                      />
                    </g>
                  )}

                  {/* Title */}
                  <text
                    x={pageWidth / 2}
                    y={74}
                    fontFamily="'Lora', Georgia, serif"
                    fontSize="26"
                    fontWeight="bold"
                    fill="#0f172a"
                    textAnchor="middle"
                  >
                    {score.metadata.title || 'Untitled Composition'}
                  </text>

                  {/* Subtitle */}
                  {score.metadata.subtitle && (
                    <text
                      x={pageWidth / 2}
                      y={95}
                      fontFamily="'Lora', Georgia, serif"
                      fontSize="13"
                      fontStyle="italic"
                      fill="#64748b"
                      textAnchor="middle"
                    >
                      {score.metadata.subtitle}
                    </text>
                  )}

                  {/* Tempo & Meter Block (Top Left) */}
                  <g>
                    <rect
                      x={staffMarginLeft}
                      y={106}
                      width={160}
                      height={26}
                      rx={4}
                      fill="#f8fafc"
                      stroke="#e2e8f0"
                      strokeWidth="1"
                    />
                    <text
                      x={staffMarginLeft + 10}
                      y={123}
                      fontFamily="'Plus Jakarta Sans', sans-serif"
                      fontSize="11"
                      fontWeight="bold"
                      fill="#0f172a"
                    >
                      ♩ = {score.metadata.tempoBpm || 80}
                      <tspan fill="#64748b" fontWeight="normal">
                        {' '}• {score.metadata.initialTimeSignature.numerator}/{score.metadata.initialTimeSignature.denominator}
                        {score.metadata.indianTaal && score.metadata.indianTaal !== 'None' ? ` • ${score.metadata.indianTaal}` : ''}
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
                    {system.measures.map(({ measure, width, measureIdx }) => {
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
                          {/* Volta Ending Bracket (1st, 2nd Ending) */}
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
                              {measure.navigationTarget}
                            </text>
                          )}

                          {/* Outer Measure Rectangle */}
                          <rect
                            x={measureX}
                            y={systemY}
                            width={width}
                            height={measureBlockHeight}
                            rx={4}
                            fill="#ffffff"
                            stroke={isSelectedMeasure ? '#2563eb' : '#cbd5e1'}
                            strokeWidth={isSelectedMeasure ? 2 : 1}
                            className="cursor-pointer"
                            onClick={() => onSelectMeasure(measure.id)}
                          />

                          {/* Top Header Bar */}
                          <path
                            d={`M ${measureX + 1} ${systemY + 24} L ${measureX + 1} ${systemY + 4} Q ${measureX + 1} ${systemY + 1} ${measureX + 4} ${systemY + 1} L ${measureX + width - 4} ${systemY + 1} Q ${measureX + width - 1} ${systemY + 1} ${measureX + width - 1} ${systemY + 4} L ${measureX + width - 1} ${systemY + 24} Z`}
                            fill="#f8fafc"
                          />
                          <line
                            x1={measureX}
                            y1={systemY + 24}
                            x2={measureX + width}
                            y2={systemY + 24}
                            stroke="#e2e8f0"
                            strokeWidth="1"
                          />

                          {/* Measure Number (Left) */}
                          <text
                            x={measureX + 8}
                            y={systemY + 16}
                            fontFamily="'Plus Jakarta Sans', sans-serif"
                            fontSize="11"
                            fontWeight="bold"
                            fill="#334155"
                          >
                            {measure.measureNumber}
                            {measure.measureNumber === 1 && pickupBeat > 1 && (
                              <tspan fill="#b45309" fontSize="9" fontWeight="bold">
                                {' '}(Pickup @ Beat {pickupBeat})
                              </tspan>
                            )}
                          </text>

                          {/* Section Title (Center) */}
                          {measure.sectionName && (
                            <text
                              x={measureX + width / 2}
                              y={systemY + 16}
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

                          {/* Hand Template Tag (Right) */}
                          <text
                            x={measureX + width - 8}
                            y={systemY + 16}
                            fontFamily="'Plus Jakarta Sans', sans-serif"
                            fontSize="9"
                            fontWeight="600"
                            fill="#94a3b8"
                            textAnchor="end"
                          >
                            {handTemplate === 'Both' ? 'Both' : handTemplate}
                          </text>

                          {/* Horizontal Grid Dividers */}
                          {/* Divider 1: Below Chord Row */}
                          <line
                            x1={measureX}
                            y1={systemY + 48}
                            x2={measureX + width}
                            y2={systemY + 48}
                            stroke="#f1f5f9"
                            strokeWidth="1"
                          />
                          {/* Divider 2: Below Beat Numbers */}
                          <line
                            x1={measureX}
                            y1={systemY + 68}
                            x2={measureX + width}
                            y2={systemY + 68}
                            stroke="#e2e8f0"
                            strokeWidth="1"
                          />
                          {/* Divider 3: Below Note Letters */}
                          <line
                            x1={measureX}
                            y1={systemY + 104}
                            x2={measureX + width}
                            y2={systemY + 104}
                            stroke="#e2e8f0"
                            strokeWidth="1"
                          />

                          {/* Beat Columns */}
                          {Array.from({ length: totalBeats }, (_, b) => {
                            const colX = measureX + b * colWidth;
                            const colCenterX = colX + colWidth / 2;
                            const isLocked = isBeatLockedByPickup(measure.measureNumber, b, pickupBeat);
                            const isSelectedBeat = selection.measureId === measure.id && selection.beatIndex === b;
                            const isPlayhead =
                              playbackPosition?.measureIndex === measureIdx &&
                              Math.floor(playbackPosition.beat) === b;

                            const chord = getChordForBeat(measure, b);
                            const pitches = beatPitches[b] || [];
                            const lyric = measure.beatLyrics?.[b] || '';

                            return (
                              <g
                                key={`m-${measure.id}-b-${b}`}
                                className="beat-column-group cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isLocked) {
                                    onSelectBeat(measure.id, b, 0);
                                  }
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  if (!isLocked) {
                                    const newLyric = prompt('Enter Lyric / Solfege for Beat ' + (b + 1) + ':', lyric);
                                    if (newLyric !== null && onUpdateBeatLyric) {
                                      onUpdateBeatLyric(measure.id, b, newLyric.trim());
                                    }
                                  }
                                }}
                              >
                                {/* Vertical Beat Separator Line */}
                                {b > 0 && (
                                  <line
                                    x1={colX}
                                    y1={systemY + 24}
                                    x2={colX}
                                    y2={systemY + measureBlockHeight}
                                    stroke="#f1f5f9"
                                    strokeDasharray="2,2"
                                  />
                                )}

                                {/* Playhead Active Illumination */}
                                {isPlayhead && (
                                  <rect
                                    x={colX}
                                    y={systemY + 24}
                                    width={colWidth}
                                    height={measureBlockHeight - 24}
                                    fill="#3b82f6"
                                    fillOpacity="0.18"
                                  />
                                )}

                                {/* Selected Beat Highlight Box */}
                                {isSelectedBeat && (
                                  <rect
                                    x={colX + 1.5}
                                    y={systemY + 25}
                                    width={colWidth - 3}
                                    height={measureBlockHeight - 26}
                                    rx={3}
                                    fill="#fef3c7"
                                    fillOpacity="0.45"
                                    stroke="#f59e0b"
                                    strokeWidth="1.5"
                                  />
                                )}

                                {/* Locked Pickup Beat Background */}
                                {isLocked && (
                                  <rect
                                    x={colX + 1}
                                    y={systemY + 25}
                                    width={colWidth - 2}
                                    height={measureBlockHeight - 26}
                                    fill="#f8fafc"
                                    fillOpacity="0.8"
                                  />
                                )}

                                {/* Row 1: Chord Row */}
                                {chord && (
                                  <text
                                    x={colCenterX}
                                    y={systemY + 42}
                                    fontFamily="'Plus Jakarta Sans', sans-serif"
                                    fontSize="13"
                                    fontWeight="bold"
                                    fill="#2563eb"
                                    textAnchor="middle"
                                  >
                                    {chord.root}
                                    {chord.quality || ''}
                                  </text>
                                )}

                                {/* Row 2: Beat Number Row */}
                                <text
                                  x={colCenterX}
                                  y={systemY + 61}
                                  fontFamily="'Plus Jakarta Sans', sans-serif"
                                  fontSize="11"
                                  fontWeight="600"
                                  fill={isLocked ? '#94a3b8' : isSelectedBeat ? '#d97706' : '#64748b'}
                                  textAnchor="middle"
                                >
                                  {b + 1}
                                  {isLocked && ' 🔒'}
                                </text>

                                {/* Row 3: Note Letter Row */}
                                {isLocked ? (
                                  <text
                                    x={colCenterX}
                                    y={systemY + 90}
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
                                    y={systemY + 90}
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
                                        noteX = colX + (pIdx === 0 ? colWidth * 0.32 : colWidth * 0.68);
                                      } else if (count === 3) {
                                        noteX = colX + colWidth * (0.22 + pIdx * 0.28);
                                      } else if (count === 4) {
                                        noteX = colX + colWidth * (0.16 + pIdx * 0.22);
                                      }

                                      const isSubBeatActive =
                                        isSelectedBeat && (selection.subBeatIndex || 0) === pIdx;

                                      return (
                                        <g key={`p-${pIdx}`}>
                                          {isSubBeatActive && (
                                            <circle
                                              cx={noteX}
                                              cy={systemY + 98}
                                              r={2}
                                              fill="#f59e0b"
                                            />
                                          )}
                                          <text
                                            x={noteX}
                                            y={systemY + 90}
                                            fontFamily="'Plus Jakarta Sans', sans-serif"
                                            fontSize={count > 2 ? '13' : '16'}
                                            fontWeight="bold"
                                            fill={isSubBeatActive ? '#b45309' : '#0f172a'}
                                            textAnchor="middle"
                                          >
                                            {formatNoteLetter(p)}
                                          </text>
                                        </g>
                                      );
                                    })}
                                  </g>
                                )}

                                {/* Row 4: Lyrics / Solfege / Custom Text */}
                                {lyric ? (
                                  <text
                                    x={colCenterX}
                                    y={systemY + 120}
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
                                      y={systemY + 120}
                                      fontFamily="'Lora', Georgia, serif"
                                      fontSize="9"
                                      fill="#cbd5e1"
                                      textAnchor="middle"
                                      className="opacity-0 hover:opacity-100 transition-opacity"
                                    >
                                      + lyric
                                    </text>
                                  )
                                )}
                              </g>
                            );
                          })}

                          {/* Barlines & Repeat Marks */}
                          {/* Repeat Start (||:) on left edge */}
                          {measure.repeatStart && (
                            <g>
                              <line
                                x1={measureX + 4}
                                y1={systemY}
                                x2={measureX + 4}
                                y2={systemY + measureBlockHeight}
                                stroke="#0f172a"
                                strokeWidth="3"
                              />
                              <line
                                x1={measureX + 9}
                                y1={systemY}
                                x2={measureX + 9}
                                y2={systemY + measureBlockHeight}
                                stroke="#0f172a"
                                strokeWidth="1"
                              />
                              <circle cx={measureX + 14} cy={systemY + 54} r={2} fill="#0f172a" />
                              <circle cx={measureX + 14} cy={systemY + 80} r={2} fill="#0f172a" />
                            </g>
                          )}

                          {/* Repeat End (:||) on right edge */}
                          {measure.repeatEnd && (
                            <g>
                              <circle cx={measureX + width - 14} cy={systemY + 54} r={2} fill="#0f172a" />
                              <circle cx={measureX + width - 14} cy={systemY + 80} r={2} fill="#0f172a" />
                              <line
                                x1={measureX + width - 9}
                                y1={systemY}
                                x2={measureX + width - 9}
                                y2={systemY + measureBlockHeight}
                                stroke="#0f172a"
                                strokeWidth="1"
                              />
                              <line
                                x1={measureX + width - 4}
                                y1={systemY}
                                x2={measureX + width - 4}
                                y2={systemY + measureBlockHeight}
                                stroke="#0f172a"
                                strokeWidth="3"
                              />
                            </g>
                          )}

                          {/* Final Barline */}
                          {measure.barlineType === 'end' && !measure.repeatEnd && (
                            <g>
                              <line
                                x1={measureX + width - 5}
                                y1={systemY}
                                x2={measureX + width - 5}
                                y2={systemY + measureBlockHeight}
                                stroke="#0f172a"
                                strokeWidth="1"
                              />
                              <line
                                x1={measureX + width - 2}
                                y1={systemY}
                                x2={measureX + width - 2}
                                y2={systemY + measureBlockHeight}
                                stroke="#0f172a"
                                strokeWidth="3"
                              />
                            </g>
                          )}

                          {/* Double Barline */}
                          {measure.barlineType === 'double' && !measure.repeatEnd && (
                            <g>
                              <line
                                x1={measureX + width - 4}
                                y1={systemY}
                                x2={measureX + width - 4}
                                y2={systemY + measureBlockHeight}
                                stroke="#0f172a"
                                strokeWidth="1"
                              />
                              <line
                                x1={measureX + width - 1}
                                y1={systemY}
                                x2={measureX + width - 1}
                                y2={systemY + measureBlockHeight}
                                stroke="#0f172a"
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
    </div>
  );
};
