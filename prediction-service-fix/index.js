'use strict';
const express = require('express');
const app = express();
app.use(express.json());
const OLLAMA_URL     = process.env.OLLAMA_URL     || 'http://ollama-service:11434';
const MODEL          = process.env.OLLAMA_MODEL   || 'qwen2:0.5b';
const PORT           = process.env.PORT           || 3001;
const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://monitoring-kube-prometheus-prometheus.monitoring.svc.cluster.local:9090';
const NODE_INSTANCES = {
  'k8s-master':   '192.168.10.213:9100',
  'k8s-worker-1': '192.168.10.243:9100',
  'k8s-worker-2': '192.168.10.126:9100'
};

function clamp(v, min = 0, max = 100) { return Math.min(max, Math.max(min, Number(v) || 0)); }

// Calcule le risque comme score 0.0-1.0
function computeRiskScore(cpuP, ramP) {
  if (cpuP > 90 || ramP > 95) return { score: 1.0, recommendation: 'Intervention requise immediatement' };
  if (cpuP > 75 || ramP > 85) return { score: 0.6, recommendation: 'Surveiller la charge' };
  if (cpuP > 60 || ramP > 75) return { score: 0.3, recommendation: 'Charge moderee' };
  return { score: 0.1, recommendation: 'Nominal' };
}

// Calcule le risque comme enum string low/medium/high
function computeRiskEnum(cpuP, ramP) {
  if (cpuP > 90 || ramP > 95) return { overload_risk: 'high', recommendation: 'Intervention requise immediatement' };
  if (cpuP > 75 || ramP > 85) return { overload_risk: 'medium', recommendation: 'Surveiller la charge' };
  return { overload_risk: 'low', recommendation: 'Nominal' };
}

async function callOllama(prompt) {
  const r = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt, stream: false, options: { temperature: 0.1, num_predict: 256 } })
  });
  if (!r.ok) throw new Error(`Ollama ${r.status}: ${await r.text()}`);
  return (await r.json()).response || '';
}

async function queryPrometheus(query, startTime, endTime, stepSeconds) {
  const params = new URLSearchParams({
    query, start: (startTime.getTime()/1000).toString(),
    end: (endTime.getTime()/1000).toString(), step: `${stepSeconds}s`
  });
  const r = await fetch(`${PROMETHEUS_URL}/api/v1/query_range?${params}`);
  if (!r.ok) throw new Error(`Prometheus HTTP ${r.status}`);
  const data = await r.json();
  if (data.status !== 'success') throw new Error(`Prometheus: ${data.error}`);
  if (!data.data.result.length) return [];
  return data.data.result[0].values.map(([,v]) => parseFloat(parseFloat(v).toFixed(1)));
}

async function getNodeMetrics(node, historyMinutes, stepMinutes) {
  const instance = NODE_INSTANCES[node];
  if (!instance) throw new Error(`Noeud inconnu: "${node}". Disponibles: ${Object.keys(NODE_INSTANCES).join(', ')}`);
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - historyMinutes * 60 * 1000);
  const stepSec = stepMinutes * 60;
  const cpuQ = `round(100 - (avg(rate(node_cpu_seconds_total{mode="idle",instance="${instance}"}[${stepMinutes}m])) * 100), 0.1)`;
  const ramQ = `round((1 - node_memory_MemAvailable_bytes{instance="${instance}"} / node_memory_MemTotal_bytes{instance="${instance}"}) * 100, 0.1)`;
  const [cpuHistory, ramHistory] = await Promise.all([
    queryPrometheus(cpuQ, startTime, endTime, stepSec),
    queryPrometheus(ramQ, startTime, endTime, stepSec)
  ]);
  return { cpuHistory, ramHistory };
}

function buildStepPrompt(node, cpuHistory, ramHistory, stepMinutes) {
  const cpuStr = cpuHistory.map((v,i) => `t-${(cpuHistory.length-i)*stepMinutes}min: ${v}%`).join(', ');
  const ramStr = ramHistory.map((v,i) => `t-${(ramHistory.length-i)*stepMinutes}min: ${v}%`).join(', ');
  return `Node "${node}". CPU history: ${cpuStr}. RAM history: ${ramStr}. Predict next values. Reply ONLY with valid JSON: {"cpu_percent":50,"ram_percent":60}`;
}

