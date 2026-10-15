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
  graphic: GraphicalNote;
}
export async function engrave(
  container: HTMLElement,
  score: Score,
  part: ScorePart,
  track: Track,
  zoom = 0.65,
) {
  const osmd = new OpenSheetMusicDisplay(container, {
    backend: "svg",
    autoResize: false,
    renderSingleHorizontalStaffline: true,
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
  await osmd.load(partXml(score, part.id));
  osmd.render();
  const bars: BarBox[] = [],
    notes: NoteBox[] = [],
    factor = 10 * zoom;
  osmd.GraphicSheet.MeasureList.forEach((staffMeasures, index) => {
    const boxes = staffMeasures.filter(Boolean).map((m) => m.PositionAndShape);
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
      if (!measure) return;
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
