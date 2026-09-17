/* Wording and units, in one place, so another language is a data file and not a rewrite.
 *
 * WHY THIS EXISTS. The page used to build its sentences by gluing fragments together — one
 * ran to fourteen separate pieces with numbers dropped in between them. English tolerates
 * that. Spanish, French, Portuguese and Turkish do not: they put the number, the adjective
 * and the verb in different places, and a translator handed fourteen fragments cannot move a
 * word from one to another. Every sentence here is therefore whole, with named slots, so a
 * translator can put the slots wherever that language needs them.
 *
 * UNITS FOLLOW THE READER, not the code. The site was reporting millimetres to growers in
 * Nebraska. Rainfall is inches and temperature is Fahrenheit for a US reader; the same
 * sentence gives millimetres and Celsius to everyone else. The numbers are stored in metric
 * and converted at the last moment, so no figure is ever converted twice.
 *
 * PLAIN LANGUAGE IS NOT DECORATION HERE. The old text scored reading grade 17 on its central
 * explanation — postgraduate. Short sentences are easier to read AND far easier to translate
 * accurately, so the two goals pull the same way.
 */
(function () {
  'use strict';

  var UNITS = {
    imperial: {
      depth: function (mm) { return round1(mm / 25.4) + ' in'; },
      depthName: 'inches',
      // An actual temperature needs the +32 offset; a DIFFERENCE does not. Leaving it out
      // turned a 90F heat threshold into 58F on the page.
      temp: function (c) { return Math.round(c * 9 / 5 + 32) + '°F'; },
      tempDiff: function (c) { return round1(c * 9 / 5) + '°F'; },
      tempName: 'Fahrenheit'
    },
    metric: {
      depth: function (mm) { return Math.round(mm) + ' mm'; },
      depthName: 'millimetres',
      temp: function (c) { return Math.round(c) + '°C'; },
      tempDiff: function (c) { return round1(c) + '°C'; },
      tempName: 'Celsius'
    }
  };

  function round1(x) { return (Math.round(x * 10) / 10).toString(); }

  /* Everything a reader sees. One entry per sentence, never a fragment.
     Slots are {name}. Keep sentences short — under about 20 words — because that is both
     easier to read and far harder to mistranslate. */
  var EN = {
    'water.reading':
      'Over the last 30 days, rain was {balance} short of what {crop} used at the typical ' +
      'gauge. The driest area was {low} short. The wettest was {high} short.',
    'water.surplus':
      'Over the last 30 days, rain covered what {crop} used at the typical gauge, with ' +
      '{high} to spare.',
    'water.what':
      'This is rain against what the crop itself draws, which changes as the crop grows. ' +
      'This counts rain only. It leaves out irrigation and water already in the soil. Use ' +
      'it to see where rain fell behind, not to judge a watered field.',

    'heat.reading':
      '{crop} has had {days} days above {threshold} at the typical gauge, and up to {hottest} ' +
      'in the hottest tenth of the area. Heat while pods fill makes seed small.',

    'history.season':
      'Season so far, {passes} satellite passes from {from} to {to}: {crop} is {best} in ' +
      '{bestRegion} and {worst} in {worstRegion}.',
    'history.usual':
      '{inRange} of {total} areas are inside their normal range for this date. Most seasons are.',
    'history.observed':
      'This is what the satellite saw, not a forecast. It does not wait on any agency.',
    'history.rankNote':
      'A rank is shown too, but the seasons sit close together, so read the percentage first.',
    'history.sharedBeans':
      'All dry bean types share this map. USDA maps one dry bean crop, so the satellite ' +
      'cannot tell pinto from kidney. Peas and chickpeas have their own ground and do differ.',

    'flower.heat':
      'Days above {threshold} while {crop} was flowering and setting pods. Beans are hurt ' +
      'most by nights that stay warm, and nights cool off here, so this rarely costs ' +
      'weight. It can still cost seed size.',
    'flower.disagree':
      'A high count here is worth watching for small seed, not for a light crop.',

    'estimate.lead':
      'A yield estimate built only from what has been measured this season, and the ' +
      'measurements behind it. It does not wait on USDA.',
    'estimate.best':
      'Best {bestRegion} at {bestYield}. Weakest {worstRegion} at {worstYield}.',
    'estimate.trustField':
      'Irrigation, variety, disease and hail are not visible to us. Where this disagrees ' +
      'with your own records, your field is right and telling us is what fixes it.',

    'footprint.counts':
      'USDA counts {acres} acres of {commodity} in the {counties} counties outlined here, ' +
      'most of it near {where}.',
    'footprint.outline':
      'The outline is whole counties, not fields. The crop is a small part of the area drawn.',
    'footprint.planted':
      'USDA planted acres of {crop} in {year}: {figures}. That is the crop itself, not the ' +
      'mapped area above.',

    'headline.basis':
      'This range is USDA\u2019s own record for {crop}, moved {direction} {percent} for this ' +
      'season\u2019s heat and rain. It is not our own forecast.',
    'headline.basisFlat':
      'This range is USDA\u2019s own record for {crop}, unchanged for this season. It is not ' +
      'our own forecast.',

    'estimate.lead2':
      'A yield estimate from what we have measured this season, with the measurements beside ' +
      'it. Nothing here waits on USDA.',
    'estimate.bestWorst':
      'Best: {bestRegion}, {bestYield}. Weakest: {worstRegion}, {worstYield}.',
    'estimate.whatItIs':
      'This is an estimate from satellite and weather data. It is not a forecast we have ' +
      'proved, and it is not a measurement of your field.',
    'estimate.howBuilt':
      'We run the same model over this season and over the last 11 seasons, then compare the ' +
      'two. Comparing them cancels out the parts we cannot measure well. We apply that ' +
      'comparison to what the crop actually harvested in past years.',
    'estimate.bandMeans':
      'The range shows how much this signal moves from season to season. It is not a margin ' +
      'of error.',
    'estimate.heatNotPriced':
      'Hot days are not subtracted from this number, and we checked whether they should ' +
      'be. Across ten years of real harvests in these states, hot years did not yield ' +
      'less. Two reasons: nights cool off here, and much of this ground is watered.',
    'estimate.weakestPart':
      'The weakest part of this estimate: the step that turns greenness into growth is not ' +
      'calibrated for these crops. The whole range can be off. What moves it up or down ' +
      'through the season is measured.',
    'estimate.proxyLevel':
      'Read this one more carefully. USDA does not measure the yield of this crop in ' +
      'these states at all, so the pounds here are borrowed from Montana, which plants ' +
      'more chickpeas than any other state — 260,000 acres in 2025, against 141,000 in ' +
      'Washington, the next biggest. We can show that borrowing works: dry peas are ' +
      'measured in both Montana and Nebraska, and the two come out within 3% of each ' +
      'other. What is measured on this ground is how the season is going. What is ' +
      'borrowed is the weight that is applied to.',
    'estimate.classLevels':
      'The difference between bean types comes from what each type actually harvested in ' +
      'this state, over ten USDA years. We used to work it out ourselves and it was wrong ' +
      'by about 10%, and backwards in Wyoming. The season signal is now one figure per ' +
      'area, because the satellite cannot tell one bean type from another.',
    'estimate.heatSeedSize':
      'Heat can still cost you seed size, which is a price problem rather than a weight ' +
      'problem. We cannot measure seed size from a satellite. Only weighing and ' +
      'screening real beans shows that.',
    'estimate.yourField':
      'We know how much of the ground here is irrigated, but not whether your field is. ' +
      'We cannot see variety, disease or hail at all. If this disagrees with your own ' +
      'records, your field is right, and telling us is what fixes it.',
    'estimate.irrigated':
      'Irrigated ground under {crop}: {figures}. Measured by USGS in {year}, so this is ' +
      'the ground itself, not this season, and not your own field.',

    'estimate.wouldSharpen':
      'What would sharpen it: real harvest results \u2014 loads, test weights, screen size, ' +
      'tied to a place and a date \u2014 and whether the field was watered. Reports from ' +
      'growers and agronomists are the biggest gap we can actually close.',

    'footprint.line':
      'USDA counts {acres} acres of {commodity} in these {counties} counties, most of it near ' +
      '{where}.',
    'footprint.wholeCounties':
      'The outline shows whole counties, not fields. The crop is a small part of the area drawn.',
    'footprint.oneBeanClass':
      'USDA maps one dry bean crop, so pinto, kidney and the rest share this outline.',
    'footprint.usdaPlanted':
      'USDA planted acres of {crop} in {year}: {figures}. That is the crop itself, not the ' +
      'area mapped above.',

    'stage.reading':
      'The typical gauge shows {percent} of the heat {crop} needs. {status}',
    'stage.past': 'It is past maturity.',
    'stage.short': 'It is not there yet.'
  };

  var DICT = { en: EN };

  function lang() {
    var l = (document.documentElement.lang || 'en').slice(0, 2).toLowerCase();
    return DICT[l] ? l : 'en';
  }

  /* US readers get inches and Fahrenheit; everyone else metric. Driven by the page language
     so a Spanish or Turkish build gets metric without another switch to remember. */
  function system() {
    var l = (document.documentElement.lang || 'en-US');
    return /^en(-US)?$/i.test(l) ? 'imperial' : 'metric';
  }

  function t(key, slots) {
    var s = (DICT[lang()] && DICT[lang()][key]) || EN[key] || key;
    if (!slots) return s;
    return s.replace(/\{(\w+)\}/g, function (m, name) {
      return slots[name] != null ? slots[name] : m;
    });
  }

  window.NB_TEXT = {
    t: t,
    lang: lang,
    units: function () { return UNITS[system()]; },
    system: system,
    /* A depth of water, from millimetres, in the reader's units. */
    depth: function (mm) { return UNITS[system()].depth(Math.abs(mm)); },
    /* A temperature difference, from Celsius. */
    tempDiff: function (c) { return UNITS[system()].tempDiff(c); },
    temp: function (c) { return UNITS[system()].temp(c); },
    dict: DICT
  };
})();
