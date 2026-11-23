# syntax=docker/dockerfile:1
# Image AUTOPORTANTE d'admin.diaspora.ga, application d'administration de
# DIASPORA.GA, externe au moteur ANTSIA (CH-815, D1).
#
# Contexte de construction = le dossier ECOSYSTEMES (parent d'ANTSIA et de
# DIASPORA_GA), avec UNE installation : celle d'ANTSIA, dont le package.json
# déclare les espaces de travail ../DIASPORA_GA/apps/* et ../DIASPORA_GA/packages/*.
# Fichier d'exclusion : Dockerfile.dockerignore, à côté (liste blanche).
#
#   docker build -f DIASPORA_GA/apps/admin_diaspora_ga/Dockerfile \
#     --build-arg NEXT_PUBLIC_CONVEX_URL=… --build-arg NEXT_PUBLIC_SITE_URL=… \
#     --build-arg NEXT_PUBLIC_MEMBERS_SITE_URL=… \
#     --build-arg NEXT_PUBLIC_BUILD_SHA="$(git -C DIASPORA_GA rev-parse --short HEAD)" \
#     -t admin_diaspora_ga .            # lancé depuis ECOSYSTEMES
#
# Les variables NEXT_PUBLIC_* sont inscrites dans le bundle à la construction :
# chacune est un ARG ci-dessous (cliquet deploy-catalog du moteur, entrée
# `admin_diaspora_ga` du catalogue). Aucun secret en ARG. Aucune publication sans
# décision du propriétaire (hébergement et domaine à poser par lui).

# ── Étape 1 : dépendances et construction ─────────────────────────────────────
FROM oven/bun:1.4.2 AS builder
ARG NEXT_PUBLIC_CONVEX_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_BUILD_SHA
ARG NEXT_PUBLIC_MEMBERS_SITE_URL
ENV NEXT_PUBLIC_CONVEX_URL=${NEXT_PUBLIC_CONVEX_URL} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_BUILD_SHA=${NEXT_PUBLIC_BUILD_SHA} \
    NEXT_PUBLIC_MEMBERS_SITE_URL=${NEXT_PUBLIC_MEMBERS_SITE_URL} \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=4096
WORKDIR /src

COPY ANTSIA ./ANTSIA
COPY DIASPORA_GA ./DIASPORA_GA
RUN cd ANTSIA && bun install --frozen-lockfile
RUN cd DIASPORA_GA/apps/admin_diaspora_ga && bun run build

# ── Étape 2 : image d'exécution minimale (sortie standalone de Next) ─────────
# Racine de traçage = ECOSYSTEMES : le serveur est sous DIASPORA_GA/apps/admin_diaspora_ga.
FROM node:22-alpine AS runner
ENV NODE_ENV=production \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

COPY --from=builder --chown=node:node /src/DIASPORA_GA/apps/admin_diaspora_ga/.next/standalone ./
COPY --from=builder --chown=node:node /src/DIASPORA_GA/apps/admin_diaspora_ga/.next/static ./DIASPORA_GA/apps/admin_diaspora_ga/.next/static

USER node
EXPOSE 8080
# La sonde joint le moteur (borne de 2 s) et rend 503, donc un conteneur malsain,
# tant qu'il ne répond pas.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO- "http://127.0.0.1:8080/api/sante-fonctionnelle" >/dev/null 2>&1 || exit 1
CMD ["node", "DIASPORA_GA/apps/admin_diaspora_ga/server.js"]
