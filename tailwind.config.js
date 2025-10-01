/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",              // 👈 Add this
    "./src/**/*.{js,jsx,ts,tsx}" // 👈 Ensure jsx & tsx are covered
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
