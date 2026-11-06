export const PPQ = 6720;
export type TrackType = 'numbered' | 'tab' | 'piano' | 'staff' | 'drums';
export interface Track {
  id: string; type: TrackType; name: string;
  mode: 'frets' | 'cross' | 'strum'; clef: 'treble' | 'bass';
  tuning: string[]; lyrics: boolean; showName: boolean;
}
export interface Pitch { step: string; octave: number; alter: number; explicit: boolean; degree?: number; octaveShift?: number; accidental?: number; }
export interface Duration { ticks: number; denominator: number; dots: number; tuplet?: [number, number]; }
export interface TabNote { string: number; fret: number | 'x'; }
export interface Event extends Duration {
  kind: 'note' | 'rest' | 'strum'; start: number; pitches: Pitch[];
  tab: TabNote[]; drums: string[]; direction?: 'down' | 'up' | 'mute';
  lyric?: string; tie?: boolean; tieEnd?: boolean; slur?: 'start' | 'stop';
  dynamic?: string; accent?: boolean; line: string;
}
export interface Voice { id: string; staff: 'main' | 'right' | 'left'; events: Event[]; }
export interface TrackBar { voices: Voice[]; }
export interface Chord { name: string; at: number; diagram?: (number | 'x')[]; baseFret?: number; }
export interface Tempo { bpm: number; unit: Duration; text?: string; }
export interface TempoChange { at: number; tempo: Tempo; visible: boolean; }
export interface Bar {
  index: number; meter: [number, number]; key: string; ticks: number;
  meterChanged: boolean; keyChanged: boolean; tempo?: Tempo; changes: TempoChange[];
  section?: string; expression?: string; breakBefore: boolean; pageBreak: boolean;
  repeatStart: boolean; repeatEnd: boolean; final: boolean;
  chords: Chord[]; tracks: Record<string, TrackBar>;
}
export interface LayoutOptions {
  width: number; height: number; margin: number; barsPerSystem: number;
  systemGap: number; lyricSize: number; noteSize: number;
  lyricFont: 'serif' | 'sans';
  showBarNumbers: boolean; showTrackNames: boolean; chordDiagrams: boolean;
  justifyLast: boolean; titleSize: number;
}
export interface Score {
  version: 1; title: string; subtitle: string; artist: string;
  composer: string; lyricist: string; arranger: string; key: string;
  meter: [number, number]; tempo: Tempo; capo: number; fingering?: string;
  note: string; tracks: Track[]; bars: Bar[]; layout: LayoutOptions;
  chordShapes: Record<string, (number | 'x')[]>;
}
export interface Diagnostic { code: string; message: string; path: string; }
export class ScoreError extends Error {
  constructor(public diagnostics: Diagnostic[]) { super(diagnostics.map(d => `${d.path}: ${d.message}`).join('\n')); this.name = 'ScoreError'; }
}
export const DEFAULT_LAYOUT: LayoutOptions = {
  width: 1240, height: 1754, margin: 42, barsPerSystem: 4,
  systemGap: 40, lyricSize: 27, noteSize: 32, lyricFont: 'serif',
  showBarNumbers: false, showTrackNames: false, chordDiagrams: true,
  justifyLast: true, titleSize: 42,
};
export const DRUMS: Record<string, { midi: number; step: string; octave: number; cross: boolean }> = {
  kick: { midi: 36, step: 'F', octave: 4, cross: false },
  snare: { midi: 38, step: 'C', octave: 5, cross: false },
  hat: { midi: 42, step: 'G', octave: 5, cross: true },
  openhat: { midi: 46, step: 'G', octave: 5, cross: true },
  pedal: { midi: 44, step: 'D', octave: 4, cross: true },
  crash: { midi: 49, step: 'A', octave: 5, cross: true },
  ride: { midi: 51, step: 'F', octave: 5, cross: true },
  tom1: { midi: 48, step: 'E', octave: 5, cross: false },
  tom2: { midi: 45, step: 'D', octave: 5, cross: false },
  floor: { midi: 41, step: 'A', octave: 4, cross: false },
};
export const CHORD_SHAPES: Record<string, (number | 'x')[]> = {
  C: ['x',3,2,0,1,0], Cm: ['x',3,5,5,4,3], C7: ['x',3,2,3,1,0], Cmaj7: ['x',3,2,0,0,0],
  D: ['x','x',0,2,3,2], Dm: ['x','x',0,2,3,1], D7: ['x','x',0,2,1,2], Dsus4: ['x','x',0,2,3,3],
  E: [0,2,2,1,0,0], Em: [0,2,2,0,0,0], E7: [0,2,0,1,0,0], Em7: [0,2,2,0,3,0],
  F: [1,3,3,2,1,1], Fmaj7: ['x','x',3,2,1,0], Fm: [1,3,3,1,1,1],
  G: [3,2,0,0,0,3], G7: [3,2,0,0,0,1], Gsus4: [3,3,0,0,1,3],
  A: ['x',0,2,2,2,0], Am: ['x',0,2,2,1,0], A7: ['x',0,2,0,2,0], Am7: ['x',0,2,0,1,0],
  B: ['x',2,4,4,4,2], Bm: ['x',2,4,4,3,2], B7: ['x',2,1,2,0,2], Bm7: ['x',2,4,2,3,2],
  'F#': [2,4,4,3,2,2], 'F#m': [2,4,4,2,2,2], Bb: ['x',1,3,3,3,1], 'C/G': [3,3,2,0,1,0], 'D/F#': [2,'x',0,2,3,2],
};
