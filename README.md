# KoopjesJagertje

Een lokale, Nederlandstalige website om op specifieke items te zoeken, een maximumprijs in te stellen en favorieten en zoekopdrachten te bewaren. Geen account bij KoopjesJagertje nodig.

## Lokaal starten

Installeer **Node.js 24 of nieuwer** (bij voorkeur de actuele LTS-versie). Er zijn geen externe npm-dependencies.

```sh
git clone https://github.com/henkdepotvis0180/KoopjesJagertje.git
cd KoopjesJagertje
npm start
```

Heb je de repository al? Open dan een terminal in die map en voer alleen `npm start` uit. Open vervolgens **http://localhost:3000** in je browser. Stop de server met `Ctrl+C`.

Voor automatisch herstarten na serverwijzigingen: `npm run dev`. Een andere poort kiezen kan met de omgevingsvariabele `PORT` (bijvoorbeeld `PORT=3001 npm start` op macOS/Linux of `$env:PORT=3001; npm start` in PowerShell).

## Gebruik

1. Vul een specifiek item in, bijvoorbeeld `Nintendo Switch OLED`.
2. Stel eventueel een maximumprijs in en klik op **Zoek koopjes**.
3. Sorteer de gevonden advertenties op prijs en open een advertentie voor de actuele gegevens.
4. Bewaar favorieten met het hartje of sla de zoekopdracht op voor later.

**Bekijk demo** toont uitsluitend verzonnen, duidelijk gemarkeerde voorbeeldadvertenties. De demo maakt geen verbinding met Marktplaats. Demo-favorieten blijven herkenbaar als voorbeeld.

## Wat de bronnen ondersteunen

- **Marktplaats:** de server vraagt bij een zoekactie maximaal 50 resultaten op via de openbare zoekroute van de website. Er wordt geen account, cookie of token gebruikt. Deze ongedocumenteerde route kan veranderen, een blokkade geven of niet beschikbaar zijn. De app toont dan een fout en een rechtstreekse zoeklink. Dit is geen officiële Marktplaats-integratie. Geen blokkades of inlogschermen worden omzeild.
- **Facebook Marketplace:** een knop opent jouw zoekterm rechtstreeks op Facebook. Facebook kan om een account vragen; zonder account is geen betrouwbare advertentiekoppeling beschikbaar. Facebook-advertenties worden daarom niet automatisch ingeladen.
- Een maximumprijs verwijdert resultaten zonder numerieke prijs. Biedprijzen worden als **Bieden vanaf** gemarkeerd. De lijst is een beperkte selectie, geen volledige prijsvergelijking. Er wordt geen marktwaarde of korting verzonnen; **Binnen je budget** betekent alleen dat de getoonde prijs onder je ingestelde grens ligt.
- Er zijn geen automatische achtergrondzoekopdrachten, pushmeldingen of e-mails.

## Privacy en werking

De server luistert alleen op `127.0.0.1`. Favorieten en zoekopdrachten staan in `localStorage` van je browser, niet in een database. Je kunt ze wissen via **Hoe werkt het?**. Zoektermen gaan naar Marktplaats zodra je zoekt; externe afbeeldingen worden rechtstreeks van Marktplaats geladen. De site gebruikt geen analytics, externe lettertypen of frontendbibliotheken.

De server bewaart zoekresultaten twee minuten in geheugen en laat maximaal één nieuwe externe zoekactie per vijf seconden toe. De HTTP-client behoudt TLS-verificatie. De startcommando’s ondersteunen de bestaande `HTTPS_PROXY`/CA-instellingen via Node.js `--use-env-proxy`. Verwijder geen beveiligingsinstellingen om een verbinding te forceren.

## Controleren

```sh
npm test
```

De tests controleren de echte lokale HTTP-server, prijsfiltering, normalisatie, onveilige links, foutafhandeling, caching en aanvraagbegrenzing met nagebootste bronresponses. Er zijn geen externe diensten nodig om de tests uit te voeren. Een geslaagde test bewijst geen live beschikbaarheid van Marktplaats.

Tijdens de ontwikkeling was extern verkeer naar Marktplaats en Facebook in de cloudomgeving geblokkeerd. De live Marktplaats-koppeling moet daarom nog vanaf een netwerk met toegang worden gecontroleerd. Lokaal starten, de demo en de foutafhandeling zijn afzonderlijk te testen.
