export type Shape = "rounded" | "square" | "soft";

export type TimePeriod = "AM" | "PM";

export type Time = {
  hour: number;
  minute: number;
  period: TimePeriod;
};
