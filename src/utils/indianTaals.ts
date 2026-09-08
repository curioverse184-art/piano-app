import { TimeSignature } from '../types/score';

export interface IndianTaalDefinition {
  id: string;
  name: string;
  beats: number;
  representation: string; // e.g., "| 1 2 3 4 5 6 |"
  vibhags: string; // e.g. "3 + 3"
  bolsExample: string;
  description: string;
  recommendedTimeSignature: TimeSignature;
}

export const INDIAN_TAALS: IndianTaalDefinition[] = [
  {
    id: 'None',
    name: 'None (Western Standard)',
    beats: 4,
    representation: 'Standard Western Meter',
    vibhags: 'N/A',
    bolsExample: '',
    description: 'Standard measure layout without classical Indian rhythmic cycle markings.',
    recommendedTimeSignature: { numerator: 4, denominator: 4 },
  },
  {
    id: 'Dadra',
    name: 'Dadra',
    beats: 6,
    representation: '| 1 2 3 4 5 6 |',
    vibhags: '3 + 3 (Dha Dhi Na | Dha Ti Na)',
    bolsExample: 'Dha  Dhi  Na  |  Dha  Ti  Na',
    description: 'Light classical 6-beat cycle commonly used in Ghazals, Bhajans, and folk melodies.',
    recommendedTimeSignature: { numerator: 6, denominator: 8 },
  },
  {
    id: 'Keharwa',
    name: 'Keharwa',
    beats: 8,
    representation: '| 1 2 3 4 | 5 6 7 8 |',
    vibhags: '4 + 4 (Dha Ge Na Ti | Na Ke Dhi Na)',
    bolsExample: 'Dha  Ge  Na  Ti  |  Na  Ke  Dhi  Na',
    description: 'Extremely popular 8-beat syncopated groove in Indian film music, semi-classical, and folk songs.',
    recommendedTimeSignature: { numerator: 4, denominator: 4 },
  },
  {
    id: 'Teentaal',
    name: 'Teentaal (Tintal)',
    beats: 16,
    representation: '| 1 2 3 4 | 5 6 7 8 | 9 10 11 12 | 13 14 15 16 |',
    vibhags: '4 + 4 + 4 + 4 (3 Talis + 1 Khali)',
    bolsExample: 'Dha Dhin Dhin Dha | Dha Dhin Dhin Dha | Dha Tin Tin Ta | Ta Dhin Dhin Dha',
    description: 'The king of North Indian classical taals: symmetrical 16 matras divided into four equal vibhags.',
    recommendedTimeSignature: { numerator: 4, denominator: 4 },
  },
  {
    id: 'Ektaal',
    name: 'Ektaal',
    beats: 12,
    representation: '| 1 2 | 3 4 | 5 6 | 7 8 | 9 10 | 11 12 |',
    vibhags: '2 + 2 + 2 + 2 + 2 + 2',
    bolsExample: 'Dhin  Dhin  |  DhaGe  TirKiTa  |  Tu  Na  |  Kat  Ta  |  DhaGe  TirKiTa  |  Dhi  Na',
    description: '12-beat rhythmic cycle frequently used in Khayal vocal recitals and instrumental vilambit/drut.',
    recommendedTimeSignature: { numerator: 12, denominator: 8 },
  },
  {
    id: 'Jhaptal',
    name: 'Jhaptal',
    beats: 10,
    representation: '| 1 2 | 3 4 5 | 6 7 | 8 9 10 |',
    vibhags: '2 + 3 + 2 + 3',
    bolsExample: 'Dhi  Na  |  Dhi  Dhi  Na  |  Ti  Na  |  Dhi  Dhi  Na',
    description: 'Asymmetric 10-beat cycle in classical compositions with lyrical cadence.',
    recommendedTimeSignature: { numerator: 5, denominator: 4 },
  },
  {
    id: 'Rupak',
    name: 'Rupak',
    beats: 7,
    representation: '| 1 2 3 | 4 5 | 6 7 |',
    vibhags: '3 + 2 + 2 (Begins on Khali)',
    bolsExample: 'Tin  Tin  Na  |  Dhi  Na  |  Dhi  Na',
    description: 'Unique 7-beat rhythm beginning on an unaccented Khali beat, popular in semiclassical songs.',
    recommendedTimeSignature: { numerator: 7, denominator: 8 },
  },
  {
    id: 'Deepchandi',
    name: 'Deepchandi',
    beats: 14,
    representation: '| 1 2 3 | 4 5 6 7 | 8 9 10 | 11 12 13 14 |',
    vibhags: '3 + 4 + 3 + 4',
    bolsExample: 'Dha  Dhin  –  |  Dha  Dha  Tin  –  |  Ta  Tin  –  |  Dha  Dha  Dhin  –',
    description: '14-beat graceful swing rhythm commonly used in Thumri, Dadra, and romantic expressions.',
    recommendedTimeSignature: { numerator: 7, denominator: 4 },
  },
];
