export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0F1117",
        surface: "#1A1D27",
        border: "#2A2D3A",
        green: "#22C55E",
        yellow: "#EAB308",
        red: "#EF4444",
        indigo: "#6366F1",
        textprimary: "#F1F5F9",
        textsecondary: "#64748B",
      },
      fontFamily: {
        display: ["Sora", "sans-serif"],
        body: ["DM Sans", "sans-serif"],
      },
    },
  },
  plugins: [],
}
