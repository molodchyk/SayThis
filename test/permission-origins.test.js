import assert from "node:assert/strict";
import test from "node:test";
import {
  remotePermissionOrigins,
  staleRemotePermissionOrigins
} from "../src/permission-origins.js";

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
