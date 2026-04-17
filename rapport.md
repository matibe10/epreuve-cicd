# Rapport de realisation - LIVRABLE IPSSI

## Synthese

Le projet `epreuve-cicd` met en place une chaine DevSecOps complete pour une API REST Node.js: conteneurisation, orchestration, CI/CD, securisation, SBOM et monitoring Prometheus.

## Livrables remis

```text
epreuve-cicd/
├── Dockerfile
├── docker-compose.yml
├── .gitlab-ci.yml
├── k8s/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   └── networkpolicy.yaml
└── rapport.md
```

Les fichiers applicatifs `src/server.js`, `src/package.json` et `src/server.test.js` ont ete utilises pour tester localement la solution. Ils peuvent rester dans le dossier de travail pour permettre l'execution locale, mais le livrable IPSSI attendu se concentre sur les fichiers listes ci-dessus.

## Architecture cible

```text
Developpeur
   |
   v
Depot GitLab
   |
   v
Pipeline CI/CD
   |-- build: installation dependances
   |-- test: tests unitaires + couverture
   |-- security: SAST, SCA, secrets
   |-- package: build image, scan image, SBOM, push registry
   |-- deploy: deploiement Kubernetes sur main
   |
   v
Registry Docker
   |
   v
Kubernetes
   |-- Deployment taskapi, 2 replicas
   |-- Service ClusterIP
   |-- ConfigMap + Secret
   |-- NetworkPolicy deny-all + flux autorises
```

## Partie 1 - Conteneurisation

Le `Dockerfile` utilise une image Alpine et un build multi-stage. L'image finale ne contient que les dependances de production et le code necessaire au runtime. Le conteneur fonctionne avec l'utilisateur non-root `node`, expose le port 3000 et declare un healthcheck HTTP.

Docker Compose orchestre trois services: `app`, `postgres` et `redis`. Les donnees PostgreSQL et Redis sont persistantes via volumes. Les services partagent un reseau dedie `backend`; les variables d'environnement sont externalisees via `.env`.

Commandes de validation:

```bash
docker build -t taskapi:v1 .
docker compose up --build -d
docker compose ps
curl http://localhost:3000/health
docker compose down
```

## Partie 2 - Orchestration et CI/CD

Les manifests Kubernetes deploient l'application avec 2 replicas, un Service ClusterIP, une ConfigMap, un Secret, des probes et des limites de ressources. Le deploiement des credentials est separe de la configuration non sensible.

Le pipeline GitLab definit les stages `build`, `test`, `security`, `package` et `deploy`. Il installe les dependances avec cache, execute les tests avec couverture, lance les scans de securite, construit l'image Docker, la tague avec le SHA du commit et deploie uniquement depuis `main`.

Outils utilises dans le pipeline:

- Semgrep pour le SAST.
- Trivy pour le scan des dependances et de l'image.
- Grype pour un second controle de vulnerabilites.
- Gitleaks pour la detection de secrets.
- Syft pour le SBOM CycloneDX.
- kubectl pour le deploiement Kubernetes.

Commandes Kubernetes:

```bash
kubectl apply -f k8s/
kubectl get pods
kubectl get svc
kubectl describe deployment taskapi
kubectl describe networkpolicy default-deny-all
```

## Partie 3 - Securite

Les scans integres sont:

- SAST: Semgrep.
- SCA: Trivy filesystem.
- SCA complementaire: Grype filesystem.
- Container Scan: Trivy image.
- Container Scan complementaire: Grype image.
- Secret Detection: Gitleaks.
- SBOM: Syft en CycloneDX JSON.
- Deploiement: kubectl.

Les quality gates echouent sur les vulnerabilites HIGH/CRITICAL et sur les secrets detectes. Kubernetes applique un SecurityContext strict, un filesystem en lecture seule, la suppression des capabilities et une NetworkPolicy deny-all avec ouvertures minimales.

Durcissement Docker:

- image `node:20-alpine`;
- build multi-stage;
- utilisateur non-root `node`;
- aucun secret copie dans l'image;
- `.dockerignore` pour exclure les fichiers sensibles;
- healthcheck applicatif.

Durcissement Kubernetes:

- `runAsNonRoot`;
- `readOnlyRootFilesystem`;
- `allowPrivilegeEscalation: false`;
- capabilities Linux supprimees;
- `automountServiceAccountToken: false`;
- secrets separes dans un objet Kubernetes `Secret`.

### Regle R-45b - Cloisonnement Transverse Dynamique

La regle R-45b est respectee par la segmentation reseau et la limitation explicite des flux:

- Docker Compose utilise un reseau dedie `backend`;
- Kubernetes utilise un Service `ClusterIP`, non expose directement en NodePort;
- la NetworkPolicy `default-deny-all` bloque les flux par defaut;
- seules les communications necessaires sont autorisees: DNS, PostgreSQL, Redis, monitoring/ingress;
- les regles ciblent des labels Kubernetes, ce qui permet un cloisonnement dynamique meme si les pods sont recrees.

## Partie 4 - Monitoring

L'application expose `/metrics` au format Prometheus. Les metriques suivies sont le nombre de requetes, la duree des requetes, les erreurs HTTP 5xx et les metriques Node.js par defaut.

Prometheus scrape `taskapi:3000`. L'alerte `TaskApiHighErrorRate` detecte un taux d'erreur superieur a 5% pendant 5 minutes.

Meme si les fichiers `monitoring/prometheus.yml` et `monitoring/alerts.yml` ne font plus partie du livrable IPSSI simplifie, la logique de monitoring est documentee ici et l'endpoint applicatif `/metrics` a ete prevu dans le code source de test.

## Partie 5 - Documentation

Le present `rapport.md` centralise la documentation demandee: architecture, deploiement local, pipeline CI/CD, outils de securite, monitoring, analyse des vulnerabilites et conformite R-45b.

## Analyse des vulnerabilites demandees

`Ghost-24` / `ANSSI-2025-COR-09`: aucune source publique consultee le 17 avril 2026 ne confirme cette reference. L'image `node:20-alpine` ne contient pas de composant Ghost identifie. La preuve operationnelle attendue est le rapport Trivy produit par le pipeline.

`CVE-2024-9999`: les sources publiques associent cette CVE a Progress WS_FTP Server, composant absent de l'application et de l'image. Si un scanner interne remonte `LibGhost`, le correctif consiste a supprimer ou mettre a jour le paquet, reconstruire l'image et bloquer le deploiement tant que le scan reste CRITICAL.

## Commandes de validation

```bash
cd src
npm.cmd install
npm.cmd test
cd ..
docker build -t taskapi:v1 .
trivy image --severity HIGH,CRITICAL --exit-code 1 taskapi:v1
grype taskapi:v1 --fail-on critical
syft taskapi:v1 -o cyclonedx-json > sbom-cyclonedx.json
docker compose up -d
kubectl apply -f k8s/
```

Sur PowerShell Windows, `npm.cmd` peut etre utilise a la place de `npm` si la politique d'execution bloque `npm.ps1`.
