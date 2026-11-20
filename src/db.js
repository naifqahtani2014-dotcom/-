const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DIR, 'db.json');

let data = { guilds: {} };

function load() {
  fs.mkdirSync(DIR, { recursive: true });
  if (fs.existsSync(FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      if (!data.guilds) data.guilds = {};
    } catch (e) {
      console.error('تعذر قراءة db.json، سيتم البدء بقاعدة جديدة', e);
      data = { guilds: {} };
    }
  }
}

function save() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, FILE);
}

function defaults() {
  return {
    categoryId: null,
    staffRoles: [],
    ratingChannelId: null,
    pointsChannelId: null,
    pointsConfig: {
      perClaim: 1,
      // عدد التكتات المستلمة -> نقاط إضافية (مكافأة) عند الوصول له
      milestones: { 5: 5, 10: 7, 30: 20 },
    },
    counter: 0,
    tickets: {},
    staff: {},
  };
}

function guild(id) {
  if (!data.guilds[id]) data.guilds[id] = defaults();
  const g = data.guilds[id];
  const d = defaults();
  for (const k of Object.keys(d)) if (g[k] === undefined) g[k] = d[k];
  return g;
}

function staffStats(g, userId) {
  if (!g.staff[userId]) {
    g.staff[userId] = { points: 0, claimed: 0, ratingSum: 0, ratingCount: 0 };
  }
  return g.staff[userId];
}

function ids() {
  return Object.keys(data.guilds);
}

load();

module.exports = { guild, staffStats, save, ids };
