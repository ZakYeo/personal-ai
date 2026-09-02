export const weatherClothingCategories = Object.freeze([
  "rain_protection",
  "insulating_outerwear",
  "warm_layer",
  "light_top",
  "short_legwear",
  "full_legwear",
  "cold_weather_accessory",
  "other",
] as const);

type WeatherClothingCategory = (typeof weatherClothingCategories)[number];

interface WeatherClothingSample {
  readonly precipitation: number;
  readonly temperature: number;
  readonly weather: string;
  readonly windSpeed: number;
}

interface WeatherClothingAssessment {
  readonly decidingMeasurements: {
    readonly maximumPrecipitation: number;
    readonly maximumWindSpeed: number;
    readonly minimumTemperature: number;
    readonly snowy: boolean;
    readonly wet: boolean;
    readonly windy: boolean;
  };
  readonly reason: string;
  readonly recommendation: "limited" | "not_recommended" | "recommended";
}

const notableWindSpeedKmH = 29;

export function assessWeatherClothing(
  category: WeatherClothingCategory,
  samples: readonly WeatherClothingSample[],
): WeatherClothingAssessment {
  if (samples.length === 0) {
    throw new Error("Weather clothing assessment requires conditions.");
  }
  const minimumTemperature = Math.min(
    ...samples.map((sample) => sample.temperature),
  );
  const maximumPrecipitation = Math.max(
    ...samples.map((sample) => sample.precipitation),
  );
  const maximumWindSpeed = Math.max(
    ...samples.map((sample) => sample.windSpeed),
  );
  const wet = samples.some(isWet);
  const snowy = samples.some((sample) =>
    /\b(?:sleet|snow)\b/iu.test(sample.weather),
  );
  const windy = maximumWindSpeed >= notableWindSpeedKmH;
  const measurements = {
    maximumPrecipitation,
    maximumWindSpeed,
    minimumTemperature,
    snowy,
    wet,
    windy,
  };

  if (category === "other") {
    return assessment(
      "limited",
      "that item is outside the bounded clothing categories",
      measurements,
    );
  }
  if (category === "rain_protection") {
    return wet
      ? assessment("recommended", "wet weather is expected", measurements)
      : assessment(
          "not_recommended",
          "conditions are expected to stay dry",
          measurements,
        );
  }
  if (category === "insulating_outerwear") {
    return minimumTemperature <= 14 || wet || snowy || windy
      ? assessment(
          "recommended",
          weatherReasons({ cool: minimumTemperature <= 14, snowy, wet, windy }),
          measurements,
        )
      : assessment(
          "not_recommended",
          "conditions are mild, dry, and not notably windy",
          measurements,
        );
  }
  if (category === "warm_layer") {
    return minimumTemperature <= 18 || windy
      ? assessment(
          "recommended",
          weatherReasons({ cool: minimumTemperature <= 18, windy }),
          measurements,
        )
      : assessment(
          "not_recommended",
          "conditions are warm and not notably windy",
          measurements,
        );
  }
  if (category === "light_top") {
    const suitable = samples.every(
      (sample) =>
        sample.temperature >= 18 && !isWet(sample) && !isWindy(sample),
    );
    return suitable
      ? assessment("recommended", "conditions are warm and dry", measurements)
      : assessment(
          "not_recommended",
          "cool, wet, or windy conditions are possible",
          measurements,
        );
  }
  if (category === "short_legwear") {
    const suitable = samples.every(
      (sample) =>
        sample.temperature >= 20 && !isWet(sample) && !isWindy(sample),
    );
    return suitable
      ? assessment("recommended", "conditions are warm and dry", measurements)
      : assessment(
          "not_recommended",
          "conditions may be below 20 degrees, wet, or windy",
          measurements,
        );
  }
  if (category === "full_legwear") {
    const suitable = samples.some(
      (sample) => sample.temperature < 20 || isWet(sample) || isWindy(sample),
    );
    return suitable
      ? assessment(
          "recommended",
          "cool, wet, or windy conditions are possible",
          measurements,
        )
      : assessment(
          "not_recommended",
          "conditions are warm and dry",
          measurements,
        );
  }

  return minimumTemperature <= 8 || snowy
    ? assessment(
        "recommended",
        weatherReasons({ cold: minimumTemperature <= 8, snowy }),
        measurements,
      )
    : assessment(
        "not_recommended",
        "conditions are above 8 degrees without snow or sleet",
        measurements,
      );
}

function assessment(
  recommendation: WeatherClothingAssessment["recommendation"],
  reason: string,
  decidingMeasurements: WeatherClothingAssessment["decidingMeasurements"],
): WeatherClothingAssessment {
  return { decidingMeasurements, reason, recommendation };
}

function isWet(sample: WeatherClothingSample): boolean {
  return (
    sample.precipitation > 0 ||
    /\b(?:rain|sleet|snow|shower|thunder)\b/iu.test(sample.weather)
  );
}

function isWindy(sample: WeatherClothingSample): boolean {
  return sample.windSpeed >= notableWindSpeedKmH;
}

function weatherReasons(input: {
  cold?: boolean;
  cool?: boolean;
  snowy?: boolean;
  wet?: boolean;
  windy?: boolean;
}): string {
  const reasons = [
    input.cold ? "cold conditions" : undefined,
    input.cool ? "cool conditions" : undefined,
    input.wet ? "wet weather" : undefined,
    input.snowy ? "snow or sleet" : undefined,
    input.windy ? "notable wind" : undefined,
  ].filter((reason): reason is string => reason !== undefined);
  return reasons.join(", ");
}
