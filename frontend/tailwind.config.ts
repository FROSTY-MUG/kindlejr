import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: "#0047AB",
          darkNavy: "#0A192F",
          geuOrange: "#F26522",
          geuBlue: "#1B365D",
          cloud: "#F8FAFC",
        },
      },
      backgroundImage: {
        "cloud-pattern": "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.8) 0%, rgba(240,244,248,0.5) 100%)",
      },
    },
  },
  plugins: [],
};
export default config;
