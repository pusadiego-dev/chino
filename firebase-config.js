// Pega aquí la configuración de tu proyecto de Firebase
// (Consola de Firebase > Configuración del proyecto > Tus apps > Web).
// Si lo dejas en null, la app guarda los resultados solo en este dispositivo.
export const firebaseConfig = {
  apiKey: "AIzaSyDaDArsj53daXFEDs4xm6MguXoWT-Zns-4",
  authDomain: "lecciones-chino.firebaseapp.com",
  projectId: "lecciones-chino",
  storageBucket: "lecciones-chino.firebasestorage.app",
  messagingSenderId: "979219951422",
  appId: "1:979219951422:web:7eada4868aa400a5c9466f"
};

// Ejemplo:
// export const firebaseConfig = {
//   apiKey: "AIza...",
//   authDomain: "mi-chino.firebaseapp.com",
//   projectId: "mi-chino",
//   appId: "1:123:web:abc"
// };

// Nota para aprobar una lección en el examen (0-100).
export const NOTA_APROBADO = 80;
