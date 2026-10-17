# Nieuwe Game – ontworpen door Mats

Een 3D zombie-game: zoek 5 sleutels en 5 scherven in een map vol kamers en gangen.
Het hele ontwerp staat in `ontwerp.md`.

## Spelen
- **Online:** https://garmtelings.github.io/nieuwe-game/ (PC, telefoon en tablet)
- **Als app op telefoon:** open de link en kies *Toevoegen aan beginscherm* (iPhone: deelknop → Zet op beginscherm). Daarna werkt het ook zonder internet.
- **Op de PC zonder internet:** dubbelklik op `index.html`.

**Besturing PC:** WASD = lopen, muis = kijken, klik = schieten, R = herladen, E = deur open/dicht, M = kaartje, Esc = pauze.
**Besturing telefoon:** linkerduim = lopen (joystick verschijnt waar je drukt), rechts vegen = kijken, 🔫 vasthouden = schieten, ↻ = herladen, 🚪 = deur, 🗺️ = kaartje, ⏸ = pauze. Telefoon liggend houden werkt het best.

## Nieuwe versie online zetten
Na het aanpassen: `git add -A`, `git commit -m "wat je veranderd hebt"`, `git push`. Na ongeveer een minuut staat het online.

## Zelf dingen veranderen
Open `config.js` in Kladblok (of VS Code). Daar staan alle getallen, bijvoorbeeld hoeveel kamers er zijn,
de kans op zombies en hoeveel damage de pistolen doen. Verander een getal, sla op en druk op F5 in de browser.

## Bestanden
| Bestand | Wat zit erin |
|---|---|
| `index.html` | de pagina die je opent |
| `config.js` | **alle instellingen** |
| `map.js` | maakt elke keer een nieuwe map met kamers en gangen |
| `game.js` | het spel zelf: lopen, schieten, zombies, deuren |
| `style.css` | hoe de schermen en teksten eruitzien |
| `vendor/three.min.js` | Three.js, de 3D-bibliotheek (niet aanpassen) |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | zorgen dat je het als app kunt installeren |

## Wat Mats nog niet heeft besloten (nu een keuze van ons, makkelijk te veranderen)
- Hoeveel schade een zombie bij jou doet: nu 15% per klap (`zombieSchade`).
- Hoeveel schoten je hebt voor je moet herladen: nu 8 (`kogelsPerMagazijn`).
- Hoe groot de map is: nu 30 kamers (`aantalKamers`).
- Een kaartje linksboven (toets M) om de weg te vinden. Dit stond niet in het ontwerp.
- Deuren beginnen dicht. Zombies kunnen niet door een dichte deur.
