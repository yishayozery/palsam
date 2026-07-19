import { defineConfig } from "vitest/config";
import path from "path";

// Smoke/unit tests — לוגיקה טהורה בלבד (בלי DB/רשת). ריצה: npm test
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // server-only הוא no-op בסביבת node (זורק רק ב-bundle לקליינט) — ממפים לריק לבטיחות
      "server-only": path.resolve(__dirname, "test/stubs/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globals: true,
  },
});
