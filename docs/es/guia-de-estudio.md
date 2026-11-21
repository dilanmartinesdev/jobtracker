# Guía de estudio: JobTracker explicado para una entrevista

Esta guía es para ti, Dylan. Explica qué hace cada parte del proyecto, qué funciones usa y **por qué se eligió así**, para que puedas defenderlo con tus palabras. Léela con el código abierto al lado.

> **Antes de nada, una advertencia honesta.** Un proyecto de portafolio sirve en la entrevista solo si puedes explicarlo. Te van a pedir que abras un archivo y digas qué hace una línea. Si un entrevistador te pregunta cómo lo hiciste, di la verdad: que usaste un asistente de IA y que después estudiaste y entendiste cada decisión. Hoy es normal usar IA; lo que se evalúa es que *tú* entiendas y puedas cambiar el código. Lo que no conviene es decir que lo escribiste todo solo y luego no saber explicar una función.

---

## 1. El proyecto en 60 segundos

> "JobTracker es un tablero Kanban para seguir mis postulaciones de empleo. Lo hice porque lo necesitaba yo mismo. El backend es una API en FastAPI con PostgreSQL, y el frontend es React con TypeScript. Lo que lo distingue de un CRUD básico es que **guarda el historial de cada cambio de estado** y calcula el embudo (cuántas postulaciones llegan a entrevista y oferta) desde ese historial, no solo desde la columna actual. También cuidé la seguridad (contraseñas con Argon2id, tokens con expiración, límite de intentos, validación estricta), la accesibilidad (se puede mover una tarjeta solo con teclado) y la calidad: pruebas en SQLite y PostgreSQL, tipos estrictos, y un pipeline de CI en GitHub Actions."

Practícalo en voz alta hasta que salga natural. Si te cuesta, acórtalo; no memorices palabra por palabra.

---

## 2. Mapa del repositorio

```
backend/app/
  main.py          crea la app y conecta todo
  config.py        configuración desde variables de entorno
  database.py      conexión a la base de datos y sesiones
  models.py        las tablas (User, Application, ApplicationEvent)
  schemas.py       qué datos acepta y devuelve la API (validación)
  security.py      hash de contraseñas y tokens JWT
  dependencies.py  "quién es el usuario actual" y la sesión de BD
  ratelimit.py     límite de intentos en login/registro
  errors.py        excepciones propias del negocio
  routers/         capa HTTP: recibe la petición y responde
  services/        reglas de negocio
backend/alembic/   migraciones de la base de datos
backend/tests/     pruebas automáticas
frontend/src/
  api/             cliente fetch, hooks de React Query, tipos
  auth/            contexto de sesión
  components/      Board, Column, Card, diálogo, estadísticas…
  lib/             funciones puras (agrupar, buscar, fechas)
docs/              arquitectura, decisiones, auditoría, esta guía
```

**Idea central: capas.** Un *router* solo habla HTTP. Un *service* contiene las reglas. Un *model* describe tablas. Un *schema* valida datos. Si te preguntan "¿por qué tantos archivos?": cada capa tiene un solo trabajo, así puedo probar las reglas sin levantar un servidor (el script `seed.py` reutiliza `create_user` del service sin pasar por HTTP).

---

## 3. Backend, archivo por archivo

### `config.py`: configuración tipada
- **Qué usa:** `pydantic-settings` (`BaseSettings`). Lee variables de entorno una vez y las convierte a tipos (`int`, `bool`, lista).
- **Por qué:** nada de secretos escritos en el código. En producción, si `SECRET_KEY` falta o mide menos de 32 caracteres, **la app se niega a arrancar**. En desarrollo se genera una clave aleatoria, así que no existe una clave por defecto que alguien pueda usar para falsificar tokens.
- **Si preguntan:** "¿Por qué no un valor por defecto?" → porque un valor por defecto en un repositorio público es una contraseña pública.

### `database.py`: motor y sesiones
- `create_engine(...)`: la conexión. `pool_pre_ping=True` comprueba que la conexión siga viva antes de usarla (evita errores tras reinicios de la BD).
- `sessionmaker`: fábrica de sesiones. `autoflush=False` para que SQLAlchemy no escriba a la BD sin que yo lo pida.
- `get_db()`: una **dependencia de FastAPI**. Abre una sesión por petición y la cierra siempre (`try/finally`). El `yield` es lo que permite ese patrón.
- `NAMING_CONVENTION`: da nombre estable a índices y restricciones. Sin esto, Alembic genera nombres automáticos distintos en cada base de datos y las migraciones no se pueden revertir limpiamente.
- `_enable_sqlite_foreign_keys`: SQLite **ignora** las llaves foráneas (y el `ON DELETE CASCADE`) salvo que se le ordene con `PRAGMA foreign_keys=ON`. Sin esto, las pruebas en SQLite se comportarían distinto que PostgreSQL en producción.

