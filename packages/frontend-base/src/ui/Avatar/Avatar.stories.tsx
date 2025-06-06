import type { Story, StoryDefault } from "@ladle/react";
import { type ChangeEvent, useCallback, useState } from "react";

import { Avatar } from "./";

export default {
  title: "ui/avatar",
} satisfies StoryDefault;

export const Composition: Story = () => (
  <Avatar size={"md"} fallback={"AB"} outline>
    <Avatar.Badge color="success" outline="outline" size="sm" />
  </Avatar>
);
Composition.storyName = "Avatar Composition";

export const Image: Story = () => (
  <Avatar fallback="AZ" src="https://i.pravatar.cc/400?img=37" format="soft" />
);
Image.storyName = "Avatar With Image";

export const Fallback: Story = () => (
  <Avatar
    fallback="AZ"
    src="https://i.pravatar.cc/400?img=372222"
    format="square"
  />
);
Fallback.storyName = "Avatar Fallback";

export const Upload: Story = () => {
  const [url, setUrl] = useState("https://i.pravatar.cc/400?img=37");
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      e.preventDefault();

      const image = e.target.files?.[0];

      const newUrl = URL.createObjectURL(image as Blob);

      if (url) {
        setUrl(newUrl);
      }
    },
    [url],
  );

  return (
    <Avatar fallback="AZ" src={url} size="2xl">
      <Avatar.Upload
        id="upload-story-example"
        accept="image/jpeg, image/png, image/jpg"
        onChange={handleChange}
      />
    </Avatar>
  );
};
Upload.storyName = "Avatar Upload";
