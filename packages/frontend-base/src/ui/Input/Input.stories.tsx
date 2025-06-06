import type { Story, StoryDefault } from "@ladle/react";
import { type ChangeEventHandler, useCallback, useState } from "react";
import type {
  DateRange,
  SelectRangeEventHandler,
  SelectSingleEventHandler,
} from "react-day-picker";
import { Info, Search } from "react-feather";

import { Input } from ".";

export default {
  title: "ui/input",
} satisfies StoryDefault;

export const OnlyInput: Story = () => <Input placeholder="Only input" />;
export const Password: Story = () => (
  <Input.Password placeholder="Password input" />
);

export const Phone: Story = () => <Input.Phone />;

export const Composition: Story = () => {
  const [search, setSearch] = useState("");
  const onChange = useCallback<ChangeEventHandler<HTMLInputElement>>(() => {
    setSearch("something");
  }, []);

  return (
    <Input.Root hasError={Boolean(search)}>
      <Input.Label label="Example" htmlFor="my-input">
        <Info size="16" />
      </Input.Label>

      <Input
        placeholder="Type something to show error message"
        onChange={onChange}
        id="my-input"
      >
        <Input.Slot>
          <Search size="16" />
        </Input.Slot>
      </Input>

      <Input.Message message={search} />
    </Input.Root>
  );
};

export const SingleDateInput: Story = () => {
  const [dateSelected, setDateSelected] = useState<Date | undefined>(
    new Date(),
  );

  const handleSelect: SelectSingleEventHandler = useCallback((date) => {
    setDateSelected(date);
  }, []);

  return (
    <Input.Date
      dayPickerProps={{
        mode: "single",
        selected: dateSelected,
        onSelect: handleSelect,
      }}
    />
  );
};

export const RangeDateInput: Story = () => {
  const [dateRangeSelected, setDateRangeSelected] = useState<
    DateRange | undefined
  >();

  const handleSelect: SelectRangeEventHandler = useCallback((rangeDate) => {
    setDateRangeSelected(rangeDate);
  }, []);

  return (
    <Input.Date
      dayPickerProps={{
        mode: "range",
        selected: dateRangeSelected,
        onSelect: handleSelect,
      }}
    />
  );
};

export const TimeInput: Story = () => {
  const [value, setValue] = useState("08:00");

  return <Input.Time value={value} onChange={setValue} />;
};
