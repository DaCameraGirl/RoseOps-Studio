function validateWorkflow(nodes, connections, nodeTypes) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(nodes) || nodes.length === 0) {
    errors.push("Workflow must contain at least one node.");
    return { valid: false, errors, warnings };
  }

  if (!Array.isArray(connections)) {
    errors.push("Connections must be an array.");
    return { valid: false, errors, warnings };
  }

  const idSet = new Set();
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node.id) errors.push(`Node at index ${i} is missing an id.`);
    if (!node.type) errors.push(`Node "${node.title || i}" is missing a type.`);
    if (node.id) {
      if (idSet.has(node.id)) errors.push(`Duplicate node id: ${node.id}`);
      idSet.add(node.id);
    }
    if (node.type && !nodeTypes[node.type]) {
      errors.push(`Unknown node type "${node.type}" on node "${node.title || node.id}".`);
    }
    if (nodeTypes[node.type]?.validate) {
      const nodeErrors = nodeTypes[node.type].validate(node);
      errors.push(...nodeErrors.map((e) => `${node.title || node.type}: ${e}`));
    }
  }

  for (const conn of connections) {
    if (!Array.isArray(conn) || conn.length !== 2) {
      errors.push("Each connection must be a [fromIndex, toIndex] pair.");
      continue;
    }
    const [from, to] = conn;
    if (!Number.isInteger(from) || !Number.isInteger(to)) {
      errors.push(`Invalid connection indices: [${from}, ${to}]`);
      continue;
    }
    if (from < 0 || from >= nodes.length || to < 0 || to >= nodes.length) {
      errors.push(`Connection [${from}, ${to}] references out-of-range node indices.`);
    }
    if (from === to) errors.push(`Node cannot connect to itself (index ${from}).`);
  }

  const adj = new Map();
  for (const [from, to] of connections) {
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from).push(to);
  }

  const visiting = new Set();
  const visited = new Set();
  function hasCycle(v) {
    if (visiting.has(v)) return true;
    if (visited.has(v)) return false;
    visiting.add(v);
    for (const next of adj.get(v) || []) {
      if (hasCycle(next)) return true;
    }
    visiting.delete(v);
    visited.add(v);
    return false;
  }
  for (let i = 0; i < nodes.length; i++) {
    if (hasCycle(i)) {
      errors.push("Workflow contains a cycle — graphs must be acyclic (DAG).");
      break;
    }
  }

  const hasIncoming = new Set(connections.map(([, to]) => to));
  const roots = nodes.map((_, i) => i).filter((i) => !hasIncoming.has(i));
  if (connections.length > 0 && roots.length === 0) {
    errors.push("No entry node found — at least one node must have no incoming connections.");
  }

  const triggers = nodes.filter((n) => n.type === "trigger" || n.type === "webhook" || n.type === "schedule");
  if (triggers.length === 0) warnings.push("No trigger, webhook, or schedule node — workflow can only be run manually.");

  return { valid: errors.length === 0, errors, warnings };
}

module.exports = { validateWorkflow };