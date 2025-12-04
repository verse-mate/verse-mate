import type { Story, StoryDefault } from "@ladle/react";
import { useState } from "react";

import { OrDivider, SSOButtons } from ".";
import { AuthWrapper } from "../Wrapper";

export default {
  title: "auth/SSOButtons",
} satisfies StoryDefault;

export const Default: Story = () => {
  return (
    <AuthWrapper>
      <SSOButtons
        onGoogleClick={() => console.log("Google clicked")}
        onAppleClick={() => console.log("Apple clicked")}
      />
    </AuthWrapper>
  );
};

export const Loading: Story = () => {
  return (
    <AuthWrapper>
      <SSOButtons
        onGoogleClick={() => {}}
        onAppleClick={() => {}}
        isLoading={true}
        loadingProvider="google"
      />
    </AuthWrapper>
  );
};

export const AppleLoading: Story = () => {
  return (
    <AuthWrapper>
      <SSOButtons
        onGoogleClick={() => {}}
        onAppleClick={() => {}}
        isLoading={true}
        loadingProvider="apple"
      />
    </AuthWrapper>
  );
};

export const Interactive: Story = () => {
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<"google" | "apple" | null>(null);

  const handleClick = (p: "google" | "apple") => {
    setLoading(true);
    setProvider(p);
    // Simulate loading for 2 seconds
    setTimeout(() => {
      setLoading(false);
      setProvider(null);
    }, 2000);
  };

  return (
    <AuthWrapper>
      <SSOButtons
        onGoogleClick={() => handleClick("google")}
        onAppleClick={() => handleClick("apple")}
        isLoading={loading}
        loadingProvider={provider}
      />
    </AuthWrapper>
  );
};

export const WithDivider: Story = () => {
  return (
    <AuthWrapper>
      <div style={{ width: "100%", maxWidth: "400px" }}>
        <SSOButtons
          onGoogleClick={() => console.log("Google clicked")}
          onAppleClick={() => console.log("Apple clicked")}
        />
        <div style={{ marginTop: "16px" }}>
          <OrDivider />
        </div>
      </div>
    </AuthWrapper>
  );
};

export const DividerOnly: Story = () => {
  return (
    <AuthWrapper>
      <div style={{ width: "100%", maxWidth: "400px" }}>
        <OrDivider />
      </div>
    </AuthWrapper>
  );
};
