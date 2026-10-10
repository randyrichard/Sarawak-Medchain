# SafeChain on Kubernetes

For when one server is no longer enough: several API replicas behind a load balancer, rolling
deploys with no downtime, and a node failing without taking the product with it. Until then
the single-server Compose stack (`docker-compose.prod.yml` + `deploy/*.sh`) is simpler to run
and is the recommended starting point. See `docs/PRODUCTION_PLATFORM.md` for when to move.

```
deploy/k8s/
  base/                     what SafeChain is: Deployments, Services, probes, autoscaling,
                            disruption budgets, network policies, ingress
  overlays/production/      your domains, your registry, your release tag
  secret.example.yaml       the Secret it expects - never commit a filled-in copy
```

## What the cluster must provide

| Need | Why | Typical choice |
|---|---|---|
| PostgreSQL 16 | Data. Managed, with point-in-time recovery and automated backups | RDS, Cloud SQL, Azure Database, Crunchy/CloudNativePG |
| A `ReadWriteMany` storage class | Uploaded evidence, shared by every API pod and the worker | EFS, Filestore, Azure Files, Longhorn RWX |
| ingress-nginx | TLS termination and routing for the two hosts | or adjust `base/ingress.yaml` |
| cert-manager + a `letsencrypt` ClusterIssuer | Certificates | |
| A CNI that enforces NetworkPolicy | `base/policies.yaml` | Calico, Cilium, most managed clusters |
| metrics-server | The API's HorizontalPodAutoscaler | installed by default on most managed clusters |

## First deployment

1. **Database.** Create a database and an owner login for migrations, then put that URL in
   `DATABASE_URL`. The restricted `safeops_app` login is created automatically by the API
   pods' `migrate` init container, using the `APP_DB_PASSWORD` you choose.
2. **Secrets.** Copy `secret.example.yaml`, fill it in (`npm run keygen` in `api/`
   generates the keys), and create it in the cluster. Better: source it from your secrets
   manager with the External Secrets Operator.
3. **Proxy token.** `TRUST_PROXY=uniquelocal` trusts forwarded headers from in-cluster
   addresses, so the API also requires the ingress to prove itself with `PROXY_TOKEN`.
   - Add `X-SafeOps-Proxy: <PROXY_TOKEN>` to ingress-nginx's
     [`proxy-set-headers`](https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/configmap/#proxy-set-headers)
     ConfigMap.
   - Or set `TRUST_PROXY: "false"` and accept that every visitor is logged as the ingress's
     address.
4. **Overlay.** In `overlays/production/kustomization.yaml`, replace every `REPLACE_ME`
   with your registry owner and domains. Set `newTag` to a commit sha that the release
   workflow published.
5. **Apply.**
   ```
   kubectl apply -k deploy/k8s/overlays/production
   kubectl -n safeops rollout status deploy/safeops-api
   ```
6. **Smoke test** from anywhere:
   ```
   deploy/smoke.sh https://api.example.com https://app.example.com
   ```

## Releasing and rolling back

```
cd deploy/k8s/overlays/production
kustomize edit set image safeops-api=ghcr.io/OWNER/safeops-api:<sha> \
                         safeops-web=ghcr.io/OWNER/safeops-web:<sha>
kubectl apply -k .
kubectl -n safeops rollout status deploy/safeops-api      # waits for every new pod to be ready
```

**What happens during a release:**
- The new API pods run migrations in their init container before they take any traffic.
  Migrations are additive, so the old pods keep working against the newer schema while
  they drain.
- `maxUnavailable: 0` keeps capacity up throughout the rollout.
- A `preStop` pause and the server's own drain mean in-flight requests finish.

**Roll back** to the previous ReplicaSet, or to any earlier sha:
```
kubectl -n safeops rollout undo deploy/safeops-api deploy/safeops-web deploy/safeops-worker
```
Or set the earlier sha with `kustomize edit set image` and apply again. Keep the overlay
in git, so every release and rollback is a commit.

## What the manifests guarantee

- **API**:
  - at least two replicas, spread across nodes, scaled out on CPU up to six;
  - a disruption budget so node drains never take the last one.
- **Readiness and liveness are deliberately different checks.**
  - Readiness uses `/health/ready`, which needs the database, so a pod that loses the
    database stops getting traffic.
  - Liveness uses `/health`, which checks only the process, so the pod is not restarted
    for a database outage it cannot fix.
- **Worker**: exactly one, recreated on deploy, so old and new code never sweep side by
  side. Its liveness probe is the same job-freshness check Compose uses.
- **Least privilege**: the API and worker run as uid 1000 with:
  - a read-only root filesystem;
  - all capabilities dropped;
  - no service-account token;
  - the restricted database login, with row-level security in force.

  This was verified by running the image under exactly these constraints.
- **Network**: default-deny ingress. Only the ingress controller reaches the pods, and a
  `monitoring` namespace can reach the API's metrics port.

## Known gaps

- **Web pod privileges.** The web image's nginx master starts as root to drop privileges
  itself, so the web pod cannot use the `restricted` Pod Security profile yet. Moving
  `web/Dockerfile` to `nginxinc/nginx-unprivileged` would allow it.
- **Uploads.** Uploads live on a shared volume. Object storage (S3-compatible) would
  remove the RWX requirement and make backups simpler. That is an application change, and
  it is on the roadmap in `docs/PRODUCTION_PLATFORM.md`.
