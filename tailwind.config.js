/** @type {import('tailwindcss').Config} */

// El color de acento y la fuente de títulos los define cada cliente (src/app/config/clientes/*.ts)
// como variables CSS, que se aplican al arrancar la app (aplicarCliente).
const acento = (tono) => `rgb(var(--acento-${tono}) / <alpha-value>)`;

module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
        display: ['var(--fuente-display)'],
      },
      colors: {
        acento: {
          50: acento(50),
          100: acento(100),
          200: acento(200),
          300: acento(300),
          400: acento(400),
          500: acento(500),
          600: acento(600),
          700: acento(700),
          800: acento(800),
          900: acento(900),
        },
        // Toques de detalle (dorado en El Acicale): etiquetas, líneas, insignias
        detalle: {
          200: 'rgb(var(--detalle-200) / <alpha-value>)',
          300: 'rgb(var(--detalle-300) / <alpha-value>)',
          400: 'rgb(var(--detalle-400) / <alpha-value>)',
          500: 'rgb(var(--detalle-500) / <alpha-value>)',
          600: 'rgb(var(--detalle-600) / <alpha-value>)',
        },
        // Texto sobre botones con fondo de acento
        'sobre-acento': 'rgb(var(--sobre-acento) / <alpha-value>)',
      },
      boxShadow: {
        'xs': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'sm': '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
      }
    },
  },
  plugins: [require('tailwindcss-animate')],
}