async function generateForecast(node, cpuHistory, ramHistory, horizonMinutes, stepMinutes) {
  const steps = Math.max(1, Math.round(horizonMinutes / stepMinutes));
  const forecast = [];
  let cpu = [...cpuHistory];
  let ram = [...ramHistory];
  for (let i = 1; i <= steps; i++) {
    let cpuVal = clamp(cpu[cpu.length-1]);
    let ramVal = clamp(ram[ram.length-1]);
    try {
      const raw = await callOllama(buildStepPrompt(node, cpu, ram, stepMinutes));
      const match = raw.match(/\{[\s\S]*?\}/);
      if (match) {
        const p = JSON.parse(match[0]);
        if (p.cpu_percent != null) cpuVal = clamp(p.cpu_percent);
        if (p.ram_percent != null) ramVal = clamp(p.ram_percent);
      }
    } catch (_) {}
    forecast.push({ t: `+${i * stepMinutes}min`, cpu_percent: parseFloat(cpuVal.toFixed(1)), ram_percent: parseFloat(ramVal.toFixed(1)) });
    cpu = [...cpu.slice(1), cpuVal];
    ram = [...ram.slice(1), ramVal];
  }
  const cpuVals = forecast.map(f => f.cpu_percent);
  const ramVals = forecast.map(f => f.ram_percent);
  return {
    forecast,
    cpu_avg:  parseFloat((cpuVals.reduce((a,b)=>a+b,0)/cpuVals.length).toFixed(1)),
    cpu_peak: parseFloat(clamp(Math.max(...cpuVals)).toFixed(1)),
    ram_avg:  parseFloat((ramVals.reduce((a,b)=>a+b,0)/ramVals.length).toFixed(1)),
    ram_peak: parseFloat(clamp(Math.max(...ramVals)).toFixed(1))
  };
}

app.get('/health', (_req, res) => res.json({ status: 'ok', ollama_url: OLLAMA_URL, prometheus_url: PROMETHEUS_URL, model: MODEL }));

// POST /predict — format attendu par le Next.js compilé (PRV-3)
// Input: { node_id, current_cpu_percent, current_ram_percent, current_disk_percent, trend_direction, prediction_horizon_minutes }
// Output: { request_id, timestamp, prediction: {...}, model_info: {...} }
app.post('/predict', async (req, res) => {
  const { node_id, current_cpu_percent, current_ram_percent, current_disk_percent } = req.body;
  if (node_id == null || current_cpu_percent == null || current_ram_percent == null)
    return res.status(400).json({ error: 'node_id, current_cpu_percent et current_ram_percent requis' });
  try {
    const cpuIn = clamp(current_cpu_percent);
    const ramIn = clamp(current_ram_percent);
    const diskIn = clamp(current_disk_percent ?? 0);
    const prompt = `Node "${node_id}". Current CPU: ${cpuIn}%, RAM: ${ramIn}%, Disk: ${diskIn}%. Predict next values. Reply ONLY with valid JSON: {"cpu_percent":50,"ram_percent":60,"disk_percent":30}`;
    const raw = await callOllama(prompt);
    const match = raw.match(/\{[\s\S]*?\}/);
    let cpuP = cpuIn, ramP = ramIn, diskP = diskIn;
    if (match) {
      try {
        const p = JSON.parse(match[0]);
        if (p.cpu_percent  != null) cpuP  = clamp(p.cpu_percent);
        if (p.ram_percent  != null) ramP  = clamp(p.ram_percent);
        if (p.disk_percent != null) diskP = clamp(p.disk_percent);
      } catch (_) {}
    }
    const { overload_risk, recommendation } = computeRiskEnum(cpuP, ramP);
    return res.json({
      node: node_id,
      predicted_cpu_percent:  parseFloat(cpuP.toFixed(1)),
      predicted_ram_percent:  parseFloat(ramP.toFixed(1)),
      overload_risk,
      recommendation,
      model_used: MODEL,
      timestamp: new Date().toISOString()
    });
  } catch(err) { console.error('[/predict]', err.message); return res.status(500).json({ error: err.message }); }
});

// POST /forecast — format attendu par ForecastServiceResponseSchema
// Input: { node, horizon_minutes, step_minutes }
// Output: { node, forecast[], cpu_avg, cpu_peak, ram_avg, ram_peak, model_used, timestamp }
app.post('/forecast', async (req, res) => {
  const { node = 'k8s-worker-1', horizon_minutes = 30, step_minutes = 5 } = req.body;
  try {
    const { cpuHistory, ramHistory } = await getNodeMetrics(node, horizon_minutes, step_minutes);
    if (!cpuHistory.length || !ramHistory.length)
      return res.status(404).json({ error: `Aucune metrique Prometheus pour "${node}"` });
    const result = await generateForecast(node, cpuHistory, ramHistory, horizon_minutes, step_minutes);
    return res.json({
      node,
      forecast: result.forecast,
      cpu_avg: result.cpu_avg,
      cpu_peak: result.cpu_peak,
      ram_avg: result.ram_avg,
      ram_peak: result.ram_peak,
      model_used: MODEL,
      timestamp: new Date().toISOString()
    });
  } catch(err) { console.error('[/forecast]', err.message); return res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => {
  console.log(`prediction-service v1.2.1 on port ${PORT}`);
  console.log(`Ollama: ${OLLAMA_URL} | Prometheus: ${PROMETHEUS_URL}`);
});
