// Pictogrammen (lijntekeningen, 48×48). Kleur volgt de tekstkleur (currentColor).
// Bedoeld voor laaggeletterde kandidaten: elk stukje tekst krijgt een herkenbaar beeld.

const svg = (body, extra = '') =>
  `<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;

export const ICONS = {
  // Handscanner met scherm
  scanner: svg('<rect x="13" y="4" width="22" height="40" rx="5"/><rect x="18" y="9" width="12" height="11" rx="1.5"/><path d="M20 26h8M20 31h8M20 36h8"/>'),
  // Heftruck van opzij
  forklift: svg('<path d="M6 34V20h14l6 8v6"/><path d="M10 20v-8h8v8"/><path d="M32 8v28h10"/><circle cx="12" cy="37" r="4"/><circle cx="24" cy="37" r="4"/>'),
  // Pratend gezicht met boze wenkbrauwen en tekstballon
  angryTalk: svg('<circle cx="18" cy="26" r="13"/><path d="M11 20l5 2M25 20l-5 2"/><path d="M13 32c3-2 7-2 10 0"/><path d="M34 6h10v8h-4l-3 3v-3h-3z"/>'),
  // Schild met vinkje: dit is een oefening, het is veilig
  safe: svg('<path d="M24 4l16 6v12c0 10-7 18-16 22C15 40 8 32 8 22V10z"/><path d="M16 24l6 6 10-11"/>'),
  // Luidspreker
  speaker: svg('<path d="M6 18h8l10-8v28l-10-8H6z"/><path d="M31 17c3 2 3 12 0 14M36 12c6 5 6 19 0 24"/>'),
  play: svg('<path d="M16 10l22 14-22 14z" fill="currentColor"/>'),
  // Hand op het hart: sorry zeggen
  sorry: svg('<path d="M24 40S8 30 8 19a8 8 0 0 1 16-2 8 8 0 0 1 16 2c0 11-16 21-16 21z"/>'),
  // Klok met snelheidsstreepjes: haast / smoes
  hurry: svg('<circle cx="28" cy="24" r="14"/><path d="M28 16v8l6 4"/><path d="M4 18h8M2 24h8M4 30h8"/>'),
  // Schreeuwende mond met uitroeptekens
  shout: svg('<circle cx="20" cy="24" r="14"/><ellipse cx="20" cy="30" rx="5" ry="4"/><path d="M13 18l5 2M27 18l-5 2"/><path d="M40 12v12M40 30v1"/>'),
  faceCalm: svg('<circle cx="24" cy="24" r="18"/><path d="M17 20h.01M31 20h.01" stroke-width="4"/><path d="M16 29c4 4 12 4 16 0"/>'),
  faceTense: svg('<circle cx="24" cy="24" r="18"/><path d="M17 20h.01M31 20h.01" stroke-width="4"/><path d="M16 31h16"/>'),
  faceAngry: svg('<circle cx="24" cy="24" r="18"/><path d="M14 16l7 3M34 16l-7 3"/><path d="M17 23h.01M31 23h.01" stroke-width="4"/><path d="M16 33c4-4 12-4 16 0"/>'),
  // Oog: wat gebeurde er?
  eye: svg('<path d="M3 24s8-13 21-13 21 13 21 13-8 13-21 13S3 24 3 24z"/><circle cx="24" cy="24" r="6"/>'),
  // Lampje: waarom?
  bulb: svg('<path d="M17 30c-4-3-6-7-6-11a13 13 0 0 1 26 0c0 4-2 8-6 11v5H17z"/><path d="M18 40h12M20 44h8"/>'),
  // Tekstballon met vinkje: tip / zo kun je het zeggen
  tip: svg('<path d="M6 8h36v24H20l-8 8v-8H6z"/><path d="M16 20l5 5 10-10"/>'),
  // Vraagteken in ballon: denkvraag
  question: svg('<circle cx="24" cy="24" r="19"/><path d="M18 18a6 6 0 1 1 8 6c-2 1-2 2-2 5"/><path d="M24 35v.5" stroke-width="4"/>'),
  next: svg('<path d="M10 24h26M26 14l10 10-10 10"/>'),
  back: svg('<path d="M38 24H12M22 14L12 24l10 10"/>'),
  retry: svg('<path d="M8 24a16 16 0 1 0 5-11.6"/><path d="M8 8v8h8"/>'),
  check: svg('<path d="M10 25l9 9 19-20"/>'),
  // Koffiekop met stoom: pauze
  coffee: svg('<path d="M8 20h26v10a10 10 0 0 1-10 10h-6A10 10 0 0 1 8 30z"/><path d="M34 23h3a5 5 0 0 1 0 10h-4"/><path d="M15 6c-2 3 2 5 0 8M22 6c-2 3 2 5 0 8M29 6c-2 3 2 5 0 8"/>'),
  // Lachend gezicht met dichtgeknepen ogen: grap / meelachen
  laugh: svg('<circle cx="24" cy="24" r="18"/><path d="M14 19l4 2-4 2M34 19l-4 2 4 2"/><path d="M14 28h20a10 10 0 0 1-20 0z"/>'),
  // Drie hoofden die kijken: iedereen kijkt naar jou
  group: svg('<circle cx="24" cy="15" r="6"/><path d="M13 40a11 11 0 0 1 22 0"/><circle cx="9" cy="21" r="4.5"/><path d="M2 40a8 8 0 0 1 9-8"/><circle cx="39" cy="21" r="4.5"/><path d="M46 40a8 8 0 0 0-9-8"/>'),
  // Opgestoken hand: stop, grens aangeven
  hand: svg('<path d="M15 26V12a3 3 0 0 1 6 0v11V8a3 3 0 0 1 6 0v15V10a3 3 0 0 1 6 0v15-9a3 3 0 0 1 6 0v14c0 9-6 15-14 15h-1c-5 0-8-2-11-6l-6-8a3 3 0 0 1 5-4z"/>'),
  // Stelling met dozen
  rack: svg('<path d="M8 4v40M40 4v40M8 18h32M8 32h32"/><rect x="12" y="8" width="11" height="10"/><rect x="26" y="23" width="10" height="9"/><rect x="13" y="35" width="9" height="9"/>'),
  // Persoon op een ligger van een stelling (twee staanders, twee liggers): één hand schuin
  // naar de staander, de andere reikt omhoog naar een doos bovenin. De bovenste ligger loopt
  // achter hem langs (onderbroken).
  climb: svg('<path d="M5 3v41M43 3v41M5 17h5M23 17h20M5 31h38M2 44h44"/><rect x="30" y="7" width="10" height="10"/><circle cx="16" cy="6.5" r="3.5"/><path d="M16 11v10M16 21l-3.5 10M16 21l4 10M16 14l-10 7M16 13.5l7-1.5 6-4"/>'),
  // Twee handen die een doos aan de zijkanten vastpakken (duim boven, vingers over de doos)
  boxHands: svg('<rect x="13" y="6" width="22" height="22" rx="1"/><path d="M24 6v6"/><path d="M3 44l5-9V24a3 3 0 0 1 3-3h6M8 26h9M8 31h9"/><path d="M45 44l-5-9V24a3 3 0 0 0-3-3h-6M40 26h-9M40 31h-9"/>'),
  // Rolsteiger: treden, platform, leuning en wieltjes
  ladder: svg('<path d="M8 42L26 13h13v29M14 33h8M19 24h8"/><path d="M4 29L22 4h18v9"/><circle cx="9" cy="44" r="2"/><circle cx="38" cy="44" r="2"/>'),
  // Waarschuwingsdriehoek (gevaar)
  warn: svg('<path d="M24 5L44 41H4z"/><path d="M24 18v11"/><circle cx="24" cy="34.5" r="1.6" fill="currentColor"/>'),
  // Spreekballon met uitroepteken (iets stelligs zeggen)
  speechBang: svg('<path d="M8 7h32a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H22l-9 8v-8H8a4 4 0 0 1-4-4V11a4 4 0 0 1 4-4z"/><path d="M24 13v9"/><circle cx="24" cy="27" r="1.6" fill="currentColor"/>'),
  // Klembord (melden)
  report: svg('<rect x="10" y="7" width="28" height="37" rx="3"/><path d="M18 7V4h12v3"/><path d="M16 18h16M16 25h16M16 32h9"/>'),
};

// Pictogram per antwoord en per sfeer. De pictogrammen van de antwoorden beschrijven wát je
// zegt of doet (gevaar, haast, stop …), niet of het een goed antwoord is: geen hartje voor het
// 'goede' antwoord en geen boos gezicht voor het 'foute'.
export const CHOICE_ICON = { A: 'warn', B: 'hurry', C: 'hand' };
export const CANTEEN_CHOICE_ICON = { A: 'hand', B: 'laugh', C: 'speechBang' };
export const HENK_CHOICE_ICON = { A: 'ladder', B: 'boxHands', C: 'report' };
export const MOOD_ICON = { calm: 'faceCalm', tense: 'faceTense', escalated: 'faceAngry' };