### `models.py`: las tablas
- Tres tablas: `users`, `applications`, `application_events`.
- **`Status(StrEnum)`**: los cuatro estados (`applied`, `interview`, `offer`, `rejected`). En la base de datos se guarda como `VARCHAR` con un `CHECK`, no como enum nativo de PostgreSQL (función `_status_column`). *Por qué:* añadir un estado nuevo con un enum nativo exige `ALTER TYPE`, que es incómodo y no puede quitar valores. Con `VARCHAR + CHECK` es una migración normal.
- **`UTCDateTime(TypeDecorator)`**: un tipo propio. SQLite devuelve fechas *sin* zona horaria, PostgreSQL con zona. El tipo rechaza fechas sin zona al guardar y siempre devuelve UTC al leer. *Por qué:* el mismo código daba respuestas distintas en pruebas y producción, y el navegador interpreta una fecha sin zona como hora local (un bug sutil real).
- **Relaciones con `cascade="all, delete-orphan"` + `passive_deletes=True` + `ondelete="CASCADE"`**: borrar un usuario borra sus postulaciones, y borrar una postulación borra su historial. Lo hace la **base de datos**, no solo el ORM.
- **Índices** `(user_id, status)` y `(user_id, applied_date)`: todas las consultas empiezan filtrando por usuario y luego por estado o fecha.

### `schemas.py`: validación con Pydantic v2
- Los *schemas de entrada* (`ApplicationCreate`, `ApplicationUpdate`) **validan y normalizan**: recortan espacios, limitan longitudes, convierten `""` en `NULL` (`_blank_to_none`) y solo aceptan enlaces `http(s)` (`_normalize_http_url`). *Por qué lo de los enlaces:* un `javascript:alert(1)` guardado como URL se ejecutaría al hacer clic (XSS almacenado).
- `extra="forbid"`: si mandan un campo que no existe, error 422 en vez de ignorarlo en silencio.
- `ApplicationUpdate` es un **PATCH parcial**: los campos no enviados no se tocan. `_required_fields_cannot_be_null` impide mandar `{"company": null}` (antes eso llegaba a la BD y daba error 500; está en la auditoría).
- Los *schemas de salida* (`ApplicationOut`…) son simples a propósito: leer datos ya guardados nunca debe fallar por una validación.
- `Page[T]`: una clase genérica para respuestas paginadas (`items`, `total`, `limit`, `offset`).
- `Password`: mínimo 8 y máximo 128 **caracteres** (no bytes). Bcrypt limita a 72 *bytes* y se rompía con emojis; por eso se cambió a Argon2id.

### `security.py`: contraseñas y tokens
- **`hash_password` / `verify_password`** (Argon2id vía `argon2-cffi`). Argon2id es la recomendación actual de OWASP: es lento y consume memoria a propósito, para que adivinar contraseñas sea caro.
- **`needs_rehash`**: si los parámetros del hash mejoran con el tiempo, al iniciar sesión se vuelve a hashear con los nuevos. El usuario no nota nada.
- **`DUMMY_HASH`**: si el correo no existe, igual se verifica contra un hash falso. *Por qué:* medimos 7 ms (correo desconocido) contra 290 ms (correo real). Esa diferencia permitía descubrir qué correos están registrados. Ahora ambos casos tardan lo mismo.
- **`create_access_token` / `decode_access_token`** (PyJWT, HS256): el token lleva solo el id de usuario (`sub`), la fecha de emisión (`iat`) y la expiración (`exp`). Al decodificar se **exigen** `exp` y `sub` y se fija el algoritmo (`algorithms=[ALGORITHM]`), para que nadie pueda mandar un token con `alg: none`.

### `dependencies.py`
- `get_current_user`: toma el token del encabezado `Authorization: Bearer …`, lo decodifica, busca al usuario y, si algo falla, responde **siempre el mismo 401** (sin decir si el token estaba mal firmado, expirado o el usuario ya no existe).
- `CurrentUser = Annotated[User, Depends(get_current_user)]`: un alias de tipo para que los endpoints digan simplemente `user: CurrentUser`.

