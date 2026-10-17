// =============================================================
//  INSTELLINGEN – hier kun je het spel zelf aanpassen!
//  Verander een getal, sla op, en druk in de browser op F5.
// =============================================================
const INSTELLINGEN = {
  // --- De map ---
  aantalKamers: 30,          // hoeveel kamers er in de map zijn
  kansKamerMetDeur: 0.5,     // 0.5 = de helft van de kamers heeft deuren (zombies kunnen niet door een dichte deur)

  // --- Wat er in de kamers ligt ---
  aantalSleutels: 5,         // "er zijn 5 sleutels in de map"
  aantalScherven: 5,         // "er zijn 5 scherven in de map"
  kansNormaalPistool: 0.5,   // 1 op de 2
  kansGoedPistool: 0.25,     // 1 op de 4

  // --- De vijand ---
  kansZombieInKamer: 0.4,    // 50 kamers -> 20 zombies, 100 kamers -> 40
  kansZombieInGang: 0.3,     // 100 gangen -> 30 zombies
  zombieLeven: 100,          // leven van een zombie (in %)
  zombieSchade: 15,          // hoeveel % schade een zombie bij jou doet per klap
  zombieSlagTijd: 1,         // seconden tussen twee klappen van een zombie
  zombieSnelheid: 2.2,       // hoe snel zombies lopen (jij loopt 5)
  zombieZietAfstand: 16,     // hoe ver een zombie je kan zien (in meters)

  // --- De pistolen ---
  schadeNormaal: 20,         // de 'normale' doet 20% damage
  schadeGoed: 40,            // de 'goede' doet 40% damage
  herlaadTijd: 2,            // herladen duurt 2 sec (bij allebei)
  kogelsPerMagazijn: 8,      // hoeveel schoten voor je moet herladen (kogels zelf zijn oneindig)

  // --- Jij ---
  spelerSnelheid: 5,
  aantalRevives: 1,          // "als je 100% op bent kan je één keer reviven"
  muisGevoeligheid: 0.0022,
  minimap: true,             // kaartje linksboven (aan/uit met M)

  // --- Muziek ---
  muziekAan: true,           // achtergrondmuziek aan bij de eerste keer spelen (daarna onthoudt het spel je keuze)
  muziekVolume: 0.6,         // 0 = stil, 1 = hard
};
