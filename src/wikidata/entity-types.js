const ENTITY_TYPE_BY_ID = {
  Q5: { category: "person", label: "person", score: 10 },
  Q4167410: { category: "disambiguation", label: "disambiguation", score: -60 },
  Q4167836: { category: "metadata", label: "Wikimedia category", score: -35 },
  Q16521: { category: "scientific term", label: "taxon", score: 9 },
  Q8054: { category: "scientific term", label: "protein", score: 8 },
  Q7187: { category: "scientific term", label: "gene", score: 8 },
  Q20747295: { category: "scientific term", label: "protein-coding gene", score: 8 },
  Q2996394: { category: "scientific term", label: "biological process", score: 6 },
  Q11173: { category: "scientific term", label: "chemical compound", score: 7 },
  Q79529: { category: "scientific term", label: "chemical substance", score: 7 },
  Q12136: { category: "medical term", label: "disease", score: 7 },
  Q4936952: { category: "medical term", label: "anatomical structure", score: 6 },
  Q8366: { category: "technical term", label: "algorithm", score: 6 },
  Q9143: { category: "technical term", label: "programming language", score: 6 },
  Q7397: { category: "technical term", label: "computer program", score: 5 },
  Q1936384: { category: "academic term", label: "branch of mathematics", score: 6 },
  Q20026918: { category: "academic term", label: "mathematical theory", score: 6 },
  Q65943: { category: "academic term", label: "theorem", score: 6 },
  Q11862829: { category: "academic term", label: "academic discipline", score: 5 },
  Q515: { category: "place", label: "city", score: 10 },
  Q532: { category: "place", label: "village", score: 10 },
  Q3957: { category: "place", label: "town", score: 10 },
  Q486972: { category: "place", label: "human settlement", score: 9 },
  Q6256: { category: "place", label: "country", score: 9 },
  Q56061: { category: "place", label: "administrative area", score: 8 },
  Q82794: { category: "place", label: "geographic region", score: 8 },
  Q8502: { category: "place", label: "mountain", score: 8 },
  Q4022: { category: "place", label: "river", score: 8 },
  Q23442: { category: "place", label: "island", score: 8 },
  Q43229: { category: "organization", label: "organization", score: 7 },
  Q4830453: { category: "organization", label: "business", score: 7 },
  Q3918: { category: "organization", label: "university", score: 7 },
  Q11424: { category: "creative title", label: "film", score: 5 },
  Q5398426: { category: "creative title", label: "series", score: 5 },
  Q7725634: { category: "creative title", label: "literary title", score: 5 },
  Q101352: { category: "name", label: "family name", score: 4 },
  Q202444: { category: "name", label: "given name", score: 4 },
  Q1969448: { category: "concept", label: "term", score: 4 }
};
const ENTITY_DOMAIN_BY_ID = {
  Q395: { category: "academic term", label: "mathematics", score: 7 },
  Q21198: { category: "technical term", label: "computer science", score: 7 },
  Q420: { category: "scientific term", label: "biology", score: 6 },
  Q2329: { category: "scientific term", label: "chemistry", score: 6 },
  Q413: { category: "scientific term", label: "physics", score: 6 },
  Q11190: { category: "medical term", label: "medicine", score: 6 },
  Q1071: { category: "place", label: "geography", score: 5 },
  Q8162: { category: "academic term", label: "linguistics", score: 5 }
};
const ENTITY_TYPE_PRIORITY = [
  "Q4167410", "Q4167836", "Q5", "Q515", "Q532", "Q3957", "Q486972",
  "Q6256", "Q56061", "Q82794", "Q8502", "Q4022", "Q23442", "Q16521",
  "Q8054", "Q7187", "Q20747295", "Q2996394", "Q11173", "Q79529", "Q12136",
  "Q4936952", "Q8366", "Q9143", "Q7397", "Q1936384", "Q20026918", "Q65943",
  "Q11862829", "Q43229", "Q4830453", "Q3918", "Q11424", "Q5398426",
  "Q7725634", "Q101352", "Q202444", "Q1969448"
];
const ENTITY_DOMAIN_PROPERTIES = {
  P101: "field of work",
  P921: "main subject",
  P2579: "studied by"
};
const EMPTY_ENTITY_TYPE = { category: "", label: "", score: 0 };

export function wikidataEntityType(entity) {
  const type = wikidataTypeSignal(entity);
  if (["disambiguation", "metadata"].includes(type.category)) {
    return type;
  }

  const domain = wikidataDomainSignal(entity);
  if (!type.label || type.category === "concept") {
    return domain || type;
  }

  return type;
}

function wikidataTypeSignal(entity) {
  const ids = entityClaimIds(entity, "P31", "P279");
  for (const id of ENTITY_TYPE_PRIORITY) {
    if (ids.includes(id)) {
      return ENTITY_TYPE_BY_ID[id];
    }
  }

  return EMPTY_ENTITY_TYPE;
}

function wikidataDomainSignal(entity) {
  const signals = [];

  for (const [propertyId, source] of Object.entries(ENTITY_DOMAIN_PROPERTIES)) {
    for (const id of entityClaimIds(entity, propertyId)) {
      const signal = ENTITY_DOMAIN_BY_ID[id];
      if (signal) {
        signals.push({ ...signal, source });
      }
    }
  }

  return signals.sort((left, right) => right.score - left.score)[0] || null;
}

function entityClaimIds(entity, ...propertyIds) {
  const ids = [];
  const seen = new Set();

  for (const propertyId of propertyIds) {
    for (const claim of entity?.claims?.[propertyId] || []) {
      const id = entityIdFromClaimValue(claim?.mainsnak?.datavalue?.value);
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }

  return ids;
}

function entityIdFromClaimValue(value) {
  if (typeof value?.id === "string" && /^Q\d+$/.test(value.id)) {
    return value.id;
  }

  const numericId = Number(value?.["numeric-id"]);
  return Number.isInteger(numericId) && numericId > 0 ? `Q${numericId}` : "";
}
