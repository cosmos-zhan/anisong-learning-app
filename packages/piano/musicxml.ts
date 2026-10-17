import { strFromU8, unzipSync } from "fflate";
import {highestNotes} from './projection';
import {
  PPQ,
  type Measure,
  type NoteEvent,
  type Score,
  type ScorePart,
  type Tempo,
} from "./types";

const LIMIT = 8 * 1024 * 1024;
const CHORD = '含和弦，等待弹对仅支持单音；自动试听可演奏原轨。';
const OVERLAP = '同一轨道有重叠音符，等待弹对仅支持单音。';
const children = (node: Element, name: string) =>
  Array.from(node.children).filter((e) => e.localName === name);
const child = (node: Element, name: string) => children(node, name)[0];
const value = (node: Element, name: string, fallback = "") =>
  child(node, name)?.textContent?.trim() ?? fallback;
const number = (node: Element, name: string, fallback: number) => {
  const text = value(node, name);
  const result = text === "" ? fallback : Number(text);
  if (!Number.isFinite(result)) throw new Error(`无效的 ${name} 数值。`);
  return result;
};
export function scoreHash(xml: string) {
  let h = 2166136261;
  for (let i = 0; i < xml.length; i++)
    h = Math.imul(h ^ xml.charCodeAt(i), 16777619);
  return `score-${(h >>> 0).toString(16)}`;
}
export function xmlDocument(xml: string): Document {
  if (xml.length > LIMIT)
    throw new Error("乐谱 XML 超过 8 MB，请导出较小的旋律声部。");
  if (/<!ENTITY/i.test(xml)) throw new Error("不支持含自定义实体的 XML。");
  const doc = new DOMParser().parseFromString(
    xml.replace(/<!DOCTYPE[^>]*>/gi, ""),
    "application/xml",
  );
  if (doc.querySelector("parsererror") || !doc.documentElement)
    throw new Error("无效 XML：请检查文件是否完整。");
  return doc;
}
export async function readScore(
  file: Pick<File, "name" | "size" | "arrayBuffer">,
): Promise<Score> {
  if (file.size > 4 * 1024 * 1024)
    throw new Error("文件超过 4 MB，请导出较小的旋律谱。");
  const data = new Uint8Array(await file.arrayBuffer());
  if (
    file.name.toLowerCase().endsWith(".mxl") ||
    (data[0] === 80 && data[1] === 75)
  ) {
    try {
      let expanded = 0;
      let count = 0;
      const files = unzipSync(data, {
        filter: (info) => {
          expanded += info.originalSize;
          count++;
          if (
            expanded > 16 * 1024 * 1024 ||
            count > 256 ||
            info.originalSize > LIMIT
          )
            throw new Error("压缩谱展开后过大。");
          if (
            info.name.startsWith("/") ||
            info.name.split(/[\\/]/).includes("..")
          )
            throw new Error("压缩谱包含不安全路径。");
          return !info.name.endsWith("/");
        },
      });
      const container = files["META-INF/container.xml"];
      if (!container) throw new Error("缺少 META-INF/container.xml。");
      const doc = xmlDocument(strFromU8(container));
      const roots = Array.from(doc.getElementsByTagName("rootfile"));
      const root =
        roots.find(
          (e) =>
            e.getAttribute("media-type") ===
            "application/vnd.recordare.musicxml+xml",
        ) ?? roots[0];
      const name = root?.getAttribute("full-path");
      if (!name || !files[name]) throw new Error("找不到 MusicXML 主文件。");
      return parseMusicXml(strFromU8(files[name]), file.name, "mxl");
    } catch (error) {
      throw new Error(`MXL 导入失败：${(error as Error).message}`);
    }
  }
  return parseMusicXml(strFromU8(data), file.name);
}