### `ratelimit.py`
- `slowapi`: 10 intentos por minuto por dirección en login y registro. Los contadores viven en memoria (por proceso). *Limitación honesta:* con varias réplicas harían falta contadores compartidos (Redis).

### `errors.py` y `main.py`
- `errors.py` define excepciones del *dominio* (`ApplicationNotFoundError`, `EmailAlreadyRegisteredError`). Los services las lanzan sin saber nada de HTTP.
- `main.py` → `create_app()` es una **fábrica**: crea la app, configura CORS (solo los métodos y encabezados que se usan, sin credenciales), monta los routers bajo `/api` y **traduce** cada excepción de dominio a un código HTTP (404, 409, 429).

### `routers/`
- `auth.py`: `POST /register`, `POST /login` (formulario OAuth2, por eso `OAuth2PasswordRequestForm`), `GET /me`, `DELETE /me` (borra la cuenta y todo lo suyo).
- `applications.py`: listar (con `status`, `q`, `limit`, `offset`), crear, leer, `PATCH`, borrar, historial y estadísticas.
- `health.py`: `/health` (¿el proceso vive?) y `/health/ready` (¿la base de datos responde?). Docker y los orquestadores usan estos endpoints.

### `services/users.py`
- `create_user`: si el correo ya existe lanza el error; además captura `IntegrityError` por si dos registros iguales llegan a la vez (la restricción única de la BD decide).
- `authenticate`: **siempre** ejecuta una verificación de hash (con `DUMMY_HASH` si no hay usuario) y devuelve `None` en cualquier fallo.

### `services/applications.py`: aquí está lo más interesante
- Todas las funciones reciben `user` y filtran por `user.id`. Pedir la postulación de otra persona da **404, no 403**: un 403 confirmaría que ese id existe.
- `list_applications`: `icontains(..., autoescape=True)`. Sin `autoescape`, buscar `%` coincidía con todo (los comodines de `LIKE`).
- `_record_status_change`: cada cambio de estado agrega una fila en `application_events`. **Regla de deshacer:** si el cambio revierte el anterior y ese tiene menos de 2 minutos, se *borra* esa fila en vez de agregar otra. *Por qué:* el embudo cuenta lo que una postulación "alguna vez alcanzó". Si arrastras una tarjeta a Entrevista por error y la regresas, sin esta regla tu tasa de entrevistas subiría para siempre. Lo descubrí revisando capturas (hallazgo 15 de la auditoría).
- `get_stats` + `_count_ever_reached`: `COUNT(DISTINCT application_id)` sobre el historial. Una postulación que llegó a entrevista y después fue rechazada **sigue contando** como entrevista; eso es lo que una tasa de conversión debe medir.

### Migraciones (`alembic/`)
- La imagen de Docker ejecuta `alembic upgrade head` antes de iniciar. Nada de `create_all()` al arrancar, porque `create_all` no puede modificar tablas existentes.
- La migración está escrita para ser **autocontenida** (no importa código de la app). Una versión autogenerada importaba un tipo de `app/`, y se habría roto el día que ese código cambiara.
- En CI, `alembic check` falla si los modelos y las migraciones se desincronizan.

### `scripts/seed.py`
Crea la cuenta demo (`demo@jobtracker.dev` / `demo-password-123`) con 18 postulaciones ficticias y su historial. Hay una prueba que verifica que el estado guardado coincide con el último evento.

---

## 4. Frontend, archivo por archivo

### `api/client.ts`: el único lugar que llama a `fetch`
- `request<T>()` añade el token, convierte el cuerpo (JSON o formulario), interpreta errores y devuelve datos tipados.
- `ApiError`: un solo tipo de error con `status` y mensaje legible. `messageFrom` entiende el formato de errores de validación de FastAPI.
- Si llega un **401 y la petición llevaba token**, avisa a `AuthContext` para cerrar sesión ("tu sesión expiró"). Un 401 del formulario de login es solo "contraseña incorrecta" y lo muestra el propio formulario.
- `tokenStore`: envuelve `localStorage` con `try/catch`, porque el almacenamiento puede estar bloqueado (modo privado).
- **Decisión de seguridad:** el token está en `localStorage`. Contra: cualquier script que corra en la página podría leerlo. Mitigaciones: CSP estricta en nginx (solo scripts del mismo origen), nunca se renderiza HTML crudo y los enlaces son solo `http(s)`. La alternativa más sólida es una cookie `HttpOnly` con protección CSRF; está documentada como siguiente paso.

