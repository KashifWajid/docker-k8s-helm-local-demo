# Docker → Docker Compose → Local Kubernetes (kind/minikube) → Helm

**Goal:** Build a tiny demo web app, containerize it with Docker, run it with `docker run`, run with `docker compose`, deploy to a local Kubernetes cluster (I'll show both `kind`), and finally package and deploy it with Helm.

This tutorial uses a simple **Node.js + Express** app (single file) and shows every file and command you need. Copy/paste the files and commands into a project folder and run them.

---

## Prerequisites

* Git (optional)
* Docker installed and running (Docker Desktop or Docker Engine).
* `docker-compose` (Docker Desktop includes it; or `docker compose` plugin)
* `kind` installed
* `kubectl` installed
* `helm` installed (v3+)

---

## Project structure

```
demo-app/
├─ app/
│  ├─ package.json
│  └─ index.js
├─ Dockerfile
├─ docker-compose.yml
├─ kind-config.yaml
├─ k8s/
│  ├─ deployment.yaml
│  └─ service.yaml
├─ helm-chart/
│  └─ demo-app/
│     ├─ Chart.yaml
│     ├─ values.yaml
│     └─ templates/
│        ├─ deployment.yaml
│        └─ service.yaml
└─ README.md  (you are here)
```

---

## 1) Create the demo app

Create folder `demo-app/app` and add these files.

### `app/package.json`

```json
{
  "name": "demo-app",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "express": "^4.18.2"
  }
}
```

### `app/index.js`

```js
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ message: 'Hello from demo-app!', pid: process.pid });
});

app.get('/health', (req, res) => {
  res.status(200).send('ok');
});

app.listen(port, () => {
  console.log(`demo-app listening on port ${port}`);
});
```

Install dependencies locally (optional):

```bash
cd demo-app/app
npm install
cd ..
```

> You don't strictly need to run the app locally with `node` — this is mainly to test before containerizing.

---

## 2) Dockerize the app

Create a `Dockerfile` in the project root (`demo-app/Dockerfile`):

```Dockerfile
# Use official Node image
FROM node:18-alpine

WORKDIR /usr/src/app

# Copy package.json + package-lock (if present) first to leverage layer caching
COPY app/package.json ./

# Install dependencies
RUN npm install --production

# Copy app source
COPY app/ ./

# Default port
ENV PORT=6969

EXPOSE 6969

CMD ["npm", "start"]
```

### Build the image

From project root:

```bash
docker build -t demo-app:local .
```

### Run the image with Docker

```bash
# map container port 6969 to host 6969
docker run --rm -p 6969:6969 --name demo-app-demo demo-app:local
```

Then visit `http://localhost:6969/` — you should see the JSON message.

To run detached:

```bash
docker run -d --rm -p 6969:6969 --name demo-app-demo demo-app:local
```

Stop it:

```bash
docker stop demo-app-demo
```

---

## 3) Docker Compose

Create `docker-compose.yml` in project root:

```yaml
version: '3.8'
services:
  demo:
    image: demo-app:local
    build: .
    ports:
      - '6969:6969'
    restart: unless-stopped
    environment:
      - PORT=6969
```

### Start with Compose

```bash
# build and start
docker compose up --build
# (or older syntax) docker-compose up --build
```

Visit `http://localhost:6969/`. To stop:

```bash
docker compose down
```

Notes:

* `docker compose` will rebuild the image if the `build:` context changed.
* Useful for multi-service demos; you can add a second service (e.g., redis) to demonstrate linking.

---

## 4) Local Kubernetes — Option A: kind (recommended for Docker users)

### Install and create cluster

```bash

### Create kind  manifests

# kind-config.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
    extraPortMappings:
      - containerPort: 30080
        hostPort: 8080
        protocol: TCP

# create cluster (simple)
kind create cluster --name demo-cluster --config .\kind-config.yaml

# make sure kubectl uses the cluster
kubectl cluster-info --context demo-cluster

#make sure the docker image is available to the kind cluster
kind load docker-image docker-k8s-helm-demo:local --name demo-cluster
```

### Create Kubernetes manifests

`k8s/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: demo-k8s-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: demo-k8s-app
  template:
    metadata:
      labels:
        app: demo-k8s-app
    spec:
      containers:
      - name: demo-k8s-app
        image: docker-k8s-helm-demo:local
        imagePullPolicy: Never
        ports:
        - containerPort: 6969
        livenessProbe:
          httpGet:
            path: /health
            port: 6969
          initialDelaySeconds: 5
          periodSeconds: 10
```

`k8s/service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: demo-k8s-app-service
spec:
  type: NodePort
  selector:
    app: demo-k8s-app
  ports:
    - port: 6969
      targetPort: 6969
      nodePort: 30080
```

### Apply manifests

```bash
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# check pods
kubectl get pods -l app=demo-app
kubectl get svc demo-app-service
```

### Access the app

* If using `kind`. Visit `http://localhost:8080/`.

### Cleanup

```bash
kubectl delete -f k8s/deployment.yaml -f k8s/service.yaml
kind delete cluster --name demo-cluster
```
---

## 5) Helm — package and deploy

Create a Helm chart scaffold under `helm-chart/demo-app`.

### `helm-chart/demo-app/Chart.yaml`

```yaml
apiVersion: v2
name: demo-app
description: A demo app chart
type: application
version: 0.1.0
appVersion: "1.0.0"
```

### `helm-chart/demo-app/values.yaml`

```yaml
replicaCount: 2
image:
  repository: demo-app
  tag: local
  pullPolicy: IfNotPresent
service:
  type: NodePort
  port: 6969
  nodePort: 30080
resources: {}

# Add more values as you need (env, ingress, etc.)
```

### `helm-chart/demo-app/templates/deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: demo-app
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app: demo-app
  template:
    metadata:
      labels:
        app: demo-app
    spec:
      containers:
        - name: demo-app
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - containerPort: 6969
          livenessProbe:
            httpGet:
              path: /health
              port: 6969
            initialDelaySeconds: 5
            periodSeconds: 10

```

> Add a `_helpers.tpl` if you want nicer `include` helpers; for this demo the templates use the simple `include` references. If the include helpers aren't defined, you can simplify to static names.

### `helm-chart/demo-app/templates/service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: demo-app-svc
spec:
  type: {{ .Values.service.type }}
  selector:
    app: demo-app
  ports:
    - port: {{ .Values.service.port }}
      targetPort: 6969
      nodePort: {{ .Values.service.nodePort }}

```

### Install the chart

Before installing, ensure the image is available to the cluster (see kind/minikube notes above).

```bash
# from project root
helm install demo-app-release helm-chart/demo-app --wait

# check
kubectl get all -l app=demo-app
```

To upgrade (after changing values or templates):

```bash
helm upgrade demo-app-release helm-chart/demo-app
```

To uninstall:

```bash
helm uninstall demo-app-release
```

---

## Helpful tips and troubleshooting

* If `kubectl get pods` shows `ImagePullBackOff`, it means Kubernetes cannot pull the image. For local clusters, either load the local image into the cluster (kind) or build in the cluster's docker (minikube). Alternatively push to Docker Hub and reference `yourdockerhubusername/demo-app:tag`.

* Use `kubectl logs <pod>` to inspect container logs.

* Use `kubectl describe pod <pod>` for events and error messages.

* For rapid iteration: change app code, rebuild image (`docker build -t demo-app:local .`), then `kind load docker-image demo-app:local --name demo-cluster`, and `kubectl rollout restart deployment/demo-app` to pick up the new image.

---

## Quick command summary (copy/paste)

```bash
# build and run with docker
docker build -t docker-k8s-helm-demo:local .
docker run --rm -p 6969:6969 docker-k8s-helm-demo:local

# with compose
docker compose up --build

# kind cluster
kind create cluster --name demo-cluster
kind load docker-image demo-app:local --name demo-cluster
kubectl apply -f k8s/deployment.yaml -f k8s/service.yaml
kubectl port-forward svc/demo-app-service 6969:6969

# helm
helm install demo-app-release helm-chart/demo-app
helm upgrade demo-app-release helm-chart/demo-app
helm uninstall demo-app-release

# cleanup kind
kubectl delete -f k8s/deployment.yaml -f k8s/service.yaml
kind delete cluster --name demo-cluster
```