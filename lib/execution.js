const { v4: uuidv4 } = require("uuid");
const { validateWorkflow } = require("./validate");
const { friendlyError } = require("./nodes");
const { config } = require("./config");

function createExecutionEngine({ db, nodeTypes, audit, sendSSE }) {
  const running = new Map();
  const queue = [];
  let activeCount = 0;

  function enqueue(workflowId, trigger, triggerData) {
    return new Promise((resolve, reject) => {
      queue.push({ workflowId, trigger, triggerData, resolve, reject });
      drainQueue();
    });
  }

  async function drainQueue() {
    while (activeCount < config.maxConcurrentExecutions && queue.length > 0) {
      const job = queue.shift();
      activeCount++;
      try {
        const result = await executeWorkflow(job.workflowId, job.trigger, job.triggerData);
        job.resolve(result);
      } catch (err) {
        job.reject(err);
      } finally {
        activeCount--;
        drainQueue();
      }
    }
  }

  async function executeWorkflow(workflowId, trigger = "manual", triggerData = {}) {
    if (running.has(workflowId)) {
      throw new Error("Workflow is already executing — concurrent runs are disabled for data integrity");
    }

    const workflow = db.prepare("SELECT * FROM workflows WHERE id = ?").get(workflowId);
    if (!workflow) throw new Error("Workflow not found");

    const nodes = JSON.parse(workflow.nodes);
    const connections = JSON.parse(workflow.connections);
    const validation = validateWorkflow(nodes, connections, nodeTypes);
    if (!validation.valid) throw new Error(`Workflow validation failed: ${validation.errors.join(" ")}`);

    const executionId = uuidv4();
    running.set(workflowId, executionId);

    db.prepare("INSERT INTO executions (id, workflow_id, status, trigger, trigger_data, started_at) VALUES (?, ?, 'running', ?, ?, datetime('now'))")
      .run(executionId, workflowId, trigger, JSON.stringify(triggerData));

    audit.log("execution.started", "execution", executionId, { workflowId, trigger });
    sendSSE({ type: "execution_start", executionId, workflowId, trigger });

    const nodeResults = {};
    const visited = new Set();
    let hasError = false;
    let errorMsg = null;
    const started = Date.now();

    async function executeNode(index, inputData) {
      if (Date.now() - started > config.executionTimeoutMs) throw new Error("Workflow execution timeout exceeded");
      if (visited.has(index) || !nodes[index]) return;
      visited.add(index);
      const node = nodes[index];
      const nodeType = nodeTypes[node.type];
      if (!nodeType) {
        nodeResults[node.id] = { error: `Unknown node type: ${node.type}`, status: "error" };
        hasError = true;
        errorMsg = nodeResults[node.id].error;
        return;
      }

      sendSSE({ type: "node_start", executionId, nodeId: node.id, nodeName: node.title });
      const nodeStarted = Date.now();

      try {
        const output = await nodeType.execute(node, inputData);
        nodeResults[node.id] = {
          output,
          status: "success",
          durationMs: Date.now() - nodeStarted,
        };
        sendSSE({ type: "node_end", executionId, nodeId: node.id, nodeName: node.title, output });
        db.prepare("INSERT INTO execution_events (id, execution_id, node_id, event_type, payload, created_at) VALUES (?, ?, ?, 'node_success', ?, datetime('now'))")
          .run(uuidv4(), executionId, node.id, JSON.stringify({ durationMs: nodeResults[node.id].durationMs }));
      } catch (err) {
        const friendly = friendlyError(err, { nodeName: node.title, nodeType: node.type });
        nodeResults[node.id] = { error: friendly, status: "error", durationMs: Date.now() - nodeStarted };
        hasError = true;
        errorMsg = friendly;
        sendSSE({ type: "node_error", executionId, nodeId: node.id, nodeName: node.title, error: friendly });
        db.prepare("INSERT INTO execution_events (id, execution_id, node_id, event_type, payload, created_at) VALUES (?, ?, ?, 'node_error', ?, datetime('now'))")
          .run(uuidv4(), executionId, node.id, JSON.stringify({ error: friendly }));
      }

      if (hasError) return;
      const downstream = connections.filter(([from]) => from === index);
      for (const [, to] of downstream) {
        await executeNode(to, nodeResults[node.id]?.output || {});
      }
    }

    try {
      const startIndices = connections.length === 0
        ? [0]
        : nodes.map((_, i) => i).filter((i) => !connections.some(([, to]) => to === i));
      const startInput = trigger === "webhook" ? triggerData : {};

      for (const idx of startIndices) {
        if (!hasError) await executeNode(idx, startInput);
      }

      const status = hasError ? "error" : "success";
      db.prepare("UPDATE executions SET status = ?, node_results = ?, error = ?, finished_at = datetime('now') WHERE id = ?")
        .run(status, JSON.stringify(nodeResults), errorMsg, executionId);

      audit.log("execution.finished", "execution", executionId, { workflowId, status, durationMs: Date.now() - started });
      sendSSE({ type: "execution_end", executionId, status, nodeResults, error: errorMsg });

      return { executionId, status, nodeResults, error: errorMsg };
    } finally {
      running.delete(workflowId);
    }
  }

  function isRunning(workflowId) {
    return running.has(workflowId);
  }

  return { executeWorkflow, enqueue, isRunning };
}

module.exports = { createExecutionEngine };