### `api/hooks.ts`: React Query
- **TanStack Query** maneja el *estado del servidor*: caché, recarga y reintentos. No uso Redux porque no hay estado global complejo.
- `keys`: las claves de caché en un solo objeto, para invalidar sin errores de tipeo.
- `fetchAllApplications`: pide páginas de 500 hasta alcanzar `total`. Antes pedía una sola página y habría ocultado en silencio las filas sobrantes; ahora tiene tres pruebas.
- `useMoveApplication`: **actualización optimista**. `onMutate` mueve la tarjeta al instante (y cancela consultas en vuelo para que no la pisen), `onError` la regresa si el servidor rechaza, `onSettled` recarga la lista y las estadísticas. *Por qué:* arrastrar se siente inmediato aun con internet lenta.
- Las demás mutaciones invalidan `applications` y `stats` al terminar.

### `auth/AuthContext.tsx`
- Un **Context** con `user`, `signIn`, `register`, `signOut`. Todo lo que está debajo muestra el login o el tablero.
- `signOut` hace `queryClient.clear()`: borra la caché para que otra persona en el mismo navegador no vea datos ajenos.
- `useMemo` / `useCallback` mantienen estable el valor del contexto y evitan renderizados innecesarios.
- `useAuth` lanza un error claro si se usa fuera del proveedor.

### `components/`
- **`Board.tsx`**: dueño de todo el arrastrar y soltar (**dnd-kit**). Tres *sensores*: ratón (empieza a arrastrar tras 6 px, así un clic normal abre la tarjeta), táctil (mantener ~220 ms, así se puede hacer scroll con el dedo) y teclado. `jumpBetweenColumns` es un *coordinate getter* propio: con las flechas la tarjeta salta de columna en columna (por defecto dnd-kit la movería unos píxeles, inútil en un tablero). `announcements` son los mensajes para lectores de pantalla, en lenguaje simple.
- **`Column.tsx`** (zona donde soltar) y **`Card.tsx`** (elemento arrastrable). En `Card`, `Enter` abre el diálogo y hace `preventDefault()`: sin eso, el mismo Enter "pulsaba" el botón Cerrar del diálogo, que acababa de recibir el foco, y el diálogo se cerraba al instante. Hay una prueba que falla si quitas esa línea.
- **`ApplicationDialog.tsx`**: formulario de crear/editar con el historial. Usa el elemento nativo `<dialog>` y `showModal()`, que da gratis atrapar el foco, cerrar con Escape y bloquear el resto de la página. Menos código y menos errores de accesibilidad que un modal hecho a mano.
- **`PipelineStats.tsx`**: dibuja el embudo y la gráfica semanal con HTML/CSS/SVG simples (sin librería de gráficas: no hacía falta).
- **`Toolbar.tsx`, `AuthScreen.tsx`, `Workspace.tsx`**: búsqueda, pantalla de acceso y composición del tablero.

### `lib/`
Funciones **puras** (sin React): `groupByStatus`, `matchesQuery`, `formatAge`… Son las más fáciles de probar y por eso están separadas.

### Estilos
CSS normal con variables (tokens) en `:root` y un tema oscuro que las redefine. Fuentes IBM Plex servidas desde el mismo origen (npm), sin pedir nada a terceros, lo que permite una CSP muy estricta.

### TypeScript estricto
`strict` y `noUncheckedIndexedAccess`: acceder a `array[i]` devuelve `T | undefined`, lo que obliga a manejar el caso vacío. Es la razón de varios `?.` que verás.

---

## 5. Flujos que debes saber narrar

**Iniciar sesión.** El formulario llama a `signIn` → `POST /api/auth/login` → el API busca al usuario, verifica el hash (con hash falso si no existe) → devuelve un JWT → se guarda en `localStorage` → `AuthContext` consulta `/auth/me` → aparece el tablero.

**Mover una tarjeta.** Soltar → `onMove` → `useMoveApplication` mueve la tarjeta en pantalla → `PATCH /applications/7 {status}` → el service agrega (o borra, si es un deshacer rápido) una fila de historial → la UI recarga lista, estadísticas e historial. Si el servidor falla, la tarjeta regresa y se muestra el error.

**Calcular el embudo.** `COUNT(DISTINCT application_id)` de eventos cuyo `to_status` sea entrevista u oferta. No mira la columna actual.

---

## 6. Preguntas de entrevista (con respuesta base)

