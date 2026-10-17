import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { parseMusicXml, readScore, partXml } from "../packages/piano/musicxml";
import {
  buildSteps,
  pitchLabel,
  rangeIndices,
  secondsBetween,
  tickAfter,
} from "../packages/piano/timeline";
import { demoXml, demoScore, fixture, note, rest } from "./piano-fixtures";

describe("MusicXML and musical timeline", () => {
  it("reads the legal eight-bar fixture, accidentals, rests, key/time/tempo and stable IDs", () => {
    const s = demoScore(),
      p = s.parts[0];
    expect(p.measures).toHaveLength(8);
    expect(s.title).toContain("晨光");
    expect(s.tempos).toEqual([{ tick: 0, bpm: 96 }]);
    expect(p.measures[0]).toMatchObject({
      tick: 0,
      duration: 1920,
      beats: 4,
      beatType: 4,
      fifths: 0,
    });
    expect(p.measures[2].events[1].pitch).toMatchObject({
      step: "F",
      alter: 1,
      midi: 66,
    });
    expect(p.measures[1].events.map((n) => n.duration)).toEqual([
      720, 240, 480, 480,
    ]);
    expect(p.measures[1].events[3].pitch).toBeNull();
    expect(demoScore().id).toBe(s.id);
  });
  it("normalizes divisions, tuplets and dotted durations using actual XML duration", () => {
    const xml = fixture([
      note("D", 180, "<dot/>") +
        note(
          "E",
          40,
          "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>",
        ),
    ]).replace("<divisions>480", "<divisions>120");
    expect(
      parseMusicXml(xml).parts[0].measures[0].events.map((e) => e.duration),
    ).toEqual([720, 160]);
  });
  it("supports 3/4, weak pickup and tempo changes, integrates relative speed without changing pitch", () => {
    const xml = fixture([
      note("C"),
      '<direction><sound tempo="60"/></direction>' + note("D", 1440),
    ])
      .replace("<beats>4", "<beats>3")
      .replace('<measure number="1">', '<measure number="0" implicit="yes">');
    const s = parseMusicXml(xml),
      p = s.parts[0];
    expect(p.measures.map((m) => m.duration)).toEqual([480, 1440]);
    expect(s.tempos).toEqual([
      { tick: 0, bpm: 120 },
      { tick: 480, bpm: 60 },
    ]);
    expect(secondsBetween(s.tempos, 0, 1920)).toBeCloseTo(3.5);
    expect(secondsBetween(s.tempos, 0, 1920, 0.5)).toBeCloseTo(7);
    expect(tickAfter(s.tempos, 0, 1920, 1.5, 1)).toBeCloseTo(960);
  });
  it("reads dotted metronome units and direct measure sound tempo", () => {
    const s = parseMusicXml(
      fixture([
        "<direction><direction-type><metronome><beat-unit>eighth</beat-unit><beat-unit-dot/><per-minute>120</per-minute></metronome></direction-type></direction>" +
          note("C") +
          '<sound tempo="72"/>' +
          note("D"),
      ]),
    );
    expect(s.tempos).toEqual([
      { tick: 0, bpm: 90 },
      { tick: 480, bpm: 72 },
    ]);
  });
  it("maps backup/forward, parts, staff/voice and flags polyphony without silently losing notes", () => {
    const s = parseMusicXml(
      fixture(
        [
          note("C", 960) +
            `<backup><duration>960</duration></backup>` +
            note("E", 480, "", "2") +
            `<forward><duration>480</duration></forward>` +
            note("F", 480, "", "2"),
        ],
        "",
        `<part id="P2"><measure number="1"><attributes><divisions>480</divisions></attributes>${note("G")}</measure></part>`,
      ),
    );
    expect(s.parts).toHaveLength(2);
    const p = s.parts[0];
    expect(p.tracks.map((t) => t.id)).toEqual(["1:1", "1:2"]);
    expect(p.measures[0].events.map((e) => e.tick)).toEqual([0, 0, 960]);
    expect(
      buildSteps(s, p, p.tracks[1], [0, 0]).map((e) => e.pitch?.midi ?? "rest"),
    ).toEqual([64, "rest", 65, "rest"]);
    const chord = parseMusicXml(fixture([note() + note("E", 480, "<chord/>")]));
    expect(chord.parts[0].tracks[0].blocked.join()).toContain("和弦");
    expect(chord.parts[0].measures[0].events).toHaveLength(2);
  });
  it("retains rest and silence in inclusive reverse ranges 5–8", () => {
    const s = demoScore(),
      p = s.parts[0],
      range = rangeIndices(p, 7, 4);
    expect(range).toEqual([4, 7]);
    const steps = buildSteps(s, p, p.tracks[0], range);
    expect(steps[0].tick).toBe(4 * 1920);
    expect(steps.at(-1)?.end).toBe(8 * 1920);
    expect(rangeIndices(p, -20, 200)).toEqual([0, 7]);
    const r = parseMusicXml(fixture([rest() + note("C")]));
    expect(
      buildSteps(r, r.parts[0], r.parts[0].tracks[0], [0, 0]).map(
        (s) => s.pitch?.midi ?? null,
      ),
    ).toEqual([null, 60, null]);
  });
  it("joins cross-bar ties for sound, keeps note segments and attacks a range starting at tie stop", () => {
    const s = parseMusicXml(
      fixture([
        note("G", 1920, '<tie type="start"/>'),
        note("G", 960, '<tie type="stop"/>') + rest(960),
      ]),
    );
    const p = s.parts[0],
      t = p.tracks[0];
    const joined = buildSteps(s, p, t, [0, 1]);
    expect(joined).toHaveLength(2);
    expect(joined[0]).toMatchObject({ tick: 0, end: 2880 });
    expect(joined[0].noteIds).toHaveLength(2);
    expect(joined[0].segments[1].measure).toBe(1);
    expect(buildSteps(s, p, t, [1, 1])[0].pitch?.midi).toBe(67);
  });
  it("requires written-order acknowledgement for repeats and detects unsupported notation/transpose", () => {
    const s = parseMusicXml(
      fixture([note() + '<barline><repeat direction="backward"/></barline>']),
    );
    expect(s.needsWrittenOrder).toBe(true);
    expect(
      parseMusicXml(
        fixture([note()], "<transpose><chromatic>2</chromatic></transpose>"),
      ).parts[0].tracks[0].blocked.join(),
    ).toContain("移调");
    const grace = parseMusicXml(fixture([note("D", 480, "<grace/>") + note()]));
    expect(grace.parts[0].tracks[0].blocked.join()).toContain("倚音");
  });
  it("retains full selected part when rendering and isolates it from other parts", () => {
    const s = parseMusicXml(
      fixture(
        [note()],
        "",
        `<part id="P2"><measure number="1">${note("G")}</measure></part>`,
      ),
    );
    const doc = new DOMParser().parseFromString(
      partXml(s, "P2"),
      "application/xml",
    );
    expect(doc.querySelectorAll("part")).toHaveLength(1);
    expect(doc.querySelector("part")?.getAttribute("id")).toBe("P2");
  });
  it("spells fixed solfege and accidentals instead of reducing everything to pitch class", () => {
    expect(pitchLabel({ step: "D", alter: -1, octave: 5 })).toBe("D♭5");
    expect(pitchLabel({ step: "F", alter: 1, octave: 4 }, true)).toBe("Fa♯");
  });
  it.each([
    "<broken>",
    fixture(["<note><rest/></note>"]),
    "<score-timewise/>",
    '<!DOCTYPE x [<!ENTITY y "bad">]><score-partwise/>',
  ])("rejects malformed, empty or unsupported documents (%#)", (xml) => {
    expect(() => parseMusicXml(xml)).toThrow();
  });
  it("loads real compressed MXL via the declared container root", async () => {
    const data = zipSync({
      "META-INF/container.xml": strToU8(
        '<container><rootfiles><rootfile full-path="scores/main.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>',
      ),
      "scores/main.musicxml": strToU8(demoXml),
    });
    const s = await readScore({
      name: "sample.mxl",
      size: data.length,
      arrayBuffer: async () => data.buffer as ArrayBuffer,
    });
    expect(s.format).toBe("mxl");
    expect(s.parts[0].measures).toHaveLength(8);
  });
  it("rejects corrupt/missing-root, unsafe archive paths and oversized expanded XML", async () => {
    const asFile = (data: Uint8Array) => ({
      name: "bad.mxl",
      size: data.length,
      arrayBuffer: async () => data.buffer as ArrayBuffer,
    });
    await expect(
      readScore(asFile(new Uint8Array([80, 75, 1]))),
    ).rejects.toThrow("MXL");
    await expect(
      readScore(asFile(zipSync({ "test.xml": strToU8(demoXml) }))),
    ).rejects.toThrow("container");
    await expect(
      readScore(asFile(zipSync({ "../bad.xml": strToU8(demoXml) }))),
    ).rejects.toThrow("不安全路径");
    await expect(
      readScore(
        asFile(
          zipSync({ "huge.xml": strToU8(" ".repeat(8 * 1024 * 1024 + 1)) }),
        ),
      ),
    ).rejects.toThrow("过大");
  });
});

it('opens compressed full scores above the old 2 MB expanded limit',async()=>{
 const xml=demoXml.replace('<score-partwise','<!--'+' '.repeat(3*1024*1024)+'--><score-partwise');
 const bytes=zipSync({'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>'),'score.xml':strToU8(xml)});
 const score=await readScore({name:'full.mxl',size:bytes.length,arrayBuffer:async()=>bytes.buffer as ArrayBuffer});expect(score.parts[0].measures).toHaveLength(8);
});
it('render windows carry active attributes and retain original written measure numbers',()=>{
 const s=parseMusicXml(fixture(Array.from({length:12},()=>note('D'))));const doc=new DOMParser().parseFromString(partXml(s,'P1',[8,11]),'application/xml');
 expect(doc.querySelectorAll('measure')).toHaveLength(4);expect(doc.querySelector('measure')?.getAttribute('number')).toBe('9');expect(doc.querySelector('measure attributes divisions')?.textContent).toBe('480');expect(doc.querySelector('measure attributes key fifths')?.textContent).toBe('-2');
});