export function parseMusicXml(
  xml: string,
  fallback = "未命名乐谱",
  format: Score["format"] = "musicxml",
): Score {
  const doc = xmlDocument(xml);
  const root = doc.documentElement;
  if (root.localName !== "score-partwise")
    throw new Error(
      "P0 支持 score-partwise MusicXML；请在制谱软件中导出此格式。",
    );
  const warnings = new Set<string>();
  let needsWrittenOrder = false;
  const tempos: Tempo[] = [];
  const parts: ScorePart[] = [];
  const partNodes = children(root, "part");
  if (partNodes.length > 64)
    throw new Error("声部超过 64 个，请先导出目标乐器。");
  let totalNotes = 0;
  partNodes.forEach((partNode, partIndex) => {
    const id = partNode.getAttribute("id") || `P${partIndex + 1}`;
    const definition = Array.from(root.getElementsByTagName("score-part")).find(
      (e) => e.getAttribute("id") === id,
    );
    const name = definition ? value(definition, "part-name", id) : id;
    const localTempos: Tempo[] = [];
    let divisions = 1,
      beats = 4,
      beatType = 4,
      fifths = 0,
      absolute = 0,
      transpose = 0;
    const measures: Measure[] = [];
    const trackProblems = new Map<string, Set<string>>();
    const problem = (key: string, text: string) => {
      if (!trackProblems.has(key)) trackProblems.set(key, new Set());
      trackProblems.get(key)!.add(text);
    };
    children(partNode, "measure").forEach((measureNode, mi) => {
      if (mi >= 2000) throw new Error("小节超过 2000 个，请分段导出。");
      let cursor = 0,
        extent = 0,
        previousOnset = 0;
      const events: NoteEvent[] = [];
      const attrs = child(measureNode, "attributes");
      if (attrs) {
        divisions = number(attrs, "divisions", divisions);
        if (divisions <= 0) throw new Error("divisions 必须大于 0。");
        const time = child(attrs, "time");
        if (time) {
          const raw = value(time, "beats", String(beats));
          if (!/^\d+$/.test(raw))
            throw new Error("P0 暂不支持复合分组拍号，请导出常规拍号旋律。");
          beats = Number(raw);
          beatType = number(time, "beat-type", beatType);
          if (
            beats < 1 ||
            beats > 32 ||
            ![1, 2, 4, 8, 16, 32, 64].includes(beatType)
          )
            throw new Error("拍号不受支持。");
        }
        const key = child(attrs, "key");
        if (key) fifths = number(key, "fifths", fifths);
        const trans = child(attrs, "transpose");
        if (trans)
          transpose =
            number(trans, "chromatic", 0) +
            12 * number(trans, "octave-change", 0);
      }
      for (const node of Array.from(measureNode.children)) {
        if (node.localName === "backup" || node.localName === "forward") {
          const duration = (number(node, "duration", 0) * PPQ) / divisions;
          if (duration < 0) throw new Error("时值不能为负。");
          cursor += (node.localName === "backup" ? -1 : 1) * duration;
          if (cursor < -0.01)
            throw new Error(`第 ${mi + 1} 小节 backup 超出小节起点。`);
          extent = Math.max(extent, cursor);
          continue;
        }
        if (node.localName === "direction" || node.localName === "sound") {
          const sound =
            node.localName === "sound"
              ? node
              : node.getElementsByTagName("sound")[0];
          const metro = node.getElementsByTagName("metronome")[0];
          let bpm = sound?.getAttribute("tempo")
            ? Number(sound.getAttribute("tempo"))
            : 0;
          if (!bpm && metro) {
            const unit = value(metro, "beat-unit", "quarter");
            const units: Record<string, number> = {
              whole: 4,
              half: 2,
              quarter: 1,
              eighth: 0.5,
              "16th": 0.25,
            };
            bpm =
              number(metro, "per-minute", 0) *
              (units[unit] ?? 1) *
              (2 - 1 / 2 ** children(metro, "beat-unit-dot").length);
          }
          if (bpm) {
            if (!Number.isFinite(bpm) || bpm < 10 || bpm > 600)
              throw new Error("速度须在每分钟 10–600 四分音符之间。");
            localTempos.push({
              tick: Math.max(
                0,
                absolute +
                  cursor +
                  (number(node, "offset", 0) * PPQ) / divisions,
              ),
              bpm,
            });
          }
        }
        if (node.localName !== "note") continue;
        if (++totalNotes > 30000)
          throw new Error("音符超过 30000 个，请分段导出。");
        const staff = value(node, "staff", "1"),
          voice = value(node, "voice", "1"),
          trackId = `${staff}:${voice}`;
        if (!trackProblems.has(trackId)) trackProblems.set(trackId, new Set());
        const chord = !!child(node, "chord");
        const grace = !!child(node, "grace");
        let duration = (number(node, "duration", 0) * PPQ) / divisions;
        if (grace) {
          problem(trackId, "含倚音，P0 不自动演奏该轨道。");
          warnings.add("倚音保留在原谱中；请选择不含倚音的旋律轨道。");
          continue;
        }
        if (duration <= 0)
          throw new Error(
            `第 ${mi + 1} 小节有缺少有效 duration 的音符。请重新导出 MusicXML。`,
          );
        duration = Math.round(duration * 1000) / 1000;
        const onset = chord ? previousOnset : cursor;
        let pitch: NoteEvent["pitch"] = null;
        const p = child(node, "pitch");
        if (p) {
          const step = value(p, "step"),
            octave = number(p, "octave", 4),
            alter = number(p, "alter", 0);
          const semitones: Record<string, number> = {
            C: 0,
            D: 2,
            E: 4,
            F: 5,
            G: 7,
            A: 9,
            B: 11,
          };
          if (!(step in semitones)) throw new Error("音高拼写不合法。");
          const midi = (octave + 1) * 12 + semitones[step] + alter;
          if (!Number.isInteger(midi) || midi < 0 || midi > 127)
            problem(trackId, "含微分音或超出 MIDI 音域，P0 不自动演奏。");
          pitch = { step, octave, alter, midi };
        } else if (!child(node, "rest"))
          problem(trackId, "含非定音高音符，P0 不自动演奏。");
        if (chord)
          problem(
            trackId,
            CHORD,
          );
        if (transpose !== 0)
          problem(trackId, "含移调乐器，请先导出实音谱后练习。");
        const ties = Array.from(node.getElementsByTagName("tie")).concat(
          Array.from(node.getElementsByTagName("tied")),
        );
        events.push({
          id: `${id}-m${mi}-n${events.length}`,
          measure: mi,
          tick: absolute + onset,
          duration,
          staff,
          voice,
          pitch,
          chord,
          tieStart: ties.some((t) => t.getAttribute("type") === "start"),
          tieStop: ties.some((t) => t.getAttribute("type") === "stop"),
        });
        previousOnset = onset;
        if (!chord) cursor += duration;
        extent = Math.max(extent, onset + duration);
      }
      if (
        measureNode.querySelector("repeat, ending, segno, coda") ||
        Array.from(measureNode.getElementsByTagName("sound")).some((s) =>
          ["dacapo", "dalsegno", "tocoda", "fine"].some((a) =>
            s.hasAttribute(a),
          ),
        )
      ) {
        needsWrittenOrder = true;
        warnings.add(
          "含反复/跳转记号。P0 不展开反复；须确认按书写小节顺序练习，原谱符号仍保留。",
        );
      }
      if (measureNode.querySelector("ornaments, tremolo, glissando, slide"))
        warnings.add("装饰音、震音或滑音仅保留谱面，试听使用写定主音及时值。");
      const nominal = (beats * PPQ * 4) / beatType;
      const duration =
        measureNode.getAttribute("implicit") === "yes" && extent > 0
          ? extent
          : Math.max(nominal, extent);
      if (extent > nominal + 0.1)
        warnings.add("存在超出拍号长度的小节，按实际音符时值演奏。");
      measures.push({
        id: `${id}-m${mi}`,
        label: measureNode.getAttribute("number") ?? String(mi + 1),
        index: mi,
        tick: absolute,
        duration,
        fifths,
        beats,
        beatType,
        events,
      });
      absolute += duration;
    });
    const tracks = Array.from(trackProblems, ([trackId, problems]) => {
      const [staff, voice] = trackId.split(":");
      const notes = measures
        .flatMap((m) => m.events)
        .filter((e) => e.staff === staff && e.voice === voice)
        .sort((a, b) => a.tick - b.tick);
      let end = -1;
      for (const note of notes) {
        if (note.tick < end - 0.01)
          problems.add(OVERLAP);
        end = Math.max(end, note.tick + note.duration);
      }
      const original={ id: trackId, staff, voice, blocked: Array.from(problems), listenBlocked: [...problems].filter(p=>p!==CHORD&&p!==OVERLAP) };
      // Offer an explicitly selected single-note exercise only when all unsupported
      // features reduce to chords and choosing their highest pitches removes overlap.
      const selected=highestNotes(notes);
      const canProject=problems.has(CHORD)&&[...problems].every(p=>p===CHORD||p===OVERLAP)&&selected.every((n,i)=>i===0||n.tick>=selected[i-1].tick+selected[i-1].duration-0.01);
      return canProject?[original,{id:`${trackId}:highest`,staff,voice,blocked:[],projection:'highest' as const}]:[original];
    }).flat();
    if (measures.length && tracks.length)
      parts.push({ id, name, measures, tracks });
    if (!tempos.length) tempos.push(...localTempos);
    else if (
      localTempos.length &&
      JSON.stringify(localTempos) !== JSON.stringify(tempos)
    )
      warnings.add(
        "各声部速度标记不同，统一使用首个含速度标记声部的 tempo map。",
      );
  });
  if (!parts.some((p) => p.measures.some((m) => m.events.some((e) => e.pitch))))
    throw new Error("未找到可读取的定音高音符。");
  const sorted = tempos
    .sort((a, b) => a.tick - b.tick)
    .filter((t, i, a) => i === a.length - 1 || t.tick !== a[i + 1].tick);
  if (!sorted.length || sorted[0].tick > 0)
    sorted.unshift({ tick: 0, bpm: 100 });
  if (!tempos.length) warnings.add("未写明速度，使用 ♩=100。");
  warnings.add(
    "P0 试听不展开力度、踏板与表情；连音线连接音高和时值，演奏法连线按写定音符演奏。",
  );
  const title =
    root.getElementsByTagName("work-title")[0]?.textContent?.trim() ||
    root.getElementsByTagName("movement-title")[0]?.textContent?.trim() ||
    fallback.replace(/\.(mxl|xml|musicxml)$/i, "");
  return {
    id: scoreHash(xml),
    title,
    xml,
    format,
    parts,
    tempos: sorted,
    warnings: Array.from(warnings),
    needsWrittenOrder,
  };
}

