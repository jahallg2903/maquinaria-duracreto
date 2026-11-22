// Configuración de la app.
//
// API_URL: la dirección de la aplicación web de Apps Script (termina en /exec).
// Mientras esté vacía, la app funciona en MODO DE PRUEBA: los datos quedan solo en este navegador.
window.APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbzLNuQ8P7bjYM67OGy5JBC0ib9SDUMk48VK4eXtv59gpVQCYZ20aeN_jWTZNe56WzlYCQ/exec',               // ej. 'https://script.google.com/macros/s/AKfy.../exec'
  ALERTA_DIAS: 30,           // incidencia abierta más de N días = alerta roja
  AVISO_DIAS: 14             // más de N días = aviso ámbar
};
