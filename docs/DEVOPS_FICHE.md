# Fiche DevOps — FixCraft Marketplace

## 1. Architecture de la chaîne

```
Pull Request / Push / Tag vX.Y.Z
        │
        ▼
┌───────────────────────────────┐
│  CI: test (Matrice Node 22/24)│ ──► Artefact JUnit XML (test-results/)
└───────────────┬───────────────┘
                │ needs: test
                ▼
┌───────────────────────────────┐
│  CI: build-and-push           │ ──► Image ghcr.io/erenyea9er69/fixcraft:vX.Y.Z
└───────────────┬───────────────┘     (tag explicite, user non-root, HEALTHCHECK)
                │ if tag v*.*.*
                ▼
┌───────────────────────────────┐
│  CD: deploy (--no-build)      │ ──► Compose (app ──► db:5432 non publié)
└───────────────────────────────┘     + vérification HTTP 200 sur /health
```

### Services Docker Compose
- **`app`** : Express + React (`dist/`) sur le port `3001`, volumes persistants `app_data` (`/app/data`) et `app_uploads` (`/app/uploads`), utilisateur non-root `node`.
- **`db`** : `postgres:16-alpine`, port `5432` **non publié**, volume persistant `db_data`, santé contrôlée par `pg_isready`. L'application s'y connecte par nom de service (`PGHOST=db`) et ne démarre qu'après `condition: service_healthy`.

---

## 2. Version mise en service

- **Image publiée** : `ghcr.io/erenyea9er69/fixcraft:v1.0.0` (puis `v1.0.1`).
- **Route de santé** : `GET /health` retourne HTTP `200` avec `status: "ok"`, `version`, `database: "connected"` et `postgres: "connected"`.
- **Règle d'immutabilité** : l'image construite par la CI n'est **jamais reconstruite** au déploiement (`docker compose pull app && docker compose up -d --no-build`).

---

## 3. Déroulé du retour arrière (Rollback)

1. La version `v1.0.1` est en service (`curl http://localhost:3001/health` affiche `"version":"v1.0.1"`).
2. En cas d'incident ou de régression, on redéploie l'image précédente déjà publiée sans reconstruction :
   ```bash
   ./scripts/deploy.sh v1.0.0
   ```
   *(équivalent à `IMAGE_TAG=v1.0.0 docker compose pull app && IMAGE_TAG=v1.0.0 docker compose up -d --no-build`)*.
3. Contrôle de santé immédiat :
   ```bash
   curl -fsS http://localhost:3001/health
   ```
   Le service répond HTTP `200` avec `"status":"ok"` et `"version":"v1.0.0"`, tout en conservant les volumes persistants `db_data` et `app_data`.
