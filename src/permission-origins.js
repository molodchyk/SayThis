import {
  endpointOriginPattern
} from "./community-sync.js";
import {
  FORVO_API_ORIGIN
} from "./sources/forvo-adapter.js";

export function remotePermissionOrigins(settings = {}, credentials = {}) {
  const origins = [];
  addOrigin(origins, settings.customSourceEnabled, settings.customSourceEndpoint);
  addOrigin(origins, settings.dbpediaEnabled, settings.dbpediaEndpoint);
  addOrigin(origins, settings.forvoEnabled && credentials.forvoApiKey, FORVO_API_ORIGIN);
  addOrigin(origins, settings.gazetteerEnabled, settings.gazetteerEndpoint);
  addOrigin(origins, settings.communitySyncEnabled || settings.communityPullEnabled, settings.communityEndpoint);

  return [...new Set(origins)];
}

export function staleRemotePermissionOrigins(
  previousSettings = {},
  nextSettings = {},
  previousCredentials = {},
  nextCredentials = {}
) {
  const previous = remotePermissionOrigins(previousSettings, previousCredentials);
  const next = new Set(remotePermissionOrigins(nextSettings, nextCredentials));
  return previous.filter((origin) => !next.has(origin));
}

function addOrigin(origins, enabled, endpoint) {
  if (!enabled) {
    return;
  }

  const origin = endpointOriginPattern(endpoint);
  if (origin) {
    origins.push(origin);
  }
}
