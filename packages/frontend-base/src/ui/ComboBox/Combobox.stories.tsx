import type { Story, StoryDefault } from "@ladle/react";
import { useState } from "react";

import { Combobox, type ComboboxProps } from "./Combobox";

export default {
  title: "ui/Combobox",
} satisfies StoryDefault;

interface Example {
  label: string;
  value: string;
}

const options: ComboboxProps<Example>["options"] = [
  {
    label: "1",
    value: "value-1",
  },
  {
    label: "2",
    value: "value-2",
  },
];

export const Default: Story = () => {
  const [optionSelected, setOptionSelected] = useState(options[0]);

  return (
    <Combobox<Example>
      labelKey="label"
      valueKey="value"
      options={options}
      value={optionSelected?.value}
      onChangeValue={(data) => {
        console.log({ data });
        setOptionSelected(data);
      }}
    />
  );
};
