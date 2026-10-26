# Repaso de chino

App web para repasar las lecciones del curso de chino desde el móvil. Cada persona tiene su cuenta y sus resultados. Cada lección tiene flashcards, ejercicios (significado, carácter, pinyin, escuchar, ordenar frases) y un examen: con un 80% se desbloquea la lección siguiente.

Es una web estática (HTML + JavaScript, sin compilar) publicada en GitHub Pages. El progreso se guarda en Firebase si está configurado; si no, solo en el navegador del dispositivo.

## Añadir una lección

1. Crea `lessons/leccion-XX.json` (copia una existente como plantilla).
2. Añade el nombre del archivo a `lessons/index.json`.

Formato:

```json
{
  "id": "leccion-03",
  "numero": 3,
  "titulo": "En el restaurante",
  "tituloChino": "在饭馆",
  "resumen": "Una frase sobre de qué va la lección.",
  "vocabulario": [
    { "hanzi": "米饭", "pinyin": "mǐfàn", "es": "arroz", "nota": "opcional" }
  ],
  "frases": [
    { "hanzi": "我要米饭。", "pinyin": "Wǒ yào mǐfàn.", "es": "Quiero arroz.", "palabras": ["我", "要", "米饭", "。"] }
  ],
  "gramatica": [
    { "titulo": "El verbo 要", "explicacion": "…", "ejemplos": [ { "hanzi": "…", "pinyin": "…", "es": "…" } ] }
  ],
  "notas": "Texto libre."
}
```

- `numero` decide el orden y el desbloqueo.
- `palabras` es la frase troceada para el ejercicio de ordenar; al unirlas debe dar exactamente `hanzi`.
- No cambies el `id` de una lección ya usada: el progreso se guarda con él.

## Configurar Firebase (cuentas y resultados en la nube, gratis)

1. Entra en https://console.firebase.google.com y crea un proyecto (puedes desactivar Analytics).
2. **Authentication** → Comenzar → activa **Correo electrónico/contraseña**.
3. **Authentication → Configuración → Dominios autorizados** → añade `TU_USUARIO.github.io`.
4. **Firestore Database** → Crear base de datos (modo producción, ubicación `eur3` o la más cercana). En la pestaña **Reglas** pega el contenido de `firestore.rules` y publica.
5. **Configuración del proyecto** (rueda dentada) → Tus apps → icono `</>` (Web) → registra la app y copia el objeto `firebaseConfig`.
6. Pega ese objeto en `firebase-config.js` en lugar de `null`.

La clave `apiKey` de Firebase no es secreta: identifica el proyecto, y las reglas de Firestore son las que protegen los datos.

## Probar en local

```sh
python3 -m http.server 8000
# abre http://localhost:8000
```

## Instalar en el móvil

Abre la web en el móvil y elige "Añadir a pantalla de inicio" (Safari: botón compartir; Chrome: menú ⋮). Se abre como una app.
