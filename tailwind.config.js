/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontSize: {
        'xl-input': ['18px', '1.5rem']
      },
      minHeight: {
        '56': '14rem'
      }
    }
  },
  plugins: []
}