**1. ¿Por qué FastAPI y no Django o Flask?**
Validación y documentación automáticas con tipos de Python (Pydantic) y OpenAPI en `/api/docs`. Es muy usado en empresas con Python moderno. Django habría sido razonable; para una API pura es más de lo necesario.

**2. ¿Por qué PostgreSQL?**
Es lo que más se usa en producción, y usarlo en CI detecta diferencias que SQLite esconde (tipos, restricciones, búsqueda sin mayúsculas). SQLite queda para el ciclo rápido local.

**3. ¿Qué es una migración y por qué Alembic?**
Un script versionado que cambia el esquema de la base de datos. Permite evolucionar tablas en producción sin perder datos; `create_all` solo crea lo que no existe.

**4. ¿Cómo guardas las contraseñas?**
Con Argon2id, nunca en texto plano. Es lento y consume memoria a propósito. Al iniciar sesión, si el hash usa parámetros viejos, se actualiza. Empecé con bcrypt y lo cambié porque fallaba con contraseñas de más de 72 bytes.

**5. ¿Qué es un JWT? ¿Qué problemas tiene?**
Un token firmado que lleva el id del usuario y una expiración; el servidor lo verifica sin consultar una sesión guardada. Problema: no se puede revocar antes de que expire. Solución futura: tokens de refresco o sesiones en servidor.

**6. ¿Por qué el token está en `localStorage`? ¿Es seguro?**
Es un compromiso. Es vulnerable si hay XSS, por eso hay CSP estricta, no se renderiza HTML crudo y las URL son solo `http(s)`. Lo más sólido sería cookie `HttpOnly` con protección CSRF; lo dejé documentado como mejora.

**7. ¿Qué es XSS y qué hiciste contra él?**
Inyección de scripts. Validé que las URL sean `http(s)` (bloquea `javascript:`), React escapa el texto por defecto, y la CSP solo permite scripts del mismo origen.

**8. ¿Por qué 404 y no 403 con datos de otro usuario?**
Un 403 confirma que el recurso existe. Con 404, un id ajeno y uno inexistente son indistinguibles.

**9. ¿Qué pasa si dos usuarios se registran con el mismo correo a la vez?**
La restricción única de la base de datos decide; capturo `IntegrityError` y respondo 409.

**10. Tu registro responde 409 si el correo existe. ¿No revela qué correos hay?**
Sí, y lo documenté como un compromiso: el usuario necesita el mensaje. El login no filtra esa información (misma respuesta y mismo tiempo), y el registro tiene límite de intentos. La solución completa es verificación por correo, que exige un servicio de envío.

**11. ¿Cómo evitas fuerza bruta?**
Límite de 10 intentos por minuto por IP con slowapi. Es en memoria, así que con varias réplicas haría falta Redis. Detrás de nginx, la IP real llega en `X-Forwarded-For`, que nginx sobrescribe en vez de añadir, para que nadie la falsifique.

**12. ¿Qué es el problema N+1 y lo tienes?**
Es hacer una consulta por cada fila relacionada. La lista de postulaciones no carga eventos; los pido solo en el endpoint de historial. Las estadísticas se calculan con consultas agregadas en la base, no en Python.

**13. ¿Por qué React Query y no Redux?**
Casi todo el estado es *del servidor* (datos remotos). React Query resuelve caché, recarga y reintentos; Redux sería código extra sin beneficio aquí.

**14. Explica la actualización optimista.**
Se actualiza la pantalla antes de que el servidor responda, guardando el estado anterior. Si el servidor rechaza, se restaura. Hace que la interfaz se sienta instantánea.

**15. ¿Cómo lo hiciste accesible?**
Teclado completo (Espacio levanta, flechas eligen columna, Espacio suelta, Enter abre), anuncios para lector de pantalla, `<dialog>` nativo, foco visible, `h1` en la página y contraste revisado. Pasé axe-core sin violaciones; fue una revisión manual y aún no está en CI (lo digo en el README).

**16. ¿Cómo sabes que las pruebas sirven?**
Hice una prueba de mutación manual: quité el rollback optimista y la prueba correspondiente falló; lo mismo con el `preventDefault` de Enter. Una prueba que no puede fallar no prueba nada.

**17. ¿Cuál fue el bug más interesante?**
El del embudo: mover una tarjeta a Entrevista por error y deshacerlo subía la tasa de entrevistas para siempre, porque el embudo cuenta "alguna vez alcanzó". Lo resolví con la regla del deshacer en 2 minutos. Es una decisión de producto con costo: un vaivén deliberado dentro de 2 minutos también se olvida.

