import {
  OpenSheetMusicDisplay,
  type GraphicalNote,
} from "opensheetmusicdisplay";
import { partXml } from "../../../../packages/piano/musicxml";
import {
  PPQ,
  type NoteEvent,
  type Score,
  type ScorePart,
  type Track,
} from "../../../../packages/piano/types";
export interface BarBox {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface NoteBox {
  event: NoteEvent;
  x: number;
  y: number;
  graphic: Pick<GraphicalNote, "setColor">;
}
export async function engrave(
  container: HTMLElement,
  score: Score,
  part: ScorePart,
  track: Track,
  zoom = 0.65,
  window?: [number, number],
  wrap = false,
) {
  const osmd = new OpenSheetMusicDisplay(container, {
    backend: "svg",
    autoResize: false,
    renderSingleHorizontalStaffline: !wrap,
    pageFormat: "Endless",
    drawTitle: false,
    drawSubtitle: false,
    drawComposer: false,
    drawPartNames: false,
    drawLyrics: false,
    drawMeasureNumbers: true,
    measureNumberInterval: 1,
    autoGenerateMultipleRestMeasuresFromRestMeasures: false,
    drawingParameters: "compacttight",
    newSystemFromXML: false,
  });
  osmd.Zoom = zoom;
  osmd.EngravingRules.PageTopMargin = 1;
  osmd.EngravingRules.PageBottomMargin = 1;
  osmd.EngravingRules.PageLeftMargin = 0.5;
  osmd.EngravingRules.PageRightMargin = 0.5;
  // Auxiliary pitch labels sit below each staff; compacttight's 1-unit system
  // gap otherwise puts them on top of the next system's clef and notes.
  if (wrap) {
    osmd.EngravingRules.MinimumDistanceBetweenSystems = 7;
    osmd.EngravingRules.MinSkyBottomDistBetweenSystems = 4;
    osmd.EngravingRules.RenderXMeasuresPerLineAkaSystem =
      parseFloat(container.style.width) >= 500 ? 2 : 1;
  }
  await osmd.load(partXml(score, part.id, window));
  // Practice follows one staff. Hide the others without rewriting MusicXML or
  // changing its voices, timing, clefs, key/time signatures, or playback model.
  osmd.Sheet.Instruments[0]?.Staves.forEach((staff, i) => {
    staff.Visible = String(i + 1) === track.staff;
  });
  osmd.render();
  const bars: BarBox[] = [],
    notes: NoteBox[] = [],
    factor = 10 * zoom;
  osmd.GraphicSheet.MeasureList.forEach((staffMeasures, offset) => {
    const index = offset + (window?.[0] ?? 0);
    const boxes = staffMeasures
      .filter((m) => m?.ParentStaff.isVisible())
      .map((m) => m.PositionAndShape);
    if (!boxes.length) return;
    const x =
      Math.min(...boxes.map((b) => b.AbsolutePosition.x + b.BorderLeft)) *
      factor;
    const y = Math.max(
      0,
      Math.min(...boxes.map((b) => b.AbsolutePosition.y + b.BorderTop)) *
        factor,
    );
    const right =
      Math.max(...boxes.map((b) => b.AbsolutePosition.x + b.BorderRight)) *
      factor;
    const bottom =
      Math.max(...boxes.map((b) => b.AbsolutePosition.y + b.BorderBottom)) *
      factor;
    bars.push({
      index,
      x,
      y,
      width: Math.max(24, right - x),
      height: Math.max(45, bottom - y),
    });
    staffMeasures.forEach((measure, staffIndex) => {
      if (!measure || !measure.ParentStaff.isVisible()) return;
      for (const entry of measure.staffEntries) {
        const tick =
          (part.measures[index]?.tick ?? 0) +
          entry.relInMeasureTimestamp.RealValue * 4 * PPQ;
        for (const voice of entry.graphicalVoiceEntries) {
          const voiceId = String(voice.parentVoiceEntry.ParentVoice.VoiceId);
          const candidates =
            part.measures[index]?.events.filter(
              (n) =>
                n.staff === String(staffIndex + 1) &&
                n.voice === voiceId &&
                Math.abs(n.tick - tick) < 0.1,
            ) ?? [];
          voice.notes.forEach((graphic, i) => {
            const event = candidates[i];
            if (
              !event ||
              event.staff !== track.staff ||
              event.voice !== track.voice
            )
              return;
            const pos = graphic.PositionAndShape.AbsolutePosition;
            notes.push({
              event,
              x: pos.x * factor,
              y: (measure.PositionAndShape.AbsolutePosition.y + 7) * factor,
              graphic,
            });
          });
        }
      }
    });
  });
  return { osmd, bars, notes };
}
