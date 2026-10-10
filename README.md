# Immersieve oefeningen voor werknemersvaardigheden

3D-simulaties in de browser voor kandidaten die werknemersvaardigheden leren. Er zijn
twee oefeningen, die zich afspelen in hetzelfde distributiecentrum:

- **Bijna geraakt** (`index.html`): de speler is orderpicker, neemt een kortere weg door de
  heftruckzone en wordt bijna geraakt. Collega Marco stapt van zijn heftruck en reageert
  boos. Vaardigheid: reageren op kritiek en boosheid.
- **Grap in de kantine** (`kantine.html`): in de lunchpauze maakt collega Dennis een grap over
  de uitspraak van Tomasz en zoekt hij bijval bij de speler. Vaardigheid: een grens aangeven
  bij een kwetsende grap of groepsdruk, zonder ruzie. Zie [Grap in de kantine](#grap-in-de-kantine).

Op beide startschermen staat een link naar de andere oefening. In beide kiest de speler uit
drie reacties en ziet hij wat er daarna gebeurt.

- **Stijl:** realistische mensen (motion capture, gezichtsuitdrukkingen) in een licht
  gestileerde hal. Het lijkt echt genoeg om je erin te verplaatsen, maar het blijft
  zichtbaar een oefening (badge "Oefening", tijd staat stil bij de keuze).
- **Stemmen:** Nederlandse AI-stemmen (ElevenLabs), ruimtelijk geluid met galm van de hal,
  lipsync op basis van het stemvolume.
- **Taal:** Nederlands altijd in beeld, met optionele vertaling eronder
  (Engels, Arabisch, Pools, Turks, Oekraïens).
- **Voor laaggeletterden:** korte zinnen (niveau A2), bij elke stap een pictogram,
  ondertitels met één zin tegelijk, en elk antwoord kun je eerst beluisteren
  (knop *Luister*). Na de keuze hoor je jezelf het antwoord hardop zeggen.
- **Apparaten:** laptop/pc, tablet/telefoon (slepen om rond te kijken), digibord
  (grote knoppen, toetsen 1-2-3) en VR-bril via WebXR.

## Het scenario van Bijna geraakt

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
Nabespreking ── 4 kaartjes, één tegelijk: wat gebeurt er (oog), waarom (lampje),
                 tip + "zo kun je het zeggen" (ballon), denkvraag (vraagteken). Geen punten.
                 → "Kies een ander antwoord" of "Opnieuw beginnen"
```

Er is bewust geen goed/fout-score. Na het zien van alle drie de reacties
stelt de oefening voor om ze in de groep te bespreken.

## Openen

De pagina moet via een webserver worden geopend (niet als los bestand), omdat
de browser anders de geluidsbestanden en modules blokkeert.

```bash
npx serve .          # of: python3 -m http.server 8000
```

Open daarna `http://localhost:3000` (of `:8000`). De kantine-oefening staat op
`http://localhost:3000/kantine.html`.

### In VR (bijvoorbeeld Meta Quest)

1. Zet de map online op een https-adres, bijvoorbeeld met **GitHub Pages**
   (Settings → Pages → Deploy from branch).
2. Open dat adres in de browser van de VR-bril.
3. Kies **Bekijk in VR**.
4. Kiezen doe je door 2 seconden naar een keuze te kijken, of door te wijzen met de
   controller en de trekker in te drukken.

In *Grap in de kantine* zit je aan tafel: bij het starten in VR wordt je hoofd op zithoogte gezet,
of je nu staat of zit.

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

## Grap in de kantine

```
Intro ── lunchpauze in de kantine: geroezemoes, bestek, koffieautomaat. De speler zit aan
   │     tafel met Dennis en Marco. Tomasz komt met zijn dienblad: "Is hier nog plek?"
   │     Dennis: "Maar eerst even zeggen: een ui in mijn huis." Tomasz probeert het,
   │     Dennis lacht hard en doet hem na, Marco grinnikt mee. "Toch? Zeg nou zelf!"
   ▼
Keuze (tijd staat stil, alle drie kijken naar de speler)
   ├─ A "Nee. Ik vind dat niet grappig. Laat hem gewoon."  → Marco valt bij, Dennis zegt sorry,
   │                                                        Tomasz komt erbij zitten
   ├─ B "Haha… ja."                                        → Dennis lacht harder, Tomasz gaat
   │                                                        alleen aan een andere tafel zitten
   └─ C "Hou je kop, man. Jij bent zelf een grap!"         → Dennis staat op, ruzie, de kantine
                                                            kijkt om, Tomasz loopt weg
   ▼
Nabespreking ── dezelfde 4 kaartjes als in Bijna geraakt. Geen punten.
```

- **Personages:** Dennis (oranje hesje), Tomasz (blauwe overall) en Marco uit Bijna geraakt.
  Op de achtergrond zitten collega's aan andere tafels en haalt teamleider Sandra koffie;
  in de ruzie kijken ze allemaal om.
- **Zitten aan tafel:** motion capture van mensen die aan een tafel zitten (onderarmen op het
  blad), op stoelen en een tafel met de maten uit die opnames (zitting 46 cm, blad 75 cm).
  Gaan zitten gaat zoals in het echt: dienblad neerzetten, stoel naar achteren trekken, voor
  de stoel gaan staan, gaan zitten en de stoel aanschuiven. Bij opstaan schuift de stoel weg.
- **Lachen:** in de stukken van de opname waarin gelachen wordt, schokken borst en schouders
  mee op het volume van de lach (elke "ha" een stoot), gaat het hoofd iets achterover en
  lacht het gezicht (ogen samengeknepen). Net als boosheid getemperd met `EXPRESSION`.
- **Geluid:** kortere, drogere galm dan in de hal, geroezemoes van andere tafels, bestek,
  de koffieautomaat, schuivende stoelen.
- **Voor de docent:** waarom lachen mensen mee? Wat kost het om iets te zeggen? Wat is het
  verschil tussen "die grap vind ik niet oké" en "jij bent een grap"? Hoe vaak overkomt
  Tomasz dit, en wat kan hij of een collega daarmee bij de leidinggevende?

## Aanpassen

| Wat | Waar |
| --- | --- |
| Teksten, vertalingen en nabespreking (Bijna geraakt) | `js/i18n.js` |
| Teksten, vertalingen en nabespreking (Grap in de kantine) | `js/i18n-kantine.js` |
| Pictogrammen | `js/icons.js` |
| Hoe sterk gezicht en gebaren zijn (0 = neutraal, 1 = vol) | `EXPRESSION` in `js/human.js` |
| Volgorde, timing en gebaren per zin | `js/main.js` en `js/kantine.js` (`runIntro`, `branchA/B/C`) |
| Gedeeld raamwerk: camera, ondertitels, keuze, nabespreking, talen, VR | `js/sim.js` |
| Magazijn (stellingen, borden, vloermarkering) | `js/world.js` |
| Kantine (tafels, stoelen, toonbank, ramen, licht) | `js/canteen.js` |
| Personages (animaties, kijken, wijzen, zitten, lachen, gezicht, lipsync) | `js/human.js` |
| 3D-modellen, texturen en gebakken animaties | `models/` |
| Heftruck | `js/forklift.js` |
| Geluidseffecten, ruimtelijk geluid en galm | `js/audio.js` |
| Stemopnames | `audio/*.mp3` en `audio/kantine/*.mp3` |

Een nieuwe zin toevoegen (voor de kantine: `kantine` in de bestandsnamen en commando's):

1. Zet de tekst in `LINES` in `js/i18n.js` (of `js/i18n-kantine.js`) en geef de zin een emotie
   in `LINE_EMO` in `js/main.js` (of `js/kantine.js`).
2. Maak een mp3 met dezelfde naam in `audio/` (of `audio/kantine/`), bijvoorbeeld via ElevenLabs.
3. Laat de mp3 transcriberen met woordtijden (ElevenLabs Scribe) en zet de woorden met
   begin- en eindtijd in `tools/words.json` (of `tools/words_kantine.json`).
4. Meet de luidheid met `node tools/envelope.mjs` (met een webserver op poort 8123) en draai
   daarna `python3 tools/lipsync.py`. Dat maakt `models/lipsync.json` opnieuw. Voor de kantine:
   `node tools/envelope.mjs kantine` en `python3 tools/lipsync.py kantine`
   (→ `tools/envelope_kantine.json` en `models/lipsync_kantine.json`).
5. Roep `say(id, 'naam', cues)` aan in het scenario. Leg gebaren in `cues` op de tijden van de
   woorden uit stap 3. Lacht iemand in de opname, zet dan de tijden van de lach in `laugh`
   in `LINE_EMO`.

Zonder lipsync-tijdlijn werkt een zin ook: dan beweegt de mond alleen op het volume.

## Bekende beperkingen van dit proof of concept

- De vertalingen zijn niet door moedertaalsprekers gecontroleerd. Laat ze nakijken
  voordat je ze met kandidaten gebruikt.
- In het Pools, Oekraïens en Arabisch spreekt Marco de speler aan in de mannelijke vorm.
- Geluid start pas na een klik (regel van de browser).
- De personages komen uit een bestaande bibliotheek. Voor een eigen huisstijl
  (bedrijfskleding, logo op het hesje) moeten de texturen in `models/tex/` worden aangepast.
- In de kantine blijven de woorden van de grap ("een ui in mijn huis") in elke vertaling
  Nederlands; anders is niet te volgen waar de grap over gaat.
- De lipsync volgt de woorden klank voor klank, maar de omzetting van spelling naar
  mondstand werkt met vuistregels voor het Nederlands. Bij leenwoorden ("scanner")
  is dat soms een benadering.

## Techniek

Three.js 0.160 (via jsDelivr), Web Audio API (HRTF-panning, convolutiegalm,
analyser voor lipsync), WebXR. Geen buildstap: gewone ES-modules.

De personages (Marco, Sandra, Dennis, Tomasz en de collega's op de achtergrond) en hun animaties komen uit
[Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) (MIT-licentie, zie
`models/LICENSE-Rocketbox.md`).

### Lipsync en gezicht

```
mp3 ─► ElevenLabs Scribe (woorden + tijden) ─► tools/lipsync.py ─► models/lipsync.json
         Nederlandse klankregels: ch/g, sch, ij/ei, ui, oe, eu, ie, aa/ee/oo, ng/nk, p/b/m …
```

De stem van de speler (`audio/pA.mp3` t/m `pC.mp3`) klinkt dichtbij en zonder galm, als je eigen stem.

Elke klinker wordt op de luidste plek van zijn lettergreep gelegd (gemeten luidheid per 10 ms,
`tools/envelope.json`). Tijdens het afspelen (`js/human.js`) lopen de lippen ~50 ms voor op het
geluid, en sluiten ze bij stiltes binnen een zin. Mondstanden
overlappen zacht (co-articulatie), en de kaak volgt klinker en volume. Bij schreeuwen worden
de tanden ontbloot en gaat de kaak verder open. Op benadrukte woorden (HÉ, DÁÁR, ALTIJD, JIJ)
reageren wenkbrauwen, hoofd en romp, en volgen prik- of hakgebaren. Verder ademt het personage
in vóór een zin en in pauzes, hijgt het na na het schreeuwen, en maken de ogen kleine sprongetjes
en kijken ze af en toe even weg.

### Emotie en reacties

Bij het bijna-ongeluk schrikt Marco eerst (grote ogen, wenkbrauwen omhoog, mond open) voordat de
boosheid komt. Terwijl de speler antwoordt reageert hij al non-verbaal: ontspannen en uitademen (A),
ogen rollen en smalend grijnzen (B), of even terugdeinzen en daarna bozer worden (C). De speler
deinst zelf terug bij het remmen en zet een stap achteruit als Marco te dichtbij komt.

### In- en uitstappen

Uitstappen: contact uit, zijwaarts draaien, opstaan (motion capture) met de hand aan de stijl,
via de treeplank naar de grond (driepuntscontact). Instappen gaat omgekeerd, met de
motion capture "gaan zitten".

De animaties zijn gebakken naar een compact binair formaat
(`models/anim_*.bin`, 24 fps, 16-bit rotaties); `js/human.js` leest dat in. `anim_m` en `anim_f`
zijn de basisset, `anim_k` bevat de kantine-animaties (aan tafel zitten, gaan zitten op een stoel,
opstaan, verdrietig of zenuwachtig luisteren). Bij gaan zitten en opstaan is de verplaatsing van
het lichaam bewaard (wortelbeweging), zodat iemand echt op de stoel terechtkomt. Kijken, wijzen,
knikken, knipperen, boosheid (ARKit/FACS-blendshapes) en lipsync (visemen) worden
in realtime bovenop de animaties berekend. De stemmen zijn gemaakt met ElevenLabs.