**18. ¿Qué mejorarías?**
Desplegarlo con enlace público, meter las pruebas de navegador y axe en CI, cookie `HttpOnly`, verificación de correo, Redis para el límite de intentos, dividir `ApplicationDialog` (es el componente más grande) y añadir pruebas de componentes del diálogo y el tablero.

**19. ¿Qué no está probado?**
Docker (no tenía Docker donde lo construí; el primer run real será el job de CI), Python 3.12 (probé en 3.13; el código no usa nada más nuevo que 3.12), y no hice pruebas de carga ni pentesting. Decirlo con calma da más confianza que ocultarlo.

**20. ¿Cómo desplegarías esto?**
Contenedores: PostgreSQL gestionado, imagen del API (ya ejecuta migraciones al iniciar) e imagen de nginx con el frontend. Render o Fly.io para empezar. Secretos por variables de entorno, `ENVIRONMENT=production`.

---

## 7. Lo que NO debes decir

- "Es seguro al 100 %". Di qué mitigaste y qué falta.
- "Lo hice todo yo solo, sin ayuda", si no es cierto.
- Que el CI ya pasó en Docker. Todavía no se ha ejecutado en GitHub: tu primer `git push` es la primera prueba real. **Revisa que quede en verde antes de mandar el enlace.** Si algo falla, arréglalo; es normal.

---

## 8. Cómo hacerlo tuyo (haz esto antes de la entrevista)

1. **Córrelo.** Docker Compose o el modo local del README. Entra con la cuenta demo, mueve tarjetas, mira `/api/docs`.
2. **Rompe algo a propósito** y míralo fallar: quita `preventDefault`, cambia `UNDO_WINDOW` a 0, corre las pruebas y observa cuál falla. Así aprendes qué protege cada una.
3. **Haz un cambio pequeño tuyo**: agrega un campo (por ejemplo `salary_range`) con su migración, schema, prueba y campo en el formulario. Eso te enseña el recorrido completo y es una gran historia para contar.
4. **Ajusta lo personal:** el nombre en `LICENSE`, el texto del README y los enlaces a tu GitHub.
5. **Lee `docs/decisions.md`:** son tus respuestas a "¿por qué elegiste X?".

---

## 9. Subirlo a GitHub (commits ordenados)

Ejecuta esto **tú**, con tu propio usuario y correo de Git (`git config user.name` / `user.email`). Un historial en pasos lógicos se lee mejor que un único commit gigante:

```bash
cd jobtracker
git init -b main
git add backend/app backend/alembic backend/alembic.ini backend/pyproject.toml backend/requirements.txt
git commit -m "Add FastAPI backend: models, schemas, auth and application services"

git add backend/tests backend/requirements-dev.txt backend/scripts
git commit -m "Add backend tests, demo seed data and dev requirements"

git add frontend
git commit -m "Add React + TypeScript Kanban frontend with drag and drop"

git add backend/Dockerfile frontend/Dockerfile docker-compose.yml .env.example Makefile
git commit -m "Add Docker setup and nginx with a strict CSP"

git add .github
git commit -m "Add CI: lint, types, security scans, tests on SQLite and PostgreSQL"

git add README.md README.es.md docs LICENSE .gitignore
git commit -m "Add documentation, architecture notes and audit log"

git remote add origin https://github.com/k1618/jobtracker.git
git push -u origin main
```

(Crea antes el repositorio vacío `jobtracker` en tu cuenta de GitHub. Si algún `git add` falla porque la ruta no existe, ajusta la lista con `git status`.)

Después del push: abre la pestaña **Actions** y confirma que todo pasa. Cuando lo despliegues, pon el enlace en el README y marca la casilla del roadmap. Fija el repositorio en tu perfil (*Pin*).

---

## 10. Vocabulario útil para la entrevista (inglés)

| Español | Inglés |
|---|---|
| Capa de servicios | service layer |
| Actualización optimista | optimistic update |
| Limitación de peticiones | rate limiting |
| Migración | migration |
| Inyección de dependencias | dependency injection |
| Compromiso / contrapartida | trade-off |
| Cobertura de pruebas | test coverage |
| Integración continua | continuous integration (CI) |
| Deuda técnica | technical debt |

Frases útiles: *"I chose X because… The trade-off is…"*, *"I'd improve this by…"*, *"I found a bug while reviewing screenshots, and here's how I fixed it."*
