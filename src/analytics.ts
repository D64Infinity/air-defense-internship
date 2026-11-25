
type Params = Record<string, string | number | boolean>;

type Metrika = (
  id: number,
  method: "reachGoal",
  goal: string,
  params?: Params
) => void;

declare global {
  interface Window {
    ym?: Metrika;
  }
}

const COUNTER_ID = 114661726;
const GAME_VERSION = "0.5.0";

export function track(
  event: string,
  params: Params = {}
): void {
  const data = {
    ...params,
    game_version: GAME_VERSION,
  };

  if (import.meta.env.DEV) {
    console.log("[analytics]", event, data);
  }

  if (typeof window === "undefined") return;

  const ym = window.ym;

  if (typeof ym !== "function") return;

  try {
    ym(COUNTER_ID, "reachGoal", event, data);
  } catch (error) {
    console.warn("[analytics] Error:", error);
  }
}
