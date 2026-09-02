export type WeatherClothingAdviceGoal =
  | {
      readonly item: string;
      readonly kind: "assess_item";
    }
  | {
      readonly kind: "recommend_outfit";
      readonly occasion?: string;
    };

interface WeatherClothingCondition {
  readonly at: string;
  readonly precipitation: number;
  readonly temperature: number;
  readonly weather: string;
  readonly windSpeed: number;
}

export interface WeatherClothingAdviceRequest {
  readonly conditions: readonly WeatherClothingCondition[];
  readonly goal: WeatherClothingAdviceGoal;
  readonly units: {
    readonly precipitation: "mm";
    readonly temperature: "celsius";
    readonly windSpeed: "km/h";
  };
}

export type WeatherClothingAdvice =
  | {
      readonly kind: "item_assessment";
      readonly recommendation: "not_recommended" | "recommended" | "uncertain";
    }
  | {
      readonly items: readonly string[];
      readonly kind: "outfit_recommendation";
    };

export interface WeatherClothingAdvisorPort {
  advise(
    request: WeatherClothingAdviceRequest,
    options?: { readonly signal?: AbortSignal },
  ): Promise<WeatherClothingAdvice>;
}
