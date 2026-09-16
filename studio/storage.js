/* ═══════════════════════════════════════════════════════════════
   DemoStudio Multi-Demo Persistent Storage Engine
   Manages demos catalog and disk persistence in demos/
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const DEMOS_DIR = path.join(__dirname, '..', 'demos');
const CATALOG_FILE = path.join(DEMOS_DIR, 'catalog.json');

// Ensure directory exists
function ensureDir() {
  if (!fs.existsSync(DEMOS_DIR)) {
    fs.mkdirSync(DEMOS_DIR, { recursive: true });
  }
}

// Seed starter demo if catalog is empty
function getInitialCatalog() {
  const now = new Date().toISOString();
  return [
    {
      id: 'demo_pulse_metrics',
      name: 'PulseMetrics Analytics Platform Tour',
      targetUrl: 'http://localhost:3200',
      description: 'Comprehensive guided walkthrough of executive KPI dashboards, ARR growth, and conversion funnels.',
      status: 'Published',
      accent: '#005ac1',
      createdAt: now,
      updatedAt: now,
      screensCount: 2,
      stepsCount: 5,
      viewsCount: 42,
      leadsCount: 6,
      config: {
        appName: 'PulseMetrics',
        accent: '#005ac1',
        launchTitle: 'Welcome to PulseMetrics Demo',
        launchBody: 'Discover how top SaaS engineering teams monitor latency, errors, and system health in real time.',
        startLabel: 'Explore Platform',
        chapters: [
          {
            title: 'Executive Overview',
            steps: [
              {
                title: 'Live Metrics Overview',
                body: 'Review monthly recurring revenue, retention, and real-time active user telemetry.',
                sel: '#dashboard',
                pos: 'bottom',
                action: false
              },
              {
                title: 'Drill Into Performance',
                body: 'Click the primary analytics action to inspect real-time query throughput.',
                sel: 'button.btn-primary',
                pos: 'bottom',
                action: true
              }
            ]
          },
          {
            title: 'Telemetry & Integrations',
            steps: [
              {
                title: 'Real-Time Event Stream',
                body: 'Inspect live API events flowing across cloud microservices.',
                sel: 'table',
                pos: 'top',
                action: false
              }
            ]
          }
        ]
      },
      screens: {
        screen_1: {
          id: 'screen_1',
          name: 'Main Executive View',
          meta: { title: 'PulseMetrics - Executive Dashboard' }
        }
      }
    },
    {
      id: 'demo_qlytics_saas',
      name: 'Qlytics AI Growth Walkthrough',
      targetUrl: 'https://qlytics.lavenai.com',
      description: 'Interactive product demo showcasing autonomous AI marketing analytics and audience segment builder.',
      status: 'Draft',
      accent: '#6750a4',
      createdAt: now,
      updatedAt: now,
      screensCount: 1,
      stepsCount: 4,
      viewsCount: 18,
      leadsCount: 2,
      config: {
        appName: 'Qlytics AI',
        accent: '#6750a4',
        launchTitle: 'Experience Qlytics AI',
        launchBody: 'See how predictive intelligence transforms your customer retention metrics.',
        startLabel: 'Start Walkthrough',
        chapters: [
          {
            title: 'Predictive Insights',
            steps: [
              {
                title: 'Explore AI Predictions',
                body: 'View automated recommendations for reducing customer churn and boosting lifetime value.',
                sel: 'main',
                pos: 'bottom',
                action: false
              }
            ]
          }
        ]
      },
      screens: {
        screen_qlytics_1: {
          id: 'screen_qlytics_1',
          name: 'Insights Console',
          meta: { title: 'Qlytics' }
        }
      }
    }
  ];
}

function loadCatalog() {
  ensureDir();
  if (!fs.existsSync(CATALOG_FILE)) {
    const initial = getInitialCatalog();
    saveCatalog(initial);
    return initial;
  }
  try {
    const raw = fs.readFileSync(CATALOG_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('[Storage Error] Failed to read catalog.json:', e);
    return [];
  }
}

function saveCatalog(catalog) {
  ensureDir();
  try {
    fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2), 'utf8');
  } catch (e) {
    console.error('[Storage Error] Failed to save catalog.json:', e);
  }
}

function listDemos() {
  const catalog = loadCatalog();
  return catalog.map(d => ({
    id: d.id,
    name: d.name,
    targetUrl: d.targetUrl,
    description: d.description || '',
    status: d.status || 'Draft',
    accent: d.accent || '#005ac1',
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    screensCount: d.screensCount || (d.screens ? Object.keys(d.screens).length : 0),
    stepsCount: d.stepsCount || (d.config?.chapters?.reduce((a, c) => a + (c.steps?.length || 0), 0) || 0),
    viewsCount: d.viewsCount || 0,
    leadsCount: d.leadsCount || 0
  }));
}

function getDemo(id) {
  const catalog = loadCatalog();
  return catalog.find(d => d.id === id) || null;
}

function createDemo(data) {
  const catalog = loadCatalog();
  const now = new Date().toISOString();
  const id = 'demo_' + Date.now();
  const newDemo = {
    id,
    name: data.name || 'New Product Demo',
    targetUrl: data.targetUrl || 'http://localhost:3200',
    description: data.description || '',
    status: 'Draft',
    accent: data.accent || '#005ac1',
    createdAt: now,
    updatedAt: now,
    screensCount: 0,
    stepsCount: 0,
    viewsCount: 0,
    leadsCount: 0,
    config: data.config || {
      appName: data.name || 'Interactive Demo',
      accent: data.accent || '#005ac1',
      chapters: []
    },
    screens: data.screens || {}
  };
  catalog.unshift(newDemo);
  saveCatalog(catalog);
  return newDemo;
}

function updateDemo(id, updates) {
  const catalog = loadCatalog();
  const idx = catalog.findIndex(d => d.id === id);
  if (idx === -1) return null;

  const current = catalog[idx];
  const updated = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString()
  };

  // Re-calculate counts
  if (updated.config?.chapters) {
    updated.stepsCount = updated.config.chapters.reduce((a, c) => a + (c.steps?.length || 0), 0);
  }
  if (updated.screens) {
    updated.screensCount = Object.keys(updated.screens).length;
  }

  catalog[idx] = updated;
  saveCatalog(catalog);
  return updated;
}

function duplicateDemo(id) {
  const catalog = loadCatalog();
  const source = catalog.find(d => d.id === id);
  if (!source) return null;

  const now = new Date().toISOString();
  const newId = 'demo_' + Date.now();
  const cloned = JSON.parse(JSON.stringify(source));
  cloned.id = newId;
  cloned.name = cloned.name + ' (Copy)';
  cloned.createdAt = now;
  cloned.updatedAt = now;
  cloned.viewsCount = 0;
  cloned.leadsCount = 0;
  cloned.status = 'Draft';

  catalog.unshift(cloned);
  saveCatalog(catalog);
  return cloned;
}

function deleteDemo(id) {
  const catalog = loadCatalog();
  const filtered = catalog.filter(d => d.id !== id);
  if (filtered.length === catalog.length) return false;
  saveCatalog(filtered);
  return true;
}

function getStats() {
  const catalog = loadCatalog();
  let totalScreens = 0;
  let totalSteps = 0;
  let totalViews = 0;
  let totalLeads = 0;

  catalog.forEach(d => {
    totalScreens += d.screensCount || (d.screens ? Object.keys(d.screens).length : 0);
    totalSteps += d.stepsCount || (d.config?.chapters?.reduce((a, c) => a + (c.steps?.length || 0), 0) || 0);
    totalViews += d.viewsCount || 0;
    totalLeads += d.leadsCount || 0;
  });

  return {
    totalDemos: catalog.length,
    totalScreens,
    totalSteps,
    totalViews,
    totalLeads
  };
}

module.exports = {
  listDemos,
  getDemo,
  createDemo,
  updateDemo,
  duplicateDemo,
  deleteDemo,
  getStats,
  DEMOS_DIR
};
