# Immersieve oefeningen voor werknemersvaardigheden

3D-simulaties in de browser voor kandidaten die werknemersvaardigheden leren. Er zijn
drie oefeningen, die zich afspelen in hetzelfde distributiecentrum:

- **Bijna geraakt** (`index.html`): de speler is orderpicker, neemt een kortere weg door de
  heftruckzone en wordt bijna geraakt. Collega Marco stapt van zijn heftruck en reageert
  boos. Vaardigheid: reageren op kritiek en boosheid.
- **Grap in de kantine** (`kantine.html`): in de lunchpauze maakt collega Dennis een grap over
  de uitspraak van Tomasz en zoekt hij bijval bij de speler. Vaardigheid: een grens aangeven
  bij een kwetsende grap of groepsdruk, zonder ruzie. Zie [Grap in de kantine](#grap-in-de-kantine).
- **Hoog en droog** (`henk.html`): collega Henk (60, al 25 jaar in dienst) staat zonder trap in
  de stelling en vraagt de speler een doos aan te pakken. Vaardigheid: een (oudere, ervaren)
  collega aanspreken op onveilig gedrag. De spiegel van Bijna geraakt: hier spreek jij aan.
  Zie [Hoog en droog](#hoog-en-droog).

Op elk startscherm staan rechtsboven links naar de twee andere oefeningen. In alle drie kiest
de speler uit drie reacties en ziet hij wat er daarna gebeurt. Kiest hij de rustige reactie (A),
dan geeft de ander niet meteen toe: hij stribbelt tegen en er volgt een **tweede keuze**
(*Volhouden*, zie [Volhouden: de tweede keuze](#volhouden-de-tweede-keuze)). Zo oefen je ook:
rustig blijven en je punt herhalen als de ander niet meteen luistert.

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
- **Voorlezen:** op het startscherm, bij de keuzevraag en op elk kaartje van de nabespreking staat
  een knop *Luister*. Die leest de tekst voor met de spraak van de browser (Web Speech API): eerst
  het Nederlands, daarna de vertaling als de browser een stem voor die taal heeft. Wie één kaartje
  laat voorlezen, krijgt de volgende kaartjes vanzelf voorgelezen; stop je het voorlezen zelf (of
  begin je opnieuw), dan houdt dat op. Heeft de browser geen Nederlandse stem maar wel een stem voor
  de vertaaltaal, dan wordt alleen de vertaling voorgelezen; zonder enige stem zijn de knoppen er niet.
- **Even luid:** de stemopnames worden bij het afspelen gelijkgetrokken (`gain.json` per map, gemaakt
  met `python3 tools/loudness.py`): de drie antwoorden van de speler klinken precies even luid (bij
  de tweede keuze ook: `pA2`/`pB2`/`pC2`), zodat
  het volume niet verraadt welk antwoord 'goed' is; schreeuwen blijft luider dan fluisteren, maar
  hooguit ~6 LU in plaats van 15-18 LU. Draai het script opnieuw na een nieuwe opname.
- **Pictogrammen bij de antwoorden** beschrijven wát je zegt (gevaar, haast, stop …), niet of het
  goed is: geen hartje bij het 'goede' en geen boos gezicht bij het 'foute' antwoord.
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
   ├─ A "Je hebt gelijk. Dat was gevaarlijk. Sorry."
   │     → Marco is nog niet klaar: "Sorry? Daar heb ik niks aan als je straks onder mijn vork
   │       ligt!" (wijst naar de vorken, armen over elkaar)
   │     ▼
   │   Keuze 2 "Wat zeg jij nu?"
   │     ├─ A2 "Je hebt gelijk. Ik loop vanaf nu over het pad." → "Hm. Dat zeg je nu." Hij koelt af,
   │     │      zegt ook sorry en legt het pad uit (het oude einde van A)          → Rustig
   │     ├─ B2 "Ja ja, ik zei toch sorry."   → "Ja ja? Dit is geen grap, man." Hij stapt geërgerd
   │     │      in en rijdt weg                                                    → Gespannen
   │     └─ C2 "Wat wil je nou nog meer van me?" → Marco ontploft, gaat Sandra halen; Sandra komt
   │            al aanlopen en neemt jullie mee naar kantoor                       → Ruzie
   ├─ B "Ik moest even snel naar dock 3. Ik keek heus wel uit." → blijft geïrriteerd
   └─ C "Doe normaal, man. Schreeuw niet zo tegen me!"     → escaleert, teamleider Sandra grijpt in
   ▼
Nabespreking ── 4 kaartjes, één tegelijk: wat gebeurt er (oog), waarom (lampje),
                 tip + "zo kun je het zeggen" (ballon), denkvraag (vraagteken). Geen punten.
                 → "Kies een ander antwoord" of "Opnieuw beginnen"
                   (na keuze 2 ook "Terug naar de eerste keuze")
```

Bij het keuzemoment richt de blik zich zo dat het gezicht (in de kantine: Tomasz, Dennis en
Marco) boven het keuzepaneel in beeld blijft; op een staand scherm wordt de beeldhoek tijdelijk
groter. Bij *Kies een ander antwoord*, *Opnieuw* en *Naar de keuze* gaat het beeld kort naar zwart
(ook in VR) met de melding dat je terug bent bij het moment van de keuze. In VR beweegt het
beeld niet bij terugdeinzen en krijgt gedwongen lopen een tunnelvignet.

Er is bewust geen goed/fout-score. Na het zien van alle drie de reacties
stelt de oefening voor om ze in de groep te bespreken.

## Volhouden: de tweede keuze

Opdrachtgever: "de andere persoon reageert te makkelijk op het juiste antwoord; in de praktijk is
dat niet zo." Daarom stribbelt de ander na antwoord A eerst tegen (één nieuwe zin, `x1`), en kiest de
speler nog een keer: blijf je rustig en zeg je het nog eens (A2), geef je op (B2), of word je alsnog
boos (C2)? B en C van de eerste keuze zijn ongewijzigd.

- **Zelfde scherm als keuze 1:** titel *Wat zeg jij nu?*, weer A, B en C met pictogram, *Luister* per
  antwoord, voorlezen van de vraag, toetsen 1-2-3, en in VR hetzelfde keuzepaneel. De tijd staat
  weer stil. De pictogrammen beschrijven wat je zegt (voetstappen = over het pad lopen, ballon met
  puntjes = 'ja ja' / 'laat maar', ballon met vraagteken, klembord = melden), niet of het goed is.
  Boven de antwoorden staat wat de ander net zei (`x1`), met een luidsprekerknop: dan zegt hij het
  nog een keer (met lipsync). Zo weet je ook na *Kies een ander antwoord* waar je op antwoordt. In de
  kantine staat Dennis bij keuze 2 voorop in beeld (op een telefoon valt Marco eerst af).
- **Vijf afloopkaarten per oefening:** B en C (zoals altijd), en na A: A2 (*Rustig*), B2
  (*Gespannen*) en C2 (*Ruzie*). De oude nabespreking van A is A2 geworden: die benoemt dat de ander
  eerst niet wilde luisteren en dat rustig herhalen hielp. Tip bij A2: "Blijf rustig. Zeg het nog
  een keer. Gebruik dezelfde woorden." Bij B2 en C2 staat de zin van A2 als "zo kun je het zeggen".
- **Al gezien:** op het tweede keuzescherm per antwoord. Op het eerste keuzescherm staat bij A pas
  *Al gezien* als je alle drie de vervolgen van A hebt gezien (er valt achter A nog iets te
  ontdekken). *Je hebt alles gezien* verschijnt na alle vijf de afloopkaarten.
- **Terug:** na een afloop van keuze 2 gaat *Kies een ander antwoord* terug naar keuze 2 (Marco,
  Dennis of Henk staat er weer net zo bij). Een tweede knop, *Terug naar de eerste keuze*
  (pictogram ⏮), gaat naar keuze 1. *Opnieuw beginnen* blijft de hele oefening opnieuw.
- **Regie:** de ander reageert al tijdens jouw zin (Marco schudt zijn hoofd en trekt zijn
  wenkbrauwen op bij "Sorry", Dennis verliest zijn grijns, Henk kijkt verrast en dan naar de
  rolsteiger), en er zitten echte pauzes in waar iemand afkoelt (Marco: "Hm. Dat zeg je nu." – stilte
  – armen los, zucht – dan pas zijn sorry).
- **Techniek (`js/sim.js`):** `branch(id, key)` van een scenario geeft `'choice2'` terug als er een
  tweede keuze volgt; `reset('choice2')` zet de stand van het tweede keuzemoment terug (voor
  *Kies een ander antwoord*), en `onChoice(stage)` krijgt mee welke keuze het is. De sleutels van de
  tweede keuze zijn `A2`, `B2`, `C2` in `CHOICES`, `OUTCOMES`, `choiceIcon` en de stemopnames
  (`pA2.mp3` …). Een oefening zonder `CHOICES.A2` werkt zoals vroeger (één keuze).

## Openen

De pagina moet via een webserver worden geopend (niet als los bestand), omdat
de browser anders de geluidsbestanden en modules blokkeert.

```bash
npx serve .          # of: python3 -m http.server 8000
```

Open daarna `http://localhost:3000` (of `:8000`). De kantine-oefening staat op
`http://localhost:3000/kantine.html`, Hoog en droog op `http://localhost:3000/henk.html`.

### In VR (bijvoorbeeld Meta Quest)

1. Zet de map online op een https-adres, bijvoorbeeld met **GitHub Pages**
   (Settings → Pages → Deploy from branch).
2. Open dat adres in de browser van de VR-bril.
3. Kies **Bekijk in VR**.
4. Kiezen doe je door 2 seconden naar een keuze te kijken, of door te wijzen met de
   controller en de trekker in te drukken.

In *Grap in de kantine* zit je aan tafel: bij het starten in VR wordt je hoofd op zithoogte gezet,
of je nu staat of zit.
In *Hoog en droog* sta je, net als in Bijna geraakt; als je in A de rolsteiger duwt, rijdt die met
je mee.

De VR-modus gebruikt de standaard WebXR-API en is nog niet op een echte bril getest.

## Voor de docent

Mogelijke vragen voor het nagesprek:

- Waarom was Marco eigenlijk boos? Was hij boos óp jou, of geschrokken?
- Wat merkte je bij jezelf toen hij tegen je schreeuwde?
- Bij welke reactie werd het gesprek rustiger? Waardoor?
- Marco luisterde niet meteen naar je sorry. Hoe voelde dat? Wat helpt dan: opgeven, boos worden,
  of het rustig nog een keer zeggen?
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
   ├─ A "Nee. Ik vind dat niet grappig. Laat hem gewoon."
   │     → Dennis: "Pff. Het is maar een grapje, joh." en "Doe niet zo gevoelig, man. Tomasz kan
   │       heus wel tegen een grapje. Toch, Tomasz?" (Tomasz glimlacht geforceerd en kijkt weg)
   │     ▼
   │   Keuze 2 "Wat zeg jij nu?"
   │     ├─ A2 "Voor Tomasz is het geen grapje. Kap er gewoon mee." → Marco valt bij, Dennis zegt
   │     │      mopperend sorry, Tomasz komt erbij zitten                          → Rustig
   │     ├─ B2 "Nou ja… laat maar." → "Zie je wel. Niks aan de hand." Tomasz gaat alleen aan een
   │     │      andere tafel zitten, Marco: "Dat was niet zo leuk voor hem, hè?"   → Gespannen
   │     └─ C2 "Jij bent echt een sukkel, weet je dat?" → Dennis staat op, ruzie, Tomasz loopt weg
   │                                                                               → Ruzie
   ├─ B "Haha… ja."                                        → Dennis lacht harder, Tomasz gaat
   │                                                        alleen aan een andere tafel zitten
   └─ C "Hou je kop, man. Jij bent zelf een grap!"         → Dennis staat op, ruzie, de kantine
                                                            kijkt om, Tomasz loopt weg
   ▼
Nabespreking ── dezelfde 4 kaartjes als in Bijna geraakt, plus een vijfde vóór de denkvraag:
                 "En als het over jou gaat?" (als jij zelf Tomasz bent). Geen punten.
```

- **Personages:** Dennis, Tomasz en Marco uit Bijna geraakt. Het is lunchpauze: niemand draagt
  een hesje, handschoenen, portofoon of gereedschapsgordel. Daarvoor zijn er kantineversies van de
  lichaamstexturen (`models/tex/m108k_*`, `m107k_*`, `f101k_*`: overall in plaats van hesje, blote
  handen in de huidskleur van het gezicht); `Human.load` kiest die met `bodyCode` en verbergt losse
  onderdelen (portofoon, sluitlusje) met `hideUV`. Bijna geraakt gebruikt de originele texturen.
  Tomasz draagt een donkergroen werkjack (`tintClothes` in `js/human.js`), zodat hij niet opgaat
  tussen de collega's in het blauw. Op de achtergrond zitten collega's aan andere tafels en haalt teamleider Sandra koffie;
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

## Hoog en droog

```
Intro ── de speler loopt met zijn scanner door orderpickgang 12. Een metalen tik: Henk staat
   │     op de tweede ligger van de stelling, één hand aan de staander, en trekt aan een doos
   │     bovenin. Een rolsteiger staat verderop in de gang. Henk kijkt om:
   │     "Hé, jij daar! Pak jij die doos even aan?"
   ▼
Keuze (tijd staat stil, Henk kijkt naar de speler)
   ├─ A "Henk, kom even naar beneden? Ik schrik als ik je daar zie staan. Ik haal de trap wel."
   │       (op de keuzekaart alleen "Henk, kom even naar beneden?" met twee pictogram-chips
   │       'ik schrik' en 'ik haal de trap', zodat de lengte het antwoord niet verraadt)
   │       → Henk moppert ("Ik doe dit al vijfentwintig jaar") en blijft staan: "Kom op, geef nou
   │         gewoon die doos aan. Dan zijn we zo klaar."
   │       ▼
   │     Keuze 2 "Wat zeg jij nu?"
   │       ├─ A2 "Nee Henk, zo help ik je niet. Ik haal de rolsteiger." → "Pff. Nou, vooruit dan."
   │       │      Henk klimt naar beneden en het oude einde van A volgt (hieronder)  → Rustig
   │       ├─ B2 "Nou, vooruit dan. Geef maar." → het einde van B (bijna-val, Marco)  → Gespannen
   │       └─ C2 "Doe normaal! Ik ga het nu melden." → het einde van C (Sandra)      → Ruzie
   │       Einde van A2: Henk klimt voorzichtig naar beneden.
   │         De speler loopt meteen naar de rolsteiger en duwt hem naar de stelling, en zet hem op
   │         de rem (klik, rood pedaal). "Je hebt gelijk. Vorig jaar is Ahmed zo gevallen." Henk
   │         klimt de steiger op, pakt de doos en geeft hem laag aan; de speler staat naast de
   │         treden (niet eronder) en neemt hem over. Henk houdt met twee handen de leuning vast.
   ├─ B "Ja hoor, geef maar."
   │       → de speler stapt onder de stelling, Henk reikt verder, de doos schuift weg en valt,
   │         Henks voet glijdt van de ligger (hartslag). "Haha… dat ging net goed." Marco komt
   │         met de heftruck de hoofdgang op: "Henk! Kom daar af, man." Henk klimt naar beneden.
   └─ C "Ben je gek? Dat mag niet! Ik ga je melden."
           → Henk wordt boos en blijft staan ("Waar bemoei jij je mee, groentje?"). Teamleider
             Sandra komt erbij: "Henk, kom eerst even naar beneden." Hij komt, maar kijkt de
             speler niet meer aan.
   ▼
Nabespreking ── dezelfde 4 kaartjes als in de andere oefeningen. Geen punten.
```

- **Woorden en beeld:** de speler zegt "trap"; op de rolsteiger staat daarom een bordje TRAP.
  Bij de tweede keuze (A2) zegt de speler "rolsteiger"; de nabespreking van A2 gebruikt daarom dat
  woord (pictogram-chip 'rolsteiger').
  De tip van A herhaalt precies de drie stukjes van de gesproken zin (kom naar beneden, ik schrik,
  ik haal de trap). Kaart C heet "Je dreigt" en zegt erbij dat melden goed is, maar dat je het
  eerst rustig tegen Henk zegt (pictogram klembord).
- **Geen lange stiltes:** waar niemand praat (A: naar de steiger lopen, de rem) staat een korte
  vertellersregel zonder stem in de ondertitelbalk (`narrate` in `js/sim.js`).

- **Plek:** een orderpickgang voorin dezelfde hal als Bijna geraakt (`js/racking.js`): lage
  stellingen voor dozen en bakken met liggers op 0,5 – 0,95 – 2,15 – 3,3 m, draadroosters,
  locatie-etiketten (12-04-C), gangbord, gele lijnen, een rolsteiger met treden en leuningen en
  Henks orderkar. Door een opening in de overkant van de gang zie je de hoofdgang en de docks.
- **Henk:** Rocketbox `Male_Adult_05` (gezichtsvariant met blendshapes, texturen `m009_*`), met
  grijzend haar (haar en haarplukjes zijn grijs gemaakt) en een geel hesje met reflecterende
  strepen in plaats van de beige bodywarmer. De haarplukjes langs de haargrens zijn een apart
  materiaal met doorzichtigheid (`m009_opacity_color.png`); `Human.load` herkent dat vanzelf.
- **Klimmen (procedureel):** er bestaat geen motion capture van klimmen. Voeten en handen worden
  met IK op hun steunpunt gezet (`pinFoot` en `grip` in `js/human.js`): de enkel op de ligger,
  de trede of de vloer, de handen met de handpalm op het staal. Het scenario beweegt die punten
  met een boogje (voet even weg van de stelling, tenen omlaag) en zegt waar het lichaam ongeveer
  moet zijn; per beeld zakt het lichaam zo ver als nodig om elke voet echt te halen (`holdRoot`
  in `js/henk.js`). Zo zweeft er nooit een voet. Elke stap omlaag gaat zoals op een ladder
  (`stepTo`): eerst het gewicht naar het steunbeen (bekken erboven, heup aan de zwaaikant iets
  omlaag), dan door de knie zakken terwijl de heupen buigen en iets naar achteren gaan en de romp
  naar de stelling leunt (`hips` in `js/human.js`), even stil als de voet staat, dan het gewicht
  erop. Afdalen gaat naar de stelling toe, met steeds drie steunpunten, via de eerste ligger, en
  het laatste stuk zonder te springen. Tijdens het afdalen staat de speler midden in de gang
  (`P.watch`), zodat de staander naast Henk in beeld is en niet achter zijn hoofd.
- **Handen (`js/hands.js`):** elke greep is een contact van de handpalm met een vlak: om de
  staander (handpalm op de voorkant of binnenkant, vingers om de rand), plat op de ligger (duim
  onder de voorrand), van bovenaf om de leuning, met de vingers over de bovenrand van de doos, of
  met twee handpalmen laag tegen de zijkanten van de doos. Pols en handstand volgen elk beeld uit
  het voorwerp, dus een gedragen doos zit vast in de handen. Dragen gaat rustig, met de doos
  tegen het lichaam en Henk iets achterover (het gewicht).
- **Handen van de speler:** bij het duwen van de rolsteiger (A) en het aanpakken (B) komen de
  armen van de speler in beeld (blauwe werkmouwen, dezelfde grepen als bij Henk). In VR niet:
  daar zijn je eigen handen en controllers er.
- **Bijna-val (B):** Henk trekt de doos aan de bovenrand over de rand van de doos eronder; die
  kantelt en valt als star lichaam (`js/boxphys.js`): hij botst met het staal, met Henk (capsules
  om romp, armen en benen) en de speler, stuitert op de vloer en blijft liggen. Henks rechtervoet
  schiet van de ligger, hij grijpt met twee handen de staander en hangt even scheef. Geluid:
  natrillende ligger, doos op beton, hartslag; de speler trekt zijn handen terug en deinst terug.
- **Geluid:** ruimtelijke stemmen met de galm van de hal, metalen tikken van voeten op liggers en
  treden, zwenkwielen van de rolsteiger, de heftruck van Marco.
- **Voor de docent:** waarom is het lastig iets te zeggen tegen iemand die ouder is en meer
  ervaring heeft? Wat is het verschil tussen "ik schrik als ik je daar zie" en "ben je gek"?
  Waarom is meehelpen (B) ook gevaarlijk voor jezelf? Wanneer ga je naar je leidinggevende,
  en is dat hetzelfde als dreigen met melden?

## Aanpassen

| Wat | Waar |
| --- | --- |
| Teksten, vertalingen en nabespreking (Bijna geraakt) | `js/i18n.js` |
| Tweede keuze (Volhouden): teksten `x1`, `A2/B2/C2`, `prompt2`, `retryStart` | `js/i18n*.js`; regie in `branchA`, `branchA2/B2/C2` |
| Teksten, vertalingen en nabespreking (Grap in de kantine) | `js/i18n-kantine.js` |
| Teksten, vertalingen en nabespreking (Hoog en droog) | `js/i18n-henk.js` |
| Namen van de oefeningen (titel en links op het startscherm) | `EXERCISES` in `js/i18n.js` |
| Pictogrammen | `js/icons.js` |
| Luidheid van de stemopnames (gain per regel) | `tools/loudness.py` → `audio/**/gain.json` |
| Hoe sterk gezicht en gebaren zijn (0 = neutraal, 1 = vol) | `EXPRESSION` in `js/human.js` |
| Volgorde, timing en gebaren per zin | `js/main.js`, `js/kantine.js` en `js/henk.js` (`runIntro`, `branchA/B/C`) |
| Klimmen en afdalen (steunpunten, tempo) | `climbDown`, `stepTo`, `climbSteiger` en `slip` in `js/henk.js` |
| Grepen van handen (staander, ligger, leuning, doos) en de armen van de speler | `js/hands.js`, grepen in `js/henk.js` |
| De vallende doos (botsen, stuiteren) | `js/boxphys.js` |
| Gedeeld raamwerk: camera, ondertitels, keuze, nabespreking, talen, VR | `js/sim.js` |
| Magazijn (stellingen, borden, vloermarkering) | `js/world.js` |
| Kantine (tafels, stoelen, toonbank, ramen, licht) | `js/canteen.js` |
| Orderpickgang, rolsteiger en de doos (Hoog en droog) | `js/racking.js` |
| Personages (animaties, kijken, wijzen, zitten, lachen, gezicht, lipsync, knipperen, huid en ogen) | `js/human.js` |
| 3D-modellen, texturen en gebakken animaties | `models/` |
| Heftruck | `js/forklift.js` |
| Geluidseffecten, ruimtelijk geluid en galm | `js/audio.js` |
| Stemopnames | `audio/*.mp3`, `audio/kantine/*.mp3` en `audio/henk/*.mp3` |

Een nieuwe zin toevoegen (voor de kantine: `kantine` in de bestandsnamen en commando's, voor
Hoog en droog: `henk`):

1. Zet de tekst in `LINES` in `js/i18n.js` (of `js/i18n-kantine.js`, `js/i18n-henk.js`) en geef
   de zin een emotie in `LINE_EMO` in `js/main.js` (of `js/kantine.js`, `js/henk.js`).
2. Maak een mp3 met dezelfde naam in `audio/` (of `audio/kantine/`, `audio/henk/`), bijvoorbeeld
   via ElevenLabs.
3. Laat de mp3 transcriberen met woordtijden (ElevenLabs Scribe) en zet de woorden met
   begin- en eindtijd in `tools/words.json` (of `tools/words_kantine.json`, `tools/words_henk.json`).
4. Meet de luidheid met `node tools/envelope.mjs` (met een webserver op poort 8123) en draai
   daarna `python3 tools/lipsync.py`. Dat maakt `models/lipsync.json` opnieuw. Voor de kantine:
   `node tools/envelope.mjs kantine` en `python3 tools/lipsync.py kantine`
   (→ `tools/envelope_kantine.json` en `models/lipsync_kantine.json`). Voor Hoog en droog:
   `node tools/envelope.mjs henk` en `python3 tools/lipsync.py henk`.
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
- Klimmen is met IK nagebootst, niet opgenomen: bekken, heupen en romp bewegen procedureel
  bovenop een gewone sta-animatie. Van dichtbij is dat minder soepel dan echte motion capture.
- De handen van de speler zijn alleen te zien als je naar ze kijkt: bij het duwen kijk je even
  naar de leuning, daarna weer naar Henk en de stelling.
- De lipsync volgt de woorden klank voor klank, maar de omzetting van spelling naar
  mondstand werkt met vuistregels voor het Nederlands. Bij leenwoorden ("scanner")
  is dat soms een benadering.

## Techniek

Three.js 0.160 (via jsDelivr), Web Audio API (HRTF-panning, convolutiegalm,
analyser voor lipsync), WebXR. Geen buildstap: gewone ES-modules.

De personages (Marco, Sandra, Dennis, Tomasz, Henk en de collega's op de achtergrond) en hun animaties komen uit
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

### Lichaamstaal (`js/human.js`)

Niemand staat of zit stil als een standbeeld, maar alles blijft ingetogen:

- **Ademen:** borst en schouders gaan zichtbaar maar klein op en neer. Na boosheid, schreeuwen of
  lachen sneller en dieper, en pas na een tijd weer rustig. Zuchten (`sigh()`) op passende momenten,
  bijvoorbeeld bij Dennis vóór "Pff" en "Oké, oké" en bij Marco als hij opgelucht is.
- **Gewicht en houding:** om de 6–15 s verplaatst iemand het gewicht een fractie; zittend soms iets
  achterover of iets meer op de onderarmen.
- **Eigen handelingen**, op willekeurige momenten en per persoon anders: slokje koffie (het kopje gaat
  echt mee naar de mond en terug op zijn plek), nek wrijven, kin in de hand, langs de neus, onderarm
  krabben, mouw goedtrekken, bestek verleggen, telefoon (de collega die alleen zit). Arm met IK.
  Nooit bij de keuze (`LIFE.quiet`), niet tijdens praten, niet als de armen al iets doen en niet bij
  boosheid of schrik. Het scenario kan ze uitstellen met `settle(seconden)`.
- **Kijken:** de ogen springen eerst naar het nieuwe doel, het hoofd volgt 100–200 ms later met een
  zachte aanloop en schiet een fractie door; de romp volgt nog later. Gerekend in hoeken t.o.v. het
  lichaam, zodat het hoofd nooit omklapt als het doel achter iemand langs gaat. Tijdens het luisteren
  kleine, trage hoofdbewegingen en oogsprongetjes tussen de ogen en de mond van de spreker.
- **Gebaren:** aanloop (arm even terug, schouder op) → slag (iets voorbij het doel) → vasthouden →
  rustig ontspannen. Schouder en bovenrug doen mee, de pols ijlt na. Knikken en schudden zacht in- en
  uitgezet, en nooit twee keer precies hetzelfde. Animaties vloeien in elkaar over met een S-curve.
- **Samen reageren:** als meer mensen tegelijk reageren (kijken, omdraaien) zit er 80–400 ms tussen
  (`stagger` in `js/kantine.js`).
- **Lopen:** zacht op gang komen en afremmen, iets langzamer door bochten, voetstappen op het ritme
  van de loopanimatie, en kijken waar je heen loopt.

### In- en uitstappen

Uitstappen: contact uit, zijwaarts draaien, opstaan (motion capture) met de hand aan de stijl,
via de treeplank naar de grond (driepuntscontact). Instappen gaat omgekeerd, met de
motion capture "gaan zitten".

De animaties zijn gebakken naar een compact binair formaat
(`models/anim_*.bin`, 24 fps, 16-bit rotaties); `js/human.js` leest dat in. `anim_m` en `anim_f`
zijn de basisset (daarin ook opstaan), `anim_k` bevat de kantine-animaties (aan tafel zitten,
gaan zitten op een stoel, verdrietig of zenuwachtig luisteren). Bij gaan zitten op de stoel is de
verplaatsing van het lichaam bewaard (wortelbeweging), zodat iemand echt op de stoel terechtkomt.
Kijken, wijzen, knikken, knipperen, boosheid (ARKit/FACS-blendshapes) en lipsync (visemen) worden
in realtime bovenop de animaties berekend. De stemmen zijn gemaakt met ElevenLabs.
