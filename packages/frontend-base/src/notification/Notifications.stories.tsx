import type { Story, StoryDefault } from "@ladle/react";
import { type CSSProperties, useState } from "react";

import { Button, Input } from "../..";
import { Checkbox, type CheckboxProps } from "../ui/Checkbox/Checkbox";
import { RadioGroup } from "../ui/RadioGroup";
import { Text } from "../ui/Text/Text";
import { Notifications } from "./NotificationContainer";
import { addNotification, removeAllNotifications } from "./store";
import type { NotificationProps } from "./types";

export default {
  title: "notifications",
} satisfies StoryDefault;

const messages = [
  "🐾 So easy!",
  "🦄 That's amazing!",
  "⛄ Wow so easy!",
  "🐟 Gloob gloob.",
];

type Colors = "success" | "error" | "amazing";

const colorsMap: { [key in Colors]: string } = {
  amazing: "var(--pink-5)",
  success: "var(--success)",
  error: "var(--error)",
};

const Content = ({ color }: { color: string }) => {
  const message = messages[Math.floor(Math.random() * messages.length)];
  return (
    <Text color={color} weight={"bold"}>
      {message}
    </Text>
  );
};

const stylesWrapper: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

const stylesRow: CSSProperties = {
  display: "flex",
  gap: "1rem",
  alignItems: "center",
};

export const Default: Story = () => {
  const [disableAutoClose, setDisableAutoClose] =
    useState<CheckboxProps["checked"]>(false);
  const [selectedColor, setSelectedColor] = useState<Colors>("amazing");
  const [selectedAppearance, setSelectedAppearance] =
    useState<NotificationProps["appearance"]>("discreet");
  const [autoCloseDelay, setAutoCloseDelay] = useState(3000);

  return (
    <>
      <div style={stylesWrapper}>
        <RadioGroup
          value={selectedColor}
          onValueChange={(value) => setSelectedColor(value as Colors)}
        >
          <Text>Color</Text>

          <RadioGroup.Item value="amazing">Amazing</RadioGroup.Item>
          <RadioGroup.Item value="success">Success</RadioGroup.Item>
          <RadioGroup.Item value="error">Error</RadioGroup.Item>
        </RadioGroup>

        <RadioGroup
          value={selectedAppearance}
          onValueChange={(value) =>
            setSelectedAppearance(value as NotificationProps["appearance"])
          }
        >
          <Text>Appearance</Text>

          <RadioGroup.Item value="discreet">Discreet</RadioGroup.Item>
          <RadioGroup.Item value="outline">Outline</RadioGroup.Item>
        </RadioGroup>

        <div style={stylesRow}>
          <Button
            onClick={() => {
              addNotification({
                content: <Content color={colorsMap[selectedColor]} />,
                color: colorsMap[selectedColor],
                disableAutoClose: Boolean(disableAutoClose),
                autoCloseDelay,
                appearance: selectedAppearance,
              });
            }}
          >
            Toast
          </Button>
          <Button onClick={removeAllNotifications}>Clear all</Button>

          <Checkbox
            id="notify-disable-auto-close"
            checked={disableAutoClose}
            onCheckedChange={setDisableAutoClose}
          >
            Disable auto close
          </Checkbox>
        </div>

        <Input.Root>
          <Input.Label label="Auto close duration (ms)" />
          <Input
            disabled={Boolean(disableAutoClose)}
            type="number"
            onChange={({ target }) => setAutoCloseDelay(Number(target.value))}
          />
        </Input.Root>
      </div>

      <Notifications />
    </>
  );
};
