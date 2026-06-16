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
  normalizeSettings,
  normalizeShortText,
  onlineCacheScope
} from "../src/shared/settings.js";

test("collects optional remote permission origins", () => {
  assert.deepEqual(remotePermissionOrigins({
    customSourceEnabled: true,
    customSourceEndpoint: "https://packs.example/search?set=terms",
    forvoEnabled: true,
    gazetteerEnabled: true,
    gazetteerEndpoint: "http://maps.example/search",
    communityPullEnabled: true,
    communityEndpoint: "https://community.example/saythis"
  }, {
    forvoApiKey: "key"
  }), [
    "https://packs.example/*",
    "https://apifree.forvo.com/*",
    "https://community.example/*"
  ]);
});

test("finds stale optional remote permission origins", () => {
  const previousSettings = {
    customSourceEnabled: true,
    customSourceEndpoint: "https://packs.example/old",
    forvoEnabled: true,
    gazetteerEnabled: true,
    gazetteerEndpoint: "https://maps.example/search",
    communitySyncEnabled: true,
    communityEndpoint: "https://community.example/submit"
  };
  const nextSettings = {
    customSourceEnabled: true,
    customSourceEndpoint: "https://packs.example/new",
    forvoEnabled: false,
    gazetteerEnabled: false,
    communityPullEnabled: true,
    communityEndpoint: "https://community.example/approved"
  };

  assert.deepEqual(staleRemotePermissionOrigins(previousSettings, nextSettings, {
    forvoApiKey: "key"
  }, {
    forvoApiKey: "key"
  }), [
    "https://apifree.forvo.com/*",
    "https://maps.example/*"
  ]);
});

test("normalizes extension settings and credentials from one module", () => {
  const settings = normalizeSettings({
    onlineByDefault: "yes",
    showOverlay: false,
    autoSpeakPopup: false,
    customSourceEnabled: true,
    customSourceEndpoint: " https://packs.example/search?set=terms ",
    customSourceLabel: " Curated   terms ",
    forvoEnabled: true,
    forvoLanguage: "PT_BR",
    gazetteerEnabled: true,
    gazetteerEndpoint: "http://maps.example/search",
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
  assert.equal(settings.customSourceEnabled, true);
  assert.equal(settings.customSourceEndpoint, "https://packs.example/search?set=terms");
  assert.equal(settings.customSourceLabel, "Curated terms");
  assert.equal(settings.forvoEnabled, true);
  assert.equal(settings.forvoLanguage, "pt-br");
  assert.equal(settings.gazetteerEnabled, false);
  assert.equal(settings.communitySyncEnabled, true);
  assert.equal(settings.communityPullEnabled, true);
  assert.equal(credentials.forvoApiKey, "keywithspaces");
  assert.equal(normalizeHttpsEndpoint("http://example.com"), "");
  assert.equal(normalizeApiKey(" a b "), "ab");
  assert.equal(normalizeShortText(` ${"a".repeat(90)} `).length, 80);
  assert.equal(normalizeLanguageCode("EN_us"), "en-us");
  assert.equal(onlineCacheScope(settings, credentials), "custom https://packs.example/search?set=terms forvo pt-br");
});
