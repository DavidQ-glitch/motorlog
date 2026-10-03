/* Configuración de versión y seguridad.
   GitHub Actions reemplaza REPO, BUILD y VERSION en cada compilación: NO hace falta tocarlos.

   NATIVE_API: subilo (1 → 2 → 3…) SOLO cuando cambie algo nativo (plugins, permisos, ícono,
   capacitor.config.json). Las apps con una versión nativa más vieja van a pedir instalar el APK
   nuevo en lugar de actualizarse "en vivo".

   UPDATE_KEY: clave PÚBLICA para verificar las actualizaciones. Es la parte pública de tu clave
   de firma (la del Secret KEYSTORE_BASE64). La app solo instala actualizaciones firmadas con esa
   clave; si alguien no la tiene, no puede publicar nada que el teléfono acepte.
   La compilación se detiene sola si esta clave no coincide con la del Secret. */
window.ML_CONFIG = {
  REPO: '__REPO__',
  BUILD: 0,
  VERSION: '2.0.0',
  NATIVE_API: 2,
  UPDATE_KEY: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA89CZh0wCoC4gE4JPlAFXlmQJrEv8AdJrtgbC6tYPP0CHWvyFGjHUmyxNgWeQitwnPEgozEB7vPXBN15PoUbPLbE8Q112TLrXnARMdVmYQpnZpqnJxCcAAQR9jNCmCZbnHJEeRx2c/mvflDY717GhAUI0EK+rXnINGk0L/bvZFnrTNxf2jFezKa6hL2bx93CIzSuJPU1zVgestl7veYmT47Bz7k+95UK27HIkJcOPqr7eI/okDUweckVs07GIT8w4gcoVXB6tB7p37ZjMGw8MtX7+1tqeaegrd4a3wn5eCq5i/3CvKx18q6ysb6AA1mSSaNucYkcQ/950JzXNKbo5KQIDAQAB'
};
