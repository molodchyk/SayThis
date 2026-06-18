import assert from "node:assert/strict";
import test from "node:test";
import {
  remotePermissionOrigins,
  staleRemotePermissionOrigins
} from "../src/permission-origins.js";
import {
  normalizeApiKey,
  normalizeCredentials,
  normalizeHttpsEndpoint,
  normalizeLanguageCode,
  normalizeLanguageHints,
  normalizeSettings,
  normalizeShortText,
  onlineCacheScope
} from "../src/shared/settings.js";

test("collects optional remote permission origins", () => {
  assert.deepEqual(remotePermissionOrigins({
    customSourceEnabled: true,
    customSourceEndpoint: "https://packs.example/search?set=terms",
    dbpediaEnabled: true,
    dbpediaEndpoint: "https://lookup.example/api/search",
    forvoEnabled: true,
    gazetteerEnabled: true,
    gazetteerEndpoint: "http://maps.example/search",
    voiceServiceEnabled: true,
    voiceServiceUrlTemplate: "https://voice.example/speak?text={text}&lang={lang}",
    communityPullEnabled: true,
    communityEndpoint: "https://community.example/saythis"
  }, {
    forvoApiKey: "key"
  }), [
    "https://packs.example/*",
    "https://lookup.example/*",
    "https://apifree.forvo.com/*",
    "https://voice.example/*",
    "https://community.example/*"
  ]);
});

test("finds stale optional remote permission origins", () => {
  const previousSettings = {
    customSourceEnabled: true,
    customSourceEndpoint: "https://packs.example/old",
    dbpediaEnabled: true,
    dbpediaEndpoint: "https://lookup.example/old",
    forvoEnabled: true,
    gazetteerEnabled: true,
    gazetteerEndpoint: "https://maps.example/search",
    voiceServiceEnabled: true,
    voiceServiceUrlTemplate: "https://voice.example/speak?text={text}",
    communitySyncEnabled: true,
    communityEndpoint: "https://community.example/submit"
  };
  const nextSettings = {
    customSourceEnabled: true,
    customSourceEndpoint: "https://packs.example/new",
    dbpediaEnabled: true,
    dbpediaEndpoint: "https://lookup.example/new",
    forvoEnabled: false,
    gazetteerEnabled: false,
    voiceServiceEnabled: false,
    communityPullEnabled: true,
    communityEndpoint: "https://community.example/approved"
  };

  assert.deepEqual(staleRemotePermissionOrigins(previousSettings, nextSettings, {
    forvoApiKey: "key"
  }, {
    forvoApiKey: "key"
  }), [
    "https://apifree.forvo.com/*",
    "https://maps.example/*",
    "https://voice.example/*"
  ]);
});

test("normalizes extension settings and credentials from one module", () => {
  const settings = normalizeSettings({
    onlineByDefault: "yes",
    showOverlay: false,
    autoSpeakPopup: false,
    lookupLanguageHints: " pl, PT_BR; invalid!, ja, pl ",
    customSourceEnabled: true,
    customSourceEndpoint: " https://packs.example/search?set=terms ",
    customSourceLabel: " Curated   terms ",
    dbpediaEnabled: true,
    dbpediaEndpoint: " https://lookup.example/api/search ",
    forvoEnabled: true,
    forvoLanguage: "PT_BR",
    gazetteerEnabled: true,
    gazetteerEndpoint: "http://maps.example/search",
    voiceServiceEnabled: true,
    voiceServiceUrlTemplate: " https://voice.example/speak?text={text}&lang={lang} ",
    voiceServiceLabel: " Example   voice ",
    communitySyncEnabled: true,
    communityPullEnabled: true,
    communityEndpoint: "https://community.example/saythis"
  });
  const credentials = normalizeCredentials({
    forvoApiKey: " key  with spaces "
  });

  assert.equal(settings.onlineByDefault, true);
  assert.equal(settings.showOverlay, false);
  assert.equal(settings.autoSpeakPopup, false);
  assert.deepEqual(settings.lookupLanguageHints, ["pl", "pt", "ja"]);
  assert.equal(settings.customSourceEnabled, true);
  assert.equal(settings.customSourceEndpoint, "https://packs.example/search?set=terms");
  assert.equal(settings.customSourceLabel, "Curated terms");
  assert.equal(settings.dbpediaEnabled, true);
  assert.equal(settings.dbpediaEndpoint, "https://lookup.example/api/search");
  assert.equal(settings.forvoEnabled, true);
  assert.equal(settings.forvoLanguage, "pt-br");
  assert.equal(settings.gazetteerEnabled, false);
  assert.equal(settings.voiceServiceEnabled, true);
  assert.equal(settings.voiceServiceUrlTemplate, "https://voice.example/speak?text={text}&lang={lang}");
  assert.equal(settings.voiceServiceLabel, "Example voice");
  assert.equal(settings.communitySyncEnabled, true);
  assert.equal(settings.communityPullEnabled, true);
  assert.equal(credentials.forvoApiKey, "keywithspaces");
  assert.equal(normalizeHttpsEndpoint("http://example.com"), "");
  assert.equal(normalizeApiKey(" a b "), "ab");
  assert.equal(normalizeShortText(` ${"a".repeat(90)} `).length, 80);
  assert.equal(normalizeLanguageCode("EN_us"), "en-us");
  assert.deepEqual(normalizeLanguageHints(["EN-us", "pl", "en", "bad!"]), ["en", "pl"]);
  assert.equal(onlineCacheScope(settings, credentials), "wikidata pl,pt,ja custom https://packs.example/search?set=terms dbpedia https://lookup.example/api/search forvo pt-br voice https://voice.example/speak?text={text}&lang={lang}");
});
