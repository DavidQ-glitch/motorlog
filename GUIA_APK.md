# MotorLog 2.0 — Armar tu APK y mantenerlo actualizado

Vas a usar **GitHub** (gratis) como "fábrica": subís los archivos y GitHub te arma el APK. No instalás nada en la compu.

Tenés **3 archivos** para esta guía:
- `MotorLog_APK_proyecto.zip` → el proyecto (lo que subís a GitHub).
- `CLAVE_DE_FIRMA.txt` → la "llave" de tu app (NO se sube al repositorio, va en un Secret; ver paso 3).
- `MotorLog_navegador.html` → la misma app para probar en la compu (no sirve para armar el APK).

## Cómo funcionan las actualizaciones

Cada vez que subís cambios a GitHub, se arma una **versión nueva** (2.0.1, 2.0.2, 2.0.3…) y queda publicada. La app, al abrirse con internet, **busca sola** si hay una más nueva y te avisa. Hay dos casos:

| Tipo de cambio | Qué pasa en el celular |
|---|---|
| Cambios en pantallas, diseño, íconos de vehículos, lógica (todo lo que está en `www/`) | **Actualización en vivo**: tocás *Actualizar ahora*, se descarga en segundos y la app se reinicia sola. No se instala nada. Tus datos no se tocan. |
| Cambios "de fondo": plugin nuevo, permisos, ícono de la app, pantalla de arranque | La app te ofrece **Descargar APK**; lo abrís y se instala encima. Tus datos tampoco se tocan. |

Cuando yo te mande cambios, te voy a decir de cuál tipo es.
También podés buscarla a mano en **Ajustes → Buscar actualización**.

---

## Paso 1 — Cuenta de GitHub
1. Entrá a **github.com** → **Sign up** y creá tu cuenta (o iniciá sesión).

## Paso 2 — Crear el repositorio (público)
1. Arriba a la derecha: **+ → New repository**.
2. Nombre: `motorlog`.
3. Elegí **Public**.
4. Tocá **Create repository**.

> **¿Por qué público?** La app descarga las actualizaciones desde GitHub sin usuario ni contraseña, y eso solo funciona con repositorios públicos. Adentro solo queda la app y tu dibujo de los autos: **no hay datos tuyos** (tus services viven en el celular) **ni la clave de firma** (va en un Secret, paso siguiente).
> Si preferís privado, el APK se arma igual, pero la app no podrá buscar actualizaciones sola: tendrías que entrar a GitHub desde el celular y bajar el APK nuevo a mano.

## Paso 3 — Guardar la clave de firma (Secret)
Esta clave hace que cada versión nueva se pueda instalar **encima** de la anterior sin perder datos.

1. En tu repositorio: **Settings** (arriba, el engranaje) → a la izquierda **Secrets and variables → Actions**.
2. Tocá **New repository secret**.
3. **Name:** `KEYSTORE_BASE64` (exactamente así, en mayúsculas).
4. **Secret:** abrí `CLAVE_DE_FIRMA.txt` con el Bloc de notas, seleccioná todo (Ctrl+A), copiá (Ctrl+C) y pegalo ahí. Es **una sola línea larga**; pegala completa.
5. Tocá **Add secret**.

⚠️ **Guardá una copia de `CLAVE_DE_FIRMA.txt`** (por ejemplo en tu Drive) y no la subas al repositorio. Si la perdés, las versiones futuras no se podrán instalar encima de la actual (habría que desinstalar, y se borrarían los datos si no hiciste respaldo).

## Paso 4 — Subir los archivos del proyecto
1. En tu compu, **descomprimí** `MotorLog_APK_proyecto.zip`. Queda una carpeta `MotorLog`.
2. En tu repositorio de GitHub tocá **uploading an existing file** (o **Add file → Upload files**).
3. Abrí la carpeta `MotorLog`, **seleccioná todo su contenido** (`www`, `assets`, `.github`, `package.json`, `capacitor.config.json`, `GUIA_APK.md`, `.gitignore`) y **arrastralo** a la página. Esperá a que termine de cargar.
4. Abajo, en **Commit changes**, escribí un mensaje corto, por ejemplo `Primera versión`, y tocá **Commit changes**.

> ⚠️ La carpeta `.github` es oculta en algunos sistemas. Windows: en el Explorador, pestaña *Vista → Mostrar → Elementos ocultos*. Mac: `Cmd + Shift + .`
> Después de subir, comprobá que en el repositorio veas `.github/workflows/build-apk.yml`. Si no está: **Add file → Create new file**, en el nombre escribí `.github/workflows/build-apk.yml` y pegá adentro el contenido de ese archivo (ábrilo con el Bloc de notas).

## Paso 5 — Esperar la compilación
1. Entrá a la pestaña **Actions**. Si te pide habilitarlas, aceptá.
2. Ya debería haber una ejecución en marcha ("Construir APK y publicar actualización"). Si no hay ninguna: tocá ese nombre a la izquierda → **Run workflow → Run workflow**.
3. Esperá **8 a 12 minutos**. Cuando aparece el tilde verde ✅, está listo.
4. Si aparece una ❌: abrí la ejecución, tocá el paso que tiene la ❌, copiá el mensaje de error y mandámelo.

