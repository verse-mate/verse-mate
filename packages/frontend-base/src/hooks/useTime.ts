import type { Time, TimePeriod } from "../types";

function getHourOptions(): number[] {
  return [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
}

function getMinuteOptions(): number[] {
  return Array.from({ length: 60 }, (_, i) => i).reverse();
}

function getPeriodOptions(): TimePeriod[] {
  return ["AM", "PM"];
}

function validateTimeStringFormat(time: unknown): boolean {
  return (
    typeof time === "string" &&
    time.length === 5 &&
    time.includes(":") &&
    !Number.isNaN(Number(time.slice(0, 2))) &&
    !Number.isNaN(Number(time.slice(3, 5))) &&
    Number(time.slice(0, 2)) >= 0 &&
    Number(time.slice(0, 2)) < 24 &&
    Number(time.slice(3, 5)) >= 0 &&
    Number(time.slice(3, 5)) < 60
  );
}

function parseTimeString(time: unknown): Time {
  if (!validateTimeStringFormat(time)) {
    return {
      hour: 0,
      minute: 0,
      period: "AM",
    };
  }

  const [hour, minute] = (time as string).toString().split(":").map(Number);
  const period = hour > 11 ? "PM" : "AM";

  return {
    hour: (() => {
      if (hour === 0 && period === "AM") {
        return 12;
      }

      return period === "PM" && hour > 12 ? hour - 12 : hour;
    })(),
    minute,
    period,
  };
}

function formatTimeTo24Hour({ hour, minute, period }: Time): string {
  const hourFormatted = (() => {
    if (hour === 12 && period === "AM") {
      return "00";
    }

    return (period === "PM" && hour < 12 ? hour + 12 : hour)
      .toString()
      .padStart(2, "0");
  })();
  const minuteFormatted = minute.toString().padStart(2, "0");

  return `${hourFormatted}:${minuteFormatted}`;
}

function formatTimeTo12Hour({ hour, minute, period }: Time): string {
  return `${hour.toString().padStart(2, "0")}:${minute
    .toString()
    .padStart(2, "0")} ${period}`;
}

export function useTime() {
  return {
    getHourOptions,
    getMinuteOptions,
    getPeriodOptions,
    validateTimeStringFormat,
    parseTimeString,
    formatTimeTo24Hour,
    formatTimeTo12Hour,
  };
}
