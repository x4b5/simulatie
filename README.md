# Bijna geraakt: proof of concept van een immersieve oefening

Een 3D-simulatie in de browser voor kandidaten die werknemersvaardigheden leren.
De speler is orderpicker in een distributiecentrum, neemt een kortere weg door de
heftruckzone en wordt bijna geraakt. Collega Marco stapt van zijn heftruck en reageert
boos. De speler kiest uit drie reacties en ziet wat er daarna gebeurt.

- **Stijl:** realistische mensen (motion capture, gezichtsuitdrukkingen) in een licht
  gestileerde hal. Het lijkt echt genoeg om je erin te verplaatsen, maar het blijft
  zichtbaar een oefening (badge "Oefening", tijd staat stil bij de keuze).
- **Stemmen:** Nederlandse AI-stemmen (ElevenLabs), ruimtelijk geluid met galm van de hal,
  lipsync op basis van het stemvolume.
- **Taal:** Nederlands altijd in beeld, met optionele vertaling eronder
  (Engels, Arabisch, Pools, Turks, Oekraïens).
- **Apparaten:** laptop/pc, tablet/telefoon (slepen om rond te kijken), digibord
  (grote knoppen, toetsen 1-2-3) en VR-bril via WebXR.

## Het scenario

```
Intro ── speler loopt over het groene pad, kijkt op de scanner (haast: dock 3)
   │     en steekt door de opening in het hek de rijbaan over
   ▼
Bijna-ongeluk ── heftruck komt uit de dwarsgang, claxon, remmen, hartslag
   ▼
Confrontatie ── Marco stapt uit en is boos (3 zinnen, wijst naar het voetpad)
   ▼
Keuze (tijd staat stil)
   ├─ A "Je hebt gelijk. Dat was gevaarlijk. Sorry."       → Marco kalmeert
   ├─ B "Ik moest even snel naar dock 3. Ik keek heus wel uit." → blijft geïrriteerd
   └─ C "Doe normaal, man. Schreeuw niet zo tegen me!"     → escaleert, teamleider Sandra grijpt in
   ▼
Nabespreking ── wat gebeurde er, waarom, tip, denkvraag (geen punten)
                 → "Probeer een andere reactie" of "Opnieuw vanaf het begin"
```

Er is bewust geen goed/fout-score. Na het zien van alle drie de reacties
stelt de oefening voor om ze in de groep te bespreken.

## Openen

De pagina moet via een webserver worden geopend (niet als los bestand), omdat
de browser anders de geluidsbestanden en modules blokkeert.

```bash
npx serve .          # of: python3 -m http.server 8000
```

Open daarna `http://localhost:3000` (of `:8000`).

### In VR (bijvoorbeeld Meta Quest)

1. Zet de map online op een https-adres, bijvoorbeeld met **GitHub Pages**
   (Settings → Pages → Deploy from branch).
2. Open dat adres in de browser van de VR-bril.
3. Kies **Bekijk in VR**.
4. Kiezen doe je door 2 seconden naar een keuze te kijken, of door te wijzen met de
   controller en de trekker in te drukken.

De VR-modus gebruikt de standaard WebXR-API en is nog niet op een echte bril getest.

## Voor de docent

Mogelijke vragen voor het nagesprek:

- Waarom was Marco eigenlijk boos? Was hij boos óp jou, of geschrokken?
- Wat merkte je bij jezelf toen hij tegen je schreeuwde?
- Bij welke reactie werd het gesprek rustiger? Waardoor?
- Je mag een grens aangeven als iemand schreeuwt. Hoe doe je dat zonder ruzie?
- Wat doe jij als je haast hebt en de veilige route langer is?

Tip voor in de klas: speel het op het digibord en laat de groep eerst stemmen
(A, B of C) voordat je klikt. Speel daarna de andere reacties ook af.

## Aanpassen

| Wat | Waar |
| --- | --- |
| Alle teksten, vertalingen en de nabespreking | `js/i18n.js` |
| Volgorde, timing en gebaren per zin | `js/main.js` (functies `runIntro`, `branchA/B/C`) |
| Magazijn (stellingen, borden, vloermarkering) | `js/world.js` |
| Personages (animaties, kijken, wijzen, gezicht, lipsync) | `js/human.js` |
| 3D-modellen, texturen en gebakken animaties | `models/` |
| Heftruck | `js/forklift.js` |
| Geluidseffecten en ruimtelijk geluid | `js/audio.js` |
| Stemopnames | `audio/*.mp3` |

