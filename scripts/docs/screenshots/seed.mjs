// Demo data for the custom-fields screenshots, created through the REST API (never run this against real data).
// Idempotent: fields and the project are reused when they already exist.
//
//   DOCS_API_URL   API base, default http://localhost:8601/api/v1
//   DOCS_USER / DOCS_PASSWORD   a superuser of that throw-away instance

export const PROJECT_NAME = 'Atlas warehouse rollout';

export async function login(api, user, password) {
  const res = await fetch(`${api}/login/access-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: user, password }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

function client(api, token) {
  return async (method, path, body) => {
    const res = await fetch(`${api}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  };
}

/** Create the field unless one with that name exists in the list; return it either way. */
async function ensureField(call, listPath, createPath, existing, body) {
  const found = existing.find((d) => d.name === body.name && d.applies_to === body.applies_to);
  if (found) return found;
  return call('POST', createPath, body);
}

export async function seed(api, token) {
  const call = client(api, token);

  // Global fields: every project gets these
  const globals = await call('GET', '/custom-fields');
  const g = (body) => ensureField(call, '/custom-fields', '/custom-fields', globals, body);
  const budget = await g({ name: 'Approved budget', field_type: 'currency', applies_to: 'project', min_value: 0, decimals: 2 });
  const signed = await g({ name: 'Contract signed', field_type: 'checkbox', applies_to: 'project' });
  const effort = await g({ name: 'Effort', field_type: 'number', applies_to: 'task', unit: 'h', min_value: 0, max_value: 200, decimals: 1 });

  // A project with its own fields on top
  const projects = await call('GET', '/projects/');
  let project = projects.find((p) => p.name === PROJECT_NAME);
  if (!project) {
    project = await call('POST', '/projects/', {
      name: PROJECT_NAME,
      description: 'Move the three regional warehouses onto the new stock system.',
      status: 'In Progress',
      priority: 'High',
      budget: 180000,
      real_cost: 64250,
    });
  }
  const own = await call('GET', `/projects/${project.id}/custom-fields`);
  const base = `/projects/${project.id}/custom-fields`;
  const p = (body) => ensureField(call, base, base, own.filter((d) => d.scope === 'project'), body);
  const costCentre = await p({ name: 'Cost centre', field_type: 'select', applies_to: 'project', options: ['R&D', 'Operations', 'Sales'] });
  const portal = await p({ name: 'Client portal', field_type: 'url', applies_to: 'project' });
  const kickoff = await p({ name: 'Kick-off', field_type: 'date', applies_to: 'project' });
  const weight = await p({ name: 'Pallet weight', field_type: 'number', applies_to: 'task', unit: 'kg', min_value: 0, decimals: 0 });
  const vendorCost = await p({ name: 'Vendor quote', field_type: 'currency', applies_to: 'task', currency: 'USD', decimals: 2 });
  const reviewed = await p({ name: 'Reviewed', field_type: 'checkbox', applies_to: 'task' });

  project = await call('PUT', `/projects/${project.id}`, {
    custom_values: {
      [budget.id]: 175000,
      [signed.id]: true,
      [costCentre.id]: 'Operations',
      [portal.id]: 'https://atlas.example.com/portal',
      [kickoff.id]: '2026-09-14',
    },
  });

  const tasks = await call('GET', `/tasks/?project_id=${project.id}`).catch(() => []);
  const tasksWanted = [
    ['Survey north warehouse racks', { [effort.id]: 12.5, [weight.id]: 820, [reviewed.id]: true }],
    ['Order barcode scanners', { [effort.id]: 4, [vendorCost.id]: 18450.5, [reviewed.id]: false }],
    ['Migrate stock master data', { [effort.id]: 36, [reviewed.id]: true }],
    ['Train shift leads', { [effort.id]: 16, [weight.id]: 0 }],
  ];
  const titles = new Set((Array.isArray(tasks) ? tasks : []).map((t) => t.title));
  const today = new Date();
  for (const [i, [title, custom_values]] of tasksWanted.entries()) {
    if (titles.has(title)) continue;
    const start = new Date(today.getTime() + i * 3 * 86400000);
    const due = new Date(start.getTime() + 4 * 86400000);
    await call('POST', '/tasks/', {
      title,
      project_id: project.id,
      status: i === 0 ? 'Done' : i === 1 ? 'In Progress' : 'Todo',
      start_date: start.toISOString(),
      due_date: due.toISOString(),
      budget: [2400, 19000, 6800, 3200][i],
      real_cost: [2150, 18450, 0, 0][i],
      custom_values,
    });
  }
  return { project, fields: { budget, signed, effort, costCentre, portal, kickoff, weight, vendorCost, reviewed } };
}

// Run directly: node seed.mjs
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('seed.mjs')) {
  const api = process.env.DOCS_API_URL || 'http://localhost:8601/api/v1';
  const token = await login(api, process.env.DOCS_USER, process.env.DOCS_PASSWORD);
  const { project } = await seed(api, token);
  console.log(`seeded project ${project.id}`);
}
