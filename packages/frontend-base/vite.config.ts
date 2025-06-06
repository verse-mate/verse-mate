import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(() => ({
  define: {
    "import.meta.env.API_URL": JSON.stringify("http://localhost:3000"),
  },
  plugins: [react()],
  publicDir: "public",
}));
