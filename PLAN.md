# PLAN – Beast Island (arbejdstitel)

Et online 3D-spil i Chrome. Man spawner på en kæmpe ø, fanger dyr med kuber, sætter dem i sin base hvor de tjener penge, og stjæler dyr fra andre spilleres baser. Målet er at toppe alle leaderboards. **Alt i spillet er på engelsk.**

## 1. Øen
- Isbjerg (Frostfang Peak) med sne og is
- 2 normale bjerge (Stonecrown Mountain, Greyridge Mountain)
- Skove (Whispering Woods, Pinewood Forest, Old Oak Forest)
- Vulkan (Mount Ember) med lava – og en **hemmelig grotte under vulkanen** hvor The Absolute Beast bor
- En grotte (Crystal Cave)
- Strande og hav
- Dag og nat (påvirker kun lyset)
- Kort over hele øen på **Q**

## 2. Spilleren
- Normalt menneske, klædt som businessman (jakkesæt, slips, mappe)
- Third person, mus + tastatur

| Tast | Funktion |
|---|---|
| W A S D | Gå |
| Shift | Løb |
| Mus | Drej kamera |
| Scroll | Zoom |
| Mellemrum | Hop |
| Venstre klik | Kast kube / slå |
| E | Brug / saml op |
| Q | Kort |
| Tab | Inventory |

## 3. Rarities
Et nyt dyr spawner et tilfældigt sted ca. hvert 5. sekund. Først vælges rarity, så et af dyrene i den rarity.

| Rarity | Farve | Chance |
|---|---|---|
| Common | Grå | 55 % |
| Uncommon | Grøn | 25 % |
| Rare | Blå | 12 % |
| Epic | Lilla | 5 % |
| Legendary | Gul | 2 % |
| Mythic | Rød | 0,7 % |
| Godly | Gylden | 0,25 % |
| Divine | Flammer | 0,04 % |
| Infinite | Regnbue | 0,009 % |
| The Next Level | Sort | 0,001 % |
| Ancient Legend | Gennemsigtig | Kun 1 – kun i grotten under vulkanen |

## 4. Dyr (start: 4 pr. rarity, senere 40)
| Rarity | Dyr |
|---|---|
| Common | Rabbit, Squirrel, Frog, Pigeon |
| Uncommon | Fox, Deer, Raccoon, Penguin |
| Rare | Wolf, Snow Owl, Lynx, Crystal Beetle |
| Epic | Polar Bear, Lava Lizard, Thunder Hawk, Moss Turtle |
| Legendary | Frost Wolf, Fire Fox, Griffin, Glacier Mammoth |
| Mythic | Phoenix, Unicorn, Shadow Stag, Kraken Crab |
| Godly | Golden Dragon, Storm Lion, Sun Serpent, Titan Bear |
| Divine | Inferno Wyvern, Angel Stag, Sky Whale, Magma Behemoth |
| Infinite | Galaxy Dragon, Cosmic Owl, Time Turtle, Prism Leviathan |
| The Next Level | Void Wolf, Eclipse Phoenix, Black Hole Hydra, Glitch Cat |
| Ancient Legend | **The Absolute Beast** – element-panter med 4 glødende orbs (ild, vand, sten, luft) |

**The Absolute Beast:** Man skal først battle den, derefter kan man fange den. Den kan ikke sælges.

## 5. Kuber
Dyr flygter ikke. Fejler kastet, er kuben væk.

| Kube | Pris | Com | Unc | Rare | Epic | Leg | Myth | God | Div | Inf | TNL |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Rusty Cube | $10 | 60 | 40 | 20 | 8 | 3 | 1 | 0 | 0 | 0 | 0 |
| Old Cube | $100 | 80 | 60 | 40 | 20 | 8 | 3 | 1 | 0 | 0 | 0 |
| Good Cube | $1.000 | 95 | 80 | 60 | 40 | 20 | 8 | 3 | 1 | 0 | 0 |
| Ultra Cube | $25.000 | 100 | 95 | 80 | 60 | 40 | 20 | 8 | 3 | 1 | 0 |
| Master Cube | $500.000 | 100 | 100 | 95 | 80 | 60 | 40 | 20 | 8 | 3 | 1 |
| Admin Cube | Kun ejer (snydekode, tjekkes på serveren) | 100 % |

## 6. Penge
Tjenes hvert sekund mens man er online, hober sig op i basen og skal samles op.

| Rarity | $/sek | Salgspris |
|---|---|---|
| Common | 1 | 100 |
| Uncommon | 3 | 300 |
| Rare | 10 | 1.000 |
| Epic | 30 | 3.000 |
| Legendary | 100 | 10.000 |
| Mythic | 400 | 40.000 |
| Godly | 1.500 | 150.000 |
| Divine | 6.000 | 600.000 |
| Infinite | 25.000 | 2.500.000 |
| The Next Level | 100.000 | 10.000.000 |
| Ancient Legend | 1.000.000 | Kan ikke sælges |

## 7. Base
- Tilfældig plads på øen når man joiner
- 10 pladser i starten, +1 plads på 2. sal pr. rebirth
- Inventory: 19 pladser (dyr i inventory tjener ikke penge)
- Laserknap: 60 sek. lukket, 10 sek. cooldown. Man kan ikke komme igennem laseren.
- Når man logger ud forsvinder basen (dyrene er gemt)

## 8. Stjæle
- Gå ind i en åben base, tag et dyr, bær det hjem
- Tyven løber normalt; ejeren bliver hurtigere tæt på tyven
- Våben flinger folk væk (ingen liv): **Bat** (alle har den), **Slap Hand**, **Paintball Gun**

## 9. Rebirth
- Koster penge (forslag: $1.000.000, derefter ×3 hver gang)
- Mister: penge og våben. Beholder: dyr og kuber. Får: +1 plads.

## 10. Leaderboards
1. Most money per second
2. Longest time played
3. **Top Supporters** (ingen beløb vises)

## 11. Tutorial
Med bots: gå, kaste kuber, base, penge, laser, stjæle, bat.

## 12. Teknik
- Three.js (WebGL) i Chrome – realistisk lys, skygger, vand, tåge, glød, dag/nat
- Gratis 3D-modeller til at starte med, Blender senere
- Node.js-spilserver (maks 20 spillere pr. ø) – serveren bestemmer fangster, penge og snydekoder
- Database til login, gem og leaderboards
- Rigtige penge (in-game purchases) sættes op af en voksen til sidst

## 13. Byggerækkefølge
1. **Øen** – terræn, bjerge, isbjerg, vulkan, skove, grotte, hav, dag/nat, gå rundt, kort på Q ← *nu*
2. Dyr og kuber
3. Base, penge, salg, butik
4. Stjæle: laser, våben, bots/tutorial
5. Online, login, gem
6. Leaderboards og rebirth
7. Grafik-polish, flere dyr, The Absolute Beast + hemmelig grotte
8. Våbenbutik, snydekoder, in-game purchases

## 14. Åbne punkter
- Hvordan battlen mod The Absolute Beast foregår
- Våbenpriser
- Spillets rigtige navn