const partXmlCache=new WeakMap<Score,Map<string,string>>();
export function partXml(score: Score, partId: string, window?:[number,number]) {
  if(!window){const cached=partXmlCache.get(score)?.get(partId);if(cached)return cached;}
  const doc = xmlDocument(window?partXml(score,partId):score.xml);
  for (const part of Array.from(doc.documentElement.children).filter(
    (e) => e.localName === "part",
  ))
    if (part.getAttribute("id") !== partId) part.remove();
  for (const def of Array.from(doc.getElementsByTagName("score-part")))
    if (def.getAttribute("id") !== partId) def.remove();
  if(window){
    const part=Array.from(doc.getElementsByTagName('part')).find(p=>p.getAttribute('id')===partId);
    if(part){
      const measures=children(part,'measure');const start=Math.max(0,window[0]),end=Math.min(measures.length-1,window[1]);
      const attrs=new Map<string,Element>();
      for(const measure of measures.slice(0,start+1))for(const a of children(measure,'attributes'))for(const field of Array.from(a.children))attrs.set(`${field.localName}:${field.getAttribute('number')??''}`,field.cloneNode(true) as Element);
      if(measures[start]&&attrs.size){for(const a of children(measures[start],'attributes'))a.remove();const a=doc.createElement('attributes');for(const field of attrs.values())a.append(field);measures[start].prepend(a);}
      measures.forEach((m,i)=>{if(i<start||i>end)m.remove();});
    }
  }
  // Remote credits/images are not needed for learning, and must not fetch assets from imported XML.
  for (const node of Array.from(
    doc.querySelectorAll("credit, defaults, part-group, link, opus, image"),
  ))
    node.remove();
  const result=(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    new XMLSerializer().serializeToString(doc)
  );
  if(!window){if(!partXmlCache.has(score))partXmlCache.set(score,new Map());partXmlCache.get(score)!.set(partId,result);}
  return result;
}