Een nieuwe zin toevoegen:

1. Zet de tekst in `LINES` in `js/i18n.js` en geef de zin een emotie in `LINE_EMO` in `js/main.js`.
2. Maak een mp3 met dezelfde naam in `audio/` (bijvoorbeeld via ElevenLabs).
3. Laat de mp3 transcriberen met woordtijden (ElevenLabs Scribe) en zet de woorden met
   begin- en eindtijd in `tools/words.json`.
4. Meet de luidheid met `node tools/envelope.mjs` (met een webserver op poort 8123) en draai
   daarna `python3 tools/lipsync.py`. Dat maakt `models/lipsync.json` opnieuw.
5. Roep `say(id, 'naam', cues)` aan in `js/main.js`. Leg gebaren in `cues` op de tijden van de
   woorden uit stap 3.

Zonder lipsync-tijdlijn werkt een zin ook: dan beweegt de mond alleen op het volume.

## Bekende beperkingen van dit proof of concept

- De vertalingen zijn niet door moedertaalsprekers gecontroleerd. Laat ze nakijken
  voordat je ze met kandidaten gebruikt.
- In het Pools, Oekraïens en Arabisch spreekt Marco de speler aan in de mannelijke vorm.
- Geluid start pas na een klik (regel van de browser).
- De personages komen uit een bestaande bibliotheek. Voor een eigen huisstijl
  (bedrijfskleding, logo op het hesje) moeten de texturen in `models/tex/` worden aangepast.
- De lipsync volgt de woorden klank voor klank, maar de omzetting van spelling naar
  mondstand werkt met vuistregels voor het Nederlands. Bij leenwoorden ("scanner")
  is dat soms een benadering.

## Techniek

Three.js 0.160 (via jsDelivr), Web Audio API (HRTF-panning, convolutiegalm,
analyser voor lipsync), WebXR. Geen buildstap: gewone ES-modules.

De personages (Marco, Sandra en de collega op de achtergrond) en hun animaties komen uit
[Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) (MIT-licentie, zie
`models/LICENSE-Rocketbox.md`). ### Lipsync en gezicht

```
mp3 ─► ElevenLabs Scribe (woorden + tijden) ─► tools/lipsync.py ─► models/lipsync.json
         Nederlandse klankregels: ch/g, sch, ij/ei, ui, oe, eu, ie, aa/ee/oo, ng/nk, p/b/m …
```

Elke klinker wordt op de luidste plek van zijn lettergreep gelegd (gemeten luidheid per 10 ms,
`tools/envelope.json`). Tijdens het afspelen (`js/human.js`) lopen de lippen ~50 ms voor op het
geluid, en sluiten ze bij stiltes binnen een zin. Mondstanden
overlappen zacht (co-articulatie), en de kaak volgt klinker en volume. Bij schreeuwen worden
de tanden ontbloot en gaat de kaak verder open. Op benadrukte woorden (HÉ, DÁÁR, ALTIJD, JIJ)
reageren wenkbrauwen, hoofd en romp, en volgen prik- of hakgebaren. Verder ademt het personage
in vóór een zin en in pauzes, hijgt het na na het schreeuwen, en maken de ogen kleine sprongetjes
en kijken ze af en toe even weg.

### In- en uitstappen

Uitstappen: contact uit, zijwaarts draaien, opstaan (motion capture) met de hand aan de stijl,
via de treeplank naar de grond (driepuntscontact). Instappen gaat omgekeerd, met de
motion capture "gaan zitten".

De animaties zijn gebakken naar een compact binair formaat
(`models/anim_*.bin`, 24 fps, 16-bit rotaties); `js/human.js` leest dat in. Kijken, wijzen,
knikken, knipperen, boosheid (ARKit/FACS-blendshapes) en lipsync (visemen) worden
in realtime bovenop de animaties berekend. De stemmen zijn gemaakt met ElevenLabs.
