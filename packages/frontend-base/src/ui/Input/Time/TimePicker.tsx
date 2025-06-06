import { useTime } from "../../../hooks/useTime";
import type { Time, TimePeriod } from "../../../types";
import styles from "../Input.module.css";

type TimePickerProps = Partial<Time> & {
  onChangeHour?: (hour: number) => void;
  onChangeMinute?: (minute: number) => void;
  onChangePeriod?: (period: TimePeriod) => void;
};

export const TimePicker = (props: TimePickerProps) => {
  const { getHourOptions, getMinuteOptions, getPeriodOptions } = useTime();

  const hours = getHourOptions();
  const minutes = getMinuteOptions();
  const periods = getPeriodOptions();

  return (
    <div className={styles.timePickerContainer}>
      <div className={styles.timeOptionsContainer}>
        {hours.map((hour) => (
          <button
            type="button"
            data-is-selected={hour === props.hour}
            key={`${hour}-hour`}
            aria-label={`${hour} hours`}
            className={styles.timeOption}
            onClick={() => props.onChangeHour?.(hour)}
          >
            {hour}
          </button>
        ))}
      </div>
      <div className={styles.timeOptionsContainer}>
        {minutes.map((minute) => (
          <button
            type="button"
            data-is-selected={minute === props.minute}
            key={`${minute}-minute`}
            aria-label={`${minute} minutes`}
            className={styles.timeOption}
            onClick={() => props.onChangeMinute?.(minute)}
          >
            {minute}
          </button>
        ))}
      </div>
      <div className={styles.timeOptionsContainer}>
        {periods.map((period) => (
          <button
            type="button"
            data-is-selected={period === props.period}
            key={`${period}-period`}
            aria-label={period}
            className={styles.timeOption}
            onClick={() => props.onChangePeriod?.(period)}
          >
            {period}
          </button>
        ))}
      </div>
    </div>
  );
};
