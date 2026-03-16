-- CreateTable
CREATE TABLE "nodes" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "cpu_cores" INTEGER NOT NULL,
    "ram_gb" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metrics_raw" (
    "id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "collected_at" TIMESTAMP(3) NOT NULL,
    "cpu_percent" DOUBLE PRECISION NOT NULL,
    "ram_percent" DOUBLE PRECISION NOT NULL,
    "disk_percent" DOUBLE PRECISION NOT NULL,
    "network_rx_mb" DOUBLE PRECISION NOT NULL,
    "network_tx_mb" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metrics_raw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metrics_aggregated" (
    "id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "window" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_end" TIMESTAMP(3) NOT NULL,
    "cpu_avg" DOUBLE PRECISION NOT NULL,
    "cpu_min" DOUBLE PRECISION NOT NULL,
    "cpu_max" DOUBLE PRECISION NOT NULL,
    "cpu_p95" DOUBLE PRECISION NOT NULL,
    "ram_avg" DOUBLE PRECISION NOT NULL,
    "ram_min" DOUBLE PRECISION NOT NULL,
    "ram_max" DOUBLE PRECISION NOT NULL,
    "ram_p95" DOUBLE PRECISION NOT NULL,
    "disk_avg" DOUBLE PRECISION NOT NULL,
    "disk_min" DOUBLE PRECISION NOT NULL,
    "disk_max" DOUBLE PRECISION NOT NULL,
    "network_rx_avg" DOUBLE PRECISION NOT NULL,
    "network_tx_avg" DOUBLE PRECISION NOT NULL,
    "sample_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metrics_aggregated_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "predictions" (
    "id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "predicted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "horizon_minutes" INTEGER NOT NULL,
    "predicted_cpu" DOUBLE PRECISION NOT NULL,
    "predicted_ram" DOUBLE PRECISION NOT NULL,
    "predicted_disk" DOUBLE PRECISION NOT NULL,
    "overload_risk" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "recommendation" TEXT,
    "model_name" TEXT NOT NULL,
    "inference_time_ms" INTEGER NOT NULL,

    CONSTRAINT "predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "prediction_id" TEXT,
    "triggered_by" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "cpu_reserved" DOUBLE PRECISION NOT NULL,
    "ram_reserved_gb" DOUBLE PRECISION NOT NULL,
    "reserved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "node_id" TEXT,
    "prediction_id" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION,
    "actual_value" DOUBLE PRECISION,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "metrics_raw_node_id_collected_at_idx" ON "metrics_raw"("node_id", "collected_at");

-- CreateIndex
CREATE INDEX "metrics_aggregated_node_id_window_start_idx" ON "metrics_aggregated"("node_id", "window_start");

-- CreateIndex
CREATE INDEX "metrics_aggregated_node_id_window_idx" ON "metrics_aggregated"("node_id", "window");

-- CreateIndex
CREATE UNIQUE INDEX "metrics_aggregated_node_id_window_window_start_key" ON "metrics_aggregated"("node_id", "window", "window_start");

-- CreateIndex
CREATE INDEX "predictions_node_id_predicted_at_idx" ON "predictions"("node_id", "predicted_at");

-- CreateIndex
CREATE INDEX "reservations_node_id_status_idx" ON "reservations"("node_id", "status");

-- CreateIndex
CREATE INDEX "reservations_status_reserved_at_idx" ON "reservations"("status", "reserved_at");

-- CreateIndex
CREATE INDEX "alerts_node_id_triggered_at_idx" ON "alerts"("node_id", "triggered_at");

-- CreateIndex
CREATE INDEX "alerts_severity_acknowledged_idx" ON "alerts"("severity", "acknowledged");

-- AddForeignKey
ALTER TABLE "metrics_raw" ADD CONSTRAINT "metrics_raw_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_prediction_id_fkey" FOREIGN KEY ("prediction_id") REFERENCES "predictions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_prediction_id_fkey" FOREIGN KEY ("prediction_id") REFERENCES "predictions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
