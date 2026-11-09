(() => {
  const storageKey = 'aacrt_pages_scores_v1';
  const seed = fetch('./papers.json').then(response => {
    if (!response.ok) throw Error('無法載入示範資料');
    return response.json();
  });

  async function getData() {
    const data = structuredClone(await seed);
    const changes = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const groups = new Map();

    for (const paper of data.papers) {
      const scores = new Map(paper.scores.map(score => [score.judge, score]));
      for (const score of Object.values(changes)) {
        if (score.paper_id === paper.id) scores.set(score.judge, score);
      }
      paper.scores = [...scores.values()];
      const totals = paper.scores
        .filter(score => score.values.every(value => value !== null))
        .map(score => score.values.reduce((sum, value) => sum + value, 0));
      paper.judge_count = paper.scores.length;
      paper.complete_count = totals.length;
      paper.average = totals.length ? totals.reduce((sum, value) => sum + value, 0) / totals.length : null;
      paper.rank = null;
      if (!groups.has(paper.group)) groups.set(paper.group, []);
      if (paper.average !== null) groups.get(paper.group).push(paper);
    }

    for (const group of groups.values()) {
      group.sort((a, b) => b.average - a.average);
      group.forEach((paper, index) => {
        const previous = group[index - 1];
        paper.rank = previous?.average === paper.average ? previous.rank : index + 1;
      });
    }
    return data;
  }

  async function request(path, options) {
    if (path === '/api/papers') return { ok: true, json: getData };
    if (path !== '/api/score') {
      return { ok: false, json: async () => ({ error: '此操作僅適用於正式版' }) };
    }

    const score = JSON.parse(options.body);
    const data = await seed;
    const paper = data.papers.find(item => item.id === score.paper_id);
    if (!paper) return { ok: false, json: async () => ({ error: '找不到作品' }) };
    const criteria = data.criteria[paper.kind === 'poster' ? 'poster' : 'oral'];
    const values = score.values;
    if (!score.judge.trim() || values.length !== criteria.length || values.every(value => value === null)
      || values.some((value, i) => value !== null && (!Number.isFinite(value) || value < 0 || value > criteria[i][1]))) {
      return { ok: false, json: async () => ({ error: '請確認評審姓名及各項分數' }) };
    }

    score.updated_at = new Date().toISOString();
    const changes = JSON.parse(localStorage.getItem(storageKey) || '{}');
    changes[JSON.stringify([score.paper_id, score.judge])] = score;
    localStorage.setItem(storageKey, JSON.stringify(changes));
    return { ok: true, json: async () => ({ preview: true }) };
  }

  // Prefix user-entered formula-like cells so opening the CSV in Excel keeps them as text.
  function csvCell(value) {
    let cell = String(value ?? '');
    if (/^\s*[=+\-@\t\r\n＝＋－＠]/.test(cell)) cell = "'" + cell;
    return '"' + cell.replaceAll('"', '""') + '"';
  }

  async function download(event) {
    event.preventDefault();
    try {
      const { papers } = await getData();
      const rows = [['組別', '名次', '論文編號', '作品名稱', '完整評分平均', '評審', '項目1', '項目2', '項目3', '項目4', '項目5', '備註']];
      for (const paper of papers) {
        for (const score of paper.scores) {
          rows.push([paper.group, paper.rank, paper.id, paper.title, paper.average?.toFixed(2),
            score.judge, ...score.values, score.comment]);
        }
      }
      const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = Object.assign(document.createElement('a'), { href: url, download: 'AACRT-demo-scores.csv' });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast('無法匯出示範評分');
    }
  }

  window.aacrtPreview = { request };
  document.querySelector('#previewDownload').addEventListener('click', download);
})();