## Paso 6 — Bajar e instalar el APK en el celular
1. **Desde el celular**, abrí tu repositorio en el navegador (`github.com/TU_USUARIO/motorlog`).
2. En la columna derecha (o más abajo en el celular) tocá **Releases → MotorLog 2.0.1**.
3. En **Assets**, tocá **MotorLog.apk** y esperá la descarga.
4. Abrí el archivo descargado. Android va a pedir permiso para **instalar apps de esta fuente** (Chrome o Archivos): activalo.
5. Si aparece el aviso de **Play Protect**, tocá **Instalar de todos modos** (es normal: la app es tuya y no viene de Play Store).
6. Abrí **MotorLog**: la primera vez ves la foto de tus autos. 🚗

## Paso 7 — Pasar tus datos de la versión anterior
1. En la app vieja: **Ajustes → Crear respaldo** (archivo `.json`).
2. En la nueva: **Ajustes → Cargar respaldo** y elegí ese archivo.

## Paso 8 — Probar que las actualizaciones funcionan
Conviene probarlo una vez, así sabés que quedó bien:
1. En GitHub, abrí `www/index.html`, tocá el lápiz ✏️ (Edit), cambiá cualquier texto chico (por ejemplo "Mi Garage" por "Mi Garage 🚗") y tocá **Commit changes**. En el mensaje escribí algo como `Prueba de actualización`.
2. Esperá el ✅ en **Actions** (8 a 12 minutos).
3. En el celular, con internet, abrí MotorLog. A los pocos segundos tiene que aparecer **"Versión 2.0.2 disponible"** con tu mensaje. Tocá **Actualizar ahora**: la app se reinicia sola con el cambio.
4. Si no aparece, andá a **Ajustes → Buscar actualización** y mirá qué dice.

---

## Cómo actualizar la app en el día a día
1. **Hacé un respaldo** (Ajustes → Crear respaldo) por las dudas.
2. Subí los archivos que te mande (o editá el archivo en GitHub con el lápiz). Para reemplazar: **Add file → Upload files**, arrastrá el archivo con el mismo nombre y mismo lugar (por ejemplo `www/js/app.js`) y confirmá.
3. En **Commit message** escribí una frase corta de lo que cambió: **es el texto que ve la app en el aviso** (se muestran las primeras 3 líneas).
4. Esperá el ✅ en **Actions**.
5. Abrí MotorLog con internet y tocá **Actualizar ahora**.

**Si una actualización falla:** si la app nueva no llega a arrancar, vuelve sola a la versión anterior. Y siempre podés instalar el `MotorLog.apk` de un Release anterior (en **Releases** quedan todos guardados).

---

## Si algo no sale

| Síntoma | Qué hacer |
|---|---|
| ❌ en Actions, dice "Falta la clave de firma" | Repetí el paso 3 (nombre exacto `KEYSTORE_BASE64`) y luego **Actions → Re-run all jobs**. |
| ❌ en Actions, dice "Clave de firma inválida" | Volvé a pegar el contenido **completo** de `CLAVE_DE_FIRMA.txt` en el Secret. |
| ❌ en otro paso | Copiá el mensaje de error y mandámelo. |
| Al instalar: "App no instalada" o conflicto | Casi siempre es una firma distinta (por ejemplo, instalaste antes un APK armado de otra forma). Hacé respaldo, desinstalá MotorLog e instalá de nuevo. |
| "No se pudo buscar" en Ajustes | Sin internet, o el repositorio está en privado (tiene que ser público), o todavía no se publicó ningún Release. |
| No veo "Releases" | La compilación aún no terminó o falló. Mirá **Actions**. |
| Play Protect bloquea | Tocá *Más detalles → Instalar de todos modos*. |

## Alternativa: Android Studio (sin actualizaciones automáticas)
Si preferís armar el APK en tu compu: instalá **Node.js (LTS)** y **Android Studio**, y en la carpeta del proyecto ejecutá:
```bash
npm install
npx cap add android
npm run assets
npx cap sync android
npx cap open android
```
En Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**. Ojo: esta forma **no** trae la búsqueda de actualizaciones (no sabe de tu repositorio) y firma con otra clave, así que **no se puede instalar encima** de un APK armado por GitHub. Elegí un camino y quedate con ese.

## Usar la app
- **＋** (abajo a la derecha): agregar vehículo. Elegí el tipo (aparece la miniatura), escribí marca y modelo, patente y, si querés, una foto real.
- **Dentro de un vehículo**: *Actualizar KM*, *Service* (elegí el ícono de lo que se hizo), *Notas*, ✏️ editar, ⬆️ compartir reporte.
- **Service**: el botón **✨ Sugerir** completa el próximo KM y la próxima fecha. La alerta sale en rojo si venció y en amarillo si falta poco (1.500 km o 30 días).
- **Avisos**: se ofrecen al guardar tu primer service con fecha, o en *Ajustes → Avisos de vencimientos*.
- **Reporte en PDF**: tocá el ícono de documento (arriba a la derecha, dentro de un vehículo). Se arma un PDF con foto, resumen, vencimientos, observaciones e historial completo, y se abre el menú de Android para enviarlo por WhatsApp, guardarlo en Drive, etc.

## Importante
- Tus datos viven **solo en el teléfono**. Hacé un respaldo de vez en cuando y guardalo en Drive.
- Si desinstalás la app se borran los datos; con el respaldo los recuperás.
- Las actualizaciones nunca tocan tus datos.
