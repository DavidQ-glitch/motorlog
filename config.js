/* Configuración de versión.
   GitHub Actions reemplaza estos valores en cada compilación (REPO, BUILD y VERSION).
   NO hace falta que los toques a mano.

   NATIVE_API: subilo (1 → 2 → 3…) SOLO cuando agregues un plugin nativo nuevo o cambies
   permisos/ícono. Las apps con una versión nativa más vieja van a pedir instalar el APK nuevo
   en lugar de actualizarse "en vivo". */
window.ML_CONFIG = {
  REPO: '__REPO__',
  BUILD: 0,
  VERSION: '2.0.0',
  NATIVE_API: 1
};
