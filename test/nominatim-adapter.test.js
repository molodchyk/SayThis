import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNominatimResult,
  buildNominatimSearchUrl,
  selectBestNominatimPlace
} from "../src/nominatim-adapter.js";

test("builds a conservative Nominatim-compatible search URL", () => {
  const url = new URL(buildNominatimSearchUrl("Athens", "https://example.com/search", {
    limit: 7,
    acceptLanguage: "el,en"
  }));

  assert.equal(url.origin, "https://example.com");
  assert.equal(url.pathname, "/search");
  assert.equal(url.searchParams.get("q"), "Athens");
  assert.equal(url.searchParams.get("format"), "jsonv2");
  assert.equal(url.searchParams.get("limit"), "7");
  assert.equal(url.searchParams.get("namedetails"), "1");
  assert.equal(url.searchParams.get("addressdetails"), "1");
  assert.equal(url.searchParams.get("extratags"), "1");
  assert.equal(url.searchParams.get("dedupe"), "1");
  assert.equal(url.searchParams.get("accept-language"), "el,en");
});

test("rejects non-https gazetteer endpoints", () => {
  assert.equal(buildNominatimSearchUrl("Athens", "http://example.com/search"), "");
});

test("selects the strongest place candidate", () => {
  const place = selectBestNominatimPlace("Springfield", [{
    name: "Springfield Mall",
    type: "retail",
    category: "shop",
    importance: 0.2
  }, {
    name: "Springfield",
    type: "city",
    category: "place",
    importance: 0.7,
    osm_type: "relation",
    osm_id: "123"
  }]);

  assert.equal(place.osm_id, "123");
});

test("builds a structured place result with local source form", () => {
  const result = buildNominatimResult("Athens", [{
    place_id: 1,
    osm_type: "relation",
    osm_id: "1370736",
    name: "Athens",
    display_name: "Athens, Municipality of Athens, Greece",
    category: "boundary",
    type: "administrative",
    importance: 0.9,
    address: {
      city: "Athens",
      country: "Greece",
      country_code: "gr"
    },
    namedetails: {
      name: "Αθήνα",
      "name:en": "Athens",
      "name:el": "Αθήνα",
      official_name: "Δήμος Αθηναίων"
    }
  }]);

  assert.equal(result.id, "nominatim:relation/1370736");
  assert.equal(result.sourceForm, "Αθήνα");
  assert.deepEqual(result.aliases, ["Δήμος Αθηναίων"]);
  assert.equal(result.language, "el");
  assert.equal(result.sourceStatus, "structured-source");
  assert.equal(result.category, "place");
  assert.equal(result.alternateResults.length, 1);
  assert.equal(result.alternateResults[0].sourceForm, "Athens");
  assert.equal(result.alternateResults[0].language, "en");
  assert.ok(result.origin.includes("Greece"));
  assert.ok(result.evidence.some((item) => item.includes("Nominatim-compatible")));
  assert.ok(result.sources.some((source) => source.url === "https://www.openstreetmap.org/relation/1370736"));
  assert.ok(result.sources.some((source) => source.label.includes("attribution")));
});
