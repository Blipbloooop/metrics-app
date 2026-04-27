-- CreateTable: événements Kubernetes collectés depuis l'API K8s
CREATE TABLE "kube_events" (
    "uid"         TEXT NOT NULL,
    "namespace"   TEXT NOT NULL,
    "type"        TEXT NOT NULL,
    "reason"      TEXT NOT NULL,
    "message"     TEXT NOT NULL,
    "object_kind" TEXT,
    "object_name" TEXT,
    "count"       INTEGER NOT NULL DEFAULT 1,
    "first_time"  TIMESTAMP(3) NOT NULL,
    "last_time"   TIMESTAMP(3) NOT NULL,
    "synced_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kube_events_pkey" PRIMARY KEY ("uid")
);

-- CreateIndex
CREATE INDEX "kube_events_namespace_last_time_idx" ON "kube_events"("namespace", "last_time");
CREATE INDEX "kube_events_type_last_time_idx" ON "kube_events"("type", "last_time");
