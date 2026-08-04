import type {
  WeatherLocation,
  WeatherLocationCandidate,
} from "../../ports/weather.js";

type WeatherLocationSelection =
  | { kind: "selected"; location: WeatherLocation }
  | {
      candidates: readonly WeatherLocationCandidate[];
      kind: "ambiguous";
    };

export function selectWeatherLocation(
  place: string,
  candidates: readonly WeatherLocationCandidate[],
  policy: "ranked" | "unique",
): WeatherLocationSelection {
  const qualified = candidates.filter((candidate) =>
    matchesQualifiedPlace(place, candidate),
  );
  const exact = candidates.filter((candidate) =>
    matchesUnqualifiedPlace(place, candidate),
  );
  const eligible =
    qualified.length > 0 ? qualified : exact.length > 0 ? exact : candidates;
  const ranked = [...eligible].sort(
    (left, right) => left.providerRank - right.providerRank,
  );

  if (ranked.length === 0) {
    return { candidates: [], kind: "ambiguous" };
  }
  if (ranked.length === 1 || policy === "ranked") {
    return { kind: "selected", location: ranked[0]!.location };
  }
  return { candidates: ranked, kind: "ambiguous" };
}

function matchesUnqualifiedPlace(
  place: string,
  candidate: WeatherLocationCandidate,
): boolean {
  const requested = normalize(place);
  return (
    requested === normalize(candidate.searchName) ||
    requested === normalize(candidate.location.name)
  );
}

function matchesQualifiedPlace(
  place: string,
  candidate: WeatherLocationCandidate,
): boolean {
  const requested = normalize(place);
  const names = [candidate.searchName, candidate.location.name];
  const countryQualifiers = [
    candidate.countryName,
    candidate.location.countryCode,
    countryInitials(candidate.countryName),
  ];
  return names.some((name) =>
    countryQualifiers.some(
      (qualifier) =>
        requested === normalize(`${name} ${qualifier}`) &&
        normalize(qualifier).length > 0,
    ),
  );
}

function countryInitials(countryName: string): string {
  return countryName
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((part) => part[0])
    .join("");
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